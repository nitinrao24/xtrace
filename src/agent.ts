/**
 * The service agent.
 *
 * Every question it answers goes through the same four steps, in this order:
 *
 *   1  recall     union of the asker's own memory and the floor's shared memory
 *   2  trigger    procedural directives that fire on the action about to run
 *   3  vault      guest medical facts, decrypted locally, only if a guest is named
 *   4  act        answer from the assembled brief, then write back what changed
 *
 * Step 2 is the one that makes the agent get better rather than just bigger. It
 * is not a search — it is a tripwire on the concrete identifiers in the pending
 * action, so a rule learned three services ago fires the instant the same tool
 * comes up again, whether or not anyone thought to ask about it.
 */

import type { MemoryStore, Scope } from "./memory/store.ts";
import type { Vault } from "./memory/vault.ts";
import { route, redact } from "./memory/router.ts";
import type { Arm, Probe, ProbeResult, ServiceAction, Turn } from "./types.ts";

/** Maps a question to the tool the agent is about to run. Drives the tripwire. */
const ACTION_MAP: Array<{ match: RegExp; tool: string; args: (q: string) => Record<string, unknown> }> = [
  { match: /fire|second wave|wave|ticket|covers/i, tool: "fire_ticket", args: (q) => ({ second_wave: /second wave|wave/i.test(q), table: tableOf(q) }) },
  { match: /fry|churro|calamari|dessert|cheesecake/i, tool: "fry_station", args: () => ({ station: "fry_station" }) },
  { match: /pour|wine|pairing|drink|cider|alcohol|bar/i, tool: "pour_drink", args: () => ({ pairing: true }) },
  { match: /temp log|walk-?in|compressor|41/i, tool: "check_walkin", args: () => ({ station: "check_walkin" }) },
  { match: /scallop|grill|charcoal/i, tool: "fire_ticket", args: () => ({ station: "grill_station" }) },
  { match: /press|book|reservation|doors|counter|walked in/i, tool: "open_doors", args: () => ({ station: "seat_guest" }) },
  { match: /brief|setting the room|setup|before service|before I take/i, tool: "seat_guest", args: (q) => ({ table: tableOf(q) }) },
];

function tableOf(q: string): string | undefined {
  const m = q.match(/table\s*(\d+)|\bon\s*(\d+)\b/i);
  const n = m?.[1] ?? m?.[2];
  return n ? `table:${n}` : undefined;
}

export function actionFor(query: string): ServiceAction {
  for (const entry of ACTION_MAP) {
    if (entry.match.test(query)) {
      const args = entry.args(query);
      // Drop undefined args so the tripwire only sees real identifiers.
      for (const k of Object.keys(args)) if (args[k] === undefined) delete args[k];
      return { tool: entry.tool, args };
    }
  }
  return { tool: "answer_question", args: {} };
}

export interface Brief {
  context: string;
  sources: { personal: number; shared: number; vault: number; directives: number };
  directiveText: string[];
  sharedLines: string[];
  vaultLines: string[];
}

export interface AgentDeps {
  store: MemoryStore;
  vault: Vault;
  groups: Record<string, string>;
  arm: Arm;
}

export class ServiceAgent {
  private windowLines: string[] = [];
  private deps: AgentDeps;

  constructor(deps: AgentDeps) {
    this.deps = deps;
  }

  /** Clears the in-context window. Called between services. */
  newService(): void {
    this.windowLines = [];
  }

  private scopes(userId: string): { personal: Scope; shared: Scope } {
    const { groups, arm } = this.deps;
    if (arm === "pooled") {
      // One bucket for everything. No per-user scope, no topical separation.
      return { personal: { user_id: userId }, shared: { group_ids: [groups.pooled!] } };
    }
    return {
      personal: { user_id: userId },
      shared: { group_ids: [groups.service!, groups.playbook!].filter(Boolean) },
    };
  }

  /** Steps 1 to 3: assemble everything the agent should know before it acts. */
  async brief(query: string, userId: string): Promise<Brief> {
    const { store, vault, arm } = this.deps;

    if (arm === "blind") {
      return {
        context: this.windowLines.length ? this.windowLines.join("\n") : "",
        sources: { personal: 0, shared: 0, vault: 0, directives: 0 },
        directiveText: [],
        sharedLines: [],
        vaultLines: [],
      };
    }

    const { personal, shared } = this.scopes(userId);

    // 1 — union read. Axes AND inside a pool, pools OR across.
    const recalled = await store.recall(query, [personal, shared], 12);
    const sharedLines = recalled.memories.filter((m) => (m.group_ids ?? []).length > 0).map((m) => m.text);

    // 2 — tripwire. Only Mise runs this; the pooled baseline has no procedural layer.
    let directiveText: string[] = [];
    if (arm === "mise") {
      const action = actionFor(query);
      const fired = await store.trigger(action, shared, query);
      directiveText = fired.rows.map((r) => r.text);
    }

    // 3 — vault.
    //
    // The two halves are joined by name, not by id. Hosted memory holds the
    // pointer — "Ines Barros is on table 3 tonight" — and the vault holds the
    // payload the pointer implies. So the vault query is the question plus every
    // proper name the hosted read just surfaced. Without that expansion a server
    // asking "can I use the same fryer?" never reaches the coeliac record,
    // because the record does not contain the word fryer.
    let vaultLines: string[] = [];
    if (arm === "mise") {
      const names = properNames([query, ...recalled.memories.map((m) => m.text)]);
      const hits = await vault.query([query, ...names].join(" "), 5);
      vaultLines = hits.map((h) => h.text);
    }

    const parts: string[] = [];
    if (recalled.prompt && recalled.memories.length) parts.push(recalled.prompt);
    if (directiveText.length) {
      parts.push("House procedure, learned in earlier services:\n" + directiveText.map((d) => `- ${d}`).join("\n"));
    }
    if (vaultLines.length) {
      parts.push("Guest care, from the encrypted vault (do not repeat aloud):\n" + vaultLines.map((v) => `- ${v}`).join("\n"));
    }
    if (this.windowLines.length) parts.push("Tonight so far:\n" + this.windowLines.join("\n"));

    return {
      context: parts.join("\n\n"),
      sources: {
        personal: recalled.memories.length - sharedLines.length,
        shared: sharedLines.length,
        vault: vaultLines.length,
        directives: directiveText.length,
      },
      directiveText,
      sharedLines,
      vaultLines,
    };
  }

