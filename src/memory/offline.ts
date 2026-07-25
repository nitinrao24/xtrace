/**
 * Offline memory service.
 *
 * Mirrors the surface of `client.memories` / `client.groups` closely enough that
 * `src/memory/store.ts` can swap between this and the real SDK without the rest
 * of the codebase knowing. It exists for one reason: a demo that works when the
 * conference wifi does not.
 *
 * What it emulates, and where the real service differs:
 *   ingest    - one fact per substantive turn. The real pipeline is an LLM and
 *               will split, merge, and supersede far more intelligently.
 *   directives- phrase-matched onto tool anchors. The real `agentic: true` pass
 *               extracts trigger entities itself.
 *   the gate  - keyword list. The real personal-vs-shareable judgement is a model
 *               call that fails closed.
 *   search    - lexical overlap, no embeddings.
 *
 * Anything this file gets wrong, the hosted service gets right. It is a fallback,
 * not a reimplementation.
 */

import { randomUUID } from "node:crypto";
import type { MemoryRow } from "../types.ts";

// --------------------------------------------------------------------- lexicons

/**
 * The personal gate. Content touching health, family circumstance, recovery, or
 * finances never crosses into a group — the same rule the hosted service applies
 * server-side before any tagging happens.
 */
const PERSONAL_MARKERS = [
  "allerg", "epi-pen", "epipen", "coeliac", "celiac", "chemotherapy", "chemo",
  "in recovery", "must never be offered alcohol", "medical", "diagnosis",
  "medication", "hospital", "illness", "pregnan",
];

/** Phrases that turn a debrief line into a standing directive, and what it fires on. */
const DIRECTIVE_ANCHORS: Array<{ match: RegExp; entities: string[]; kind: "lesson" | "procedure" }> = [
  { match: /second wave|first wave|double.?fired|two waves/i, entities: ["fire_ticket", "second_wave"], kind: "procedure" },
  { match: /reservation book|known press|before doors|pre.?service check/i, entities: ["open_doors", "seat_guest"], kind: "procedure" },
  { match: /alcohol|pairing|wine pour|madeira/i, entities: ["pour_drink", "send_ticket"], kind: "lesson" },
  { match: /fry station|fryer|cross.?contam|dedicated basket/i, entities: ["fry_station", "send_dessert"], kind: "procedure" },
  { match: /temp log|compressor|41f|raw fish/i, entities: ["check_walkin", "send_ticket"], kind: "procedure" },
  { match: /scallop|wood grill|charcoal/i, entities: ["fire_ticket", "grill_station"], kind: "lesson" },
];

const DIRECTIVE_TRIGGERS = /going forward|from now on|new procedure|standing|escalate it|never|always|before any|whenever/i;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "it",
  "we", "i", "do", "does", "what", "how", "at", "be", "that", "this", "with", "my",
  "me", "you", "have", "has", "was", "were", "not", "but", "if", "so", "as", "can",
  "need", "know", "get", "got", "any", "all", "out", "up", "down", "am", "pm",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function isPersonal(text: string): boolean {
  const lower = text.toLowerCase();
  return PERSONAL_MARKERS.some((m) => lower.includes(m));
}

// --------------------------------------------------------------------- store

interface Row extends MemoryRow {
  id: string;
  type: "fact" | "episode" | "artifact" | "lesson" | "procedure";
  text: string;
  user_id: string;
  conv_id: string;
  group_ids: string[];
  namespace?: string;
  app_id?: string;
  agent_id?: string;
  personal: boolean;
  trigger_entities: string[];
  created_at: string;
  details: Record<string, unknown>;
}

interface GroupRow {
  id: string;
  name: string;
  prompt: string | null;
  status: "active" | "archived";
}

export interface OfflineIngestBody {
  messages: Array<{ role: string; content: string }>;
  user_id: string;
  conv_id: string;
  group_ids?: string[];
  namespace?: string;
  app_id?: string;
  agent_id?: string;
  agentic?: boolean;
}

export class OfflineMemory {
  private rows: Row[] = [];
  private groups: GroupRow[] = [];

  // ---------------------------------------------------------------- groups