  /** Step 4: write back what tonight changed. */
  async learn(turn: Turn, convId: string): Promise<void> {
    const { store, vault, groups, arm } = this.deps;
    const body = turn.messages.map((m) => m.content).join(" ");
    this.windowLines.push(...turn.messages.filter((m) => m.role === "user").map((m) => `- ${m.content}`));

    if (arm === "blind") return;

    if (arm === "pooled") {
      // Everything into the single catch-all, unrouted. This is the shortcut most
      // agents take, and it is why the leak counter moves.
      await store.ingest({
        messages: turn.messages,
        user_id: turn.user_id,
        conv_id: convId,
        group_ids: [groups.pooled!],
      });
      return;
    }

    // Mise: route each line first. Medical facts never reach the hosted service.
    const routed = route(body);
    const local = routed.filter((r) => r.destination === "vault");
    const hosted = routed.filter((r) => r.destination === "hosted");

    if (local.length) {
      await vault.put(local.map((l) => ({ text: l.text, guest_id: turn.guest_id, tags: ["guest-care"] })));
    }

    if (hosted.length) {
      await store.ingest({
        messages: [
          { role: "user", content: hosted.map((h) => h.text).join(" ") },
          { role: "assistant", content: "Noted." },
        ],
        user_id: turn.user_id,
        conv_id: convId,
        group_ids: turn.groups.map((g) => groups[g]!).filter(Boolean),
      });
    }
  }

  /**
   * End of service. The debrief goes in on the agentic path, which runs the
   * second facts-only pass that captures situated directives — the lessons and
   * procedures tomorrow's tripwire fires on.
   */
  async debrief(text: string, userId: string, convId: string): Promise<number> {
    const { store, groups, arm } = this.deps;
    if (arm === "blind") return 0;

    const groupIds = arm === "pooled"
      ? [groups.pooled!]
      : [groups.service!, groups.playbook!].filter(Boolean);

    // The baseline ingests the debrief verbatim, diagnosis and all. Mise strips
    // the condition and keeps the category, so the procedure is still shareable
    // and still fires, without a guest's medical record riding along with it.
    const body = arm === "mise" ? redact(text).text : text;

    const res = await store.ingest({
      messages: [
        { role: "user", content: body },
        { role: "assistant", content: "Recorded as house procedure." },
      ],
      user_id: userId,
      conv_id: convId,
      group_ids: groupIds,
      agentic: arm === "mise",
    });

    return res.created.filter((c) => c.type === "lesson" || c.type === "procedure").length;
  }

  /** Scores one probe against the brief the agent actually assembled. */
  async answer(probe: Probe): Promise<ProbeResult> {
    const brief = await this.brief(probe.query, probe.user_id);
    const haystack = brief.context.toLowerCase();

    const hits: string[] = [];
    const misses: string[] = [];
    for (const key of probe.must_recall) {
      if (matches(haystack, key)) hits.push(key);
      else misses.push(key);
    }

    // A leak is third-party medical data arriving from the shared, cross-user
    // pool. The same fact surfacing from the local vault is the system working.
    const leaks = brief.sharedLines.filter((line) => route(line).some((r) => r.destination === "vault"));

    return {
      query: probe.query,
      asker: probe.user_id,
      fidelity: probe.must_recall.length ? hits.length / probe.must_recall.length : 1,
      hits,
      misses,
      leaks,
      directives: brief.directiveText,
      recalledCount: brief.sources.personal + brief.sources.shared + brief.sources.vault,
    };
  }
}

/**
 * Capitalised words that are not sentence-initial — good enough for guest names
 * in service chatter, and it never has to be perfect: a spurious name costs one
 * extra local lookup against an encrypted store that is already in memory.
 */
function properNames(texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const words = sentence.trim().split(/\s+/);
      words.forEach((w, i) => {
        const clean = w.replace(/[^A-Za-z'-]/g, "");
        if (clean.length > 2 && /^[A-Z]/.test(clean) && i > 0) found.add(clean);
      });
    }
  }
  return [...found];
}

/** Substring match with a short stem, so "coeliac" hits "coeliacs". */
function matches(haystack: string, key: string): boolean {
  const k = key.toLowerCase();
  if (haystack.includes(k)) return true;
  if (k.length > 5 && haystack.includes(k.slice(0, k.length - 1))) return true;
  return false;
}