  createGroup(body: { name: string; prompt?: string | null }): GroupRow {
    const g: GroupRow = {
      id: `grp_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
      name: body.name,
      prompt: body.prompt ?? null,
      status: "active",
    };
    this.groups.push(g);
    return g;
  }

  listGroups(): GroupRow[] {
    return [...this.groups];
  }

  private groupName(id: string): string {
    return this.groups.find((g) => g.id === id)?.name ?? id;
  }

  /**
   * Prompted groups take a memory when its prompt keywords overlap the text.
   * Catch-alls take everything shareable. Personal never crosses either way.
   */
  private tagsFor(text: string, requested: string[]): string[] {
    if (isPersonal(text)) return [];
    const t = new Set(tokens(text));
    const out: string[] = [];
    for (const id of requested) {
      const g = this.groups.find((x) => x.id === id);
      if (!g || g.status !== "active") continue;
      if (g.prompt === null) {
        out.push(id);
        continue;
      }
      const overlap = tokens(g.prompt).filter((w) => t.has(w)).length;
      if (overlap >= 2) out.push(id);
    }
    return out;
  }

  // ---------------------------------------------------------------- ingest

  ingest(body: OfflineIngestBody): {
    memories_created: Array<{ id: string; type: string; text: string }>;
    ignored_group_ids: string[];
  } {
    const requested = body.group_ids ?? [];
    const known = new Set(this.groups.filter((g) => g.status === "active").map((g) => g.id));
    const ignored = requested.filter((id) => !known.has(id));
    const created: Array<{ id: string; type: string; text: string }> = [];

    const substantive = body.messages.filter(
      (m) => m.role === "user" && m.content.trim().length > 12,
    );

    for (const msg of substantive) {
      const text = msg.content.trim();
      const directive = body.agentic === true && DIRECTIVE_TRIGGERS.test(text);

      if (directive) {
        // A debrief can carry several standing rules. Emit one per anchor hit.
        const anchors = DIRECTIVE_ANCHORS.filter((a) => a.match.test(text));
        const hits = anchors.length ? anchors : [{ entities: ["service"], kind: "lesson" as const, match: /./ }];
        for (const anchor of hits) {
          created.push(this.push({
            type: anchor.kind,
            text,
            body,
            requested,
            trigger_entities: anchor.entities,
          }));
        }
        continue;
      }

      created.push(this.push({ type: "fact", text, body, requested, trigger_entities: [] }));
    }

    // Sessions get an episode, the same way the hosted pipeline summarises a stretch of turns.
    if (substantive.length >= 3) {
      const summary = `Session ${body.conv_id}: ${substantive.length} turns covering ${
        substantive.map((m) => tokens(m.content)[0]).filter(Boolean).slice(0, 5).join(", ")
      }.`;
      created.push(this.push({ type: "episode", text: summary, body, requested, trigger_entities: [] }));
    }

    return { memories_created: created, ignored_group_ids: ignored };
  }

  private push(args: {
    type: Row["type"];
    text: string;
    body: OfflineIngestBody;
    requested: string[];
    trigger_entities: string[];
  }): { id: string; type: string; text: string } {
    const { type, text, body, requested, trigger_entities } = args;
    const row: Row = {
      id: randomUUID(),
      type,
      text,
      user_id: body.user_id,
      conv_id: body.conv_id,
      group_ids: this.tagsFor(text, requested),
      namespace: body.namespace,
      app_id: body.app_id,
      agent_id: body.agent_id,
      personal: isPersonal(text),
      trigger_entities,
      created_at: new Date().toISOString(),
      details: trigger_entities.length
        ? { fact_type: type, trigger_entities, observation_count: 1 }
        : { fact_type: type },
    };
    this.rows.push(row);
    return { id: row.id, type: row.type, text: row.text };
  }

  // ---------------------------------------------------------------- search

  /** Scope by what you pass: every axis supplied AND-narrows, omitted axes are free. */
  private scoped(scope: {
    user_id?: string;
    group_ids?: string[];
    app_id?: string;
    agent_id?: string;
  }): Row[] {
    return this.rows.filter((r) => {
      if (scope.user_id && r.user_id !== scope.user_id) return false;
      if (scope.app_id && r.app_id !== scope.app_id) return false;
      if (scope.agent_id && r.agent_id !== scope.agent_id) return false;
      if (scope.group_ids?.length) {
        if (!r.group_ids.some((g) => scope.group_ids!.includes(g))) return false;
      }
      return true;
    });
  }

  search(body: {
    query: string;
    user_id?: string;
    group_ids?: string[];
    app_id?: string;
    agent_id?: string;
    limit?: number;
  }): { data: MemoryRow[]; context: string } {
    const q = tokens(body.query);
    const qset = new Set(q);
    const candidates = this.scoped(body);

    const scored = candidates
      .map((r) => {
        const t = tokens(r.text);
        const tset = new Set(t);
        let overlap = 0;
        for (const w of qset) {
          if (tset.has(w)) overlap += 1;
          // credit stems so "allergy"/"allergic" and "coeliac"/"coeliacs" match
          else if (w.length > 4 && t.some((x) => x.startsWith(w.slice(0, 4)))) overlap += 0.6;
        }
        const score = overlap / Math.max(1, Math.sqrt(qset.size));
        return { ...r, score };
      })
      .filter((r) => r.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, body.limit ?? 10);

    return {
      data: scored,
      context: scored.length
        ? "Relevant memories:\n" + scored.map((r) => `- ${r.text}`).join("\n")
        : "",
    };
  }

  /** Pools OR; axes within a pool AND. Dedupes by id, re-ranks, renders one prompt. */
  recall(params: {
    query: string;
    pools: Array<{ user_id?: string; group_ids?: string[]; app_id?: string; agent_id?: string }>;
    limit?: number;
  }): { memories: MemoryRow[]; prompt: string; scopes: Array<{ scope: string; count: number }> } {
    const seen = new Map<string, MemoryRow>();
    const scopes: Array<{ scope: string; count: number }> = [];

    for (const pool of params.pools) {
      const res = this.search({ ...pool, query: params.query, limit: params.limit ?? 10 });
      const label = pool.group_ids?.length
        ? this.groupName(pool.group_ids[0]!)
        : pool.user_id
          ? "Personal"
          : "scope";
      scopes.push({ scope: label, count: res.data.length });
      for (const row of res.data) {
        const prev = seen.get(row.id);
        if (!prev || (row.score ?? 0) > (prev.score ?? 0)) seen.set(row.id, row);
      }
    }

    const memories = [...seen.values()]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, params.limit ?? 10);

    const prompt = memories.length
      ? "What you already know:\n" + memories.map((m) => `- ${m.text}`).join("\n")
      : "No relevant memory yet.";

    return { memories, prompt, scopes };
  }

  // ---------------------------------------------------------------- trigger

  /**
   * The symbol tripwire. Fires on exact overlap between the identifiers in the
   * action about to run and a directive's trigger entities — not on semantics.
   */
  trigger(body: {
    entities?: string[];
    action?: { tool?: string; args?: Record<string, unknown> };
    namespace?: string;
    user_id?: string;
    group_ids?: string[];
    app_id?: string;
    agent_id?: string;
  }): { data: MemoryRow[]; context: string | null } {
    const entities = new Set(body.entities ?? extractEntities(body.action));
    const pool = this.scoped(body).filter(
      (r) => (r.type === "lesson" || r.type === "procedure") &&
        (!body.namespace || !r.namespace || r.namespace === body.namespace),
    );

    const fired = pool
      .map((r) => {
        const matched = r.trigger_entities.filter((e) => entities.has(e));
        return { row: r, matched };
      })
      .filter((x) => x.matched.length > 0)
      .map(({ row, matched }) => ({
        ...row,
        score: matched.length,
        details: { ...row.details, matched_on: matched, because: `fires on ${matched.join(", ")}` },
      }));

    // Dedupe identical directive text — a rule restated across shifts fires once.
    const byText = new Map<string, MemoryRow>();
    for (const r of fired) if (!byText.has(r.text)) byText.set(r.text, r);
    const data = [...byText.values()];

    return {
      data,
      context: data.length
        ? "Before you act, past services recorded this:\n" +
          data.map((d) => `- ${d.text}`).join("\n")
        : null,
    };
  }

  all(): MemoryRow[] {
    return [...this.rows];
  }
}

/** Greppable identifiers out of a pending tool call — tool name plus arg values. */
export function extractEntities(action?: { tool?: string; args?: Record<string, unknown> }): string[] {
  if (!action) return [];
  const out: string[] = [];
  if (action.tool) out.push(action.tool);
  for (const [k, v] of Object.entries(action.args ?? {})) {
    if (typeof v === "string") out.push(v, `${k}:${v}`);
    else if (typeof v === "number" || typeof v === "boolean") out.push(`${k}:${v}`);
    else if (Array.isArray(v)) for (const item of v) if (typeof item === "string") out.push(item);
  }
  return out;
}
