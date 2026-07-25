/**
 * One interface over the memory service, with two backings.
 *
 * With credentials in .env this talks to XTrace over the network. Without them it
 * runs the offline stand-in. Every other file in the project imports this and
 * never learns which one it got.
 */

import { config } from "../config.ts";
import { OfflineMemory, extractEntities } from "./offline.ts";
import { hasSensitive as routeIsSensitive } from "./router.ts";
import { live, decayed, reviseDirectives } from "./supersede.ts";
import type { MemoryRow, ServiceAction } from "../types.ts";

function splitLines(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((l) => l.trim()).filter(Boolean);
}

export interface Scope {
  user_id?: string;
  group_ids?: string[];
  app_id?: string;
  agent_id?: string;
}

export interface IngestArgs {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  user_id: string;
  conv_id: string;
  group_ids?: string[];
  /**
   * The agentic path. Runs recall-first extraction and the second facts-only
   * pass that captures situated directives — the lessons and procedures the
   * tripwire later fires on. Mise turns this on for debriefs, where the
   * standing rules come from.
   */
  agentic?: boolean;
}

export interface IngestOutcome {
  created: Array<{ id: string; type: string; text: string }>;
  ignoredGroupIds: string[];
  ms: number;
}

type Listener = (event: { kind: string; payload: unknown }) => void;

export class MemoryStore {
  readonly offline: boolean;
  private client: any = null;
  private local: OfflineMemory | null = null;
  private listeners: Listener[] = [];
  private groupIds: Record<string, string> = {};

  /**
   * Distinct third-party medical or protected facts this process has sent to the
   * hosted service. Mise's whole write path exists to hold this at zero; the
   * baseline does not try, which is the point of measuring it.
   */
  private exposed = new Set<string>();

  private constructor(offline: boolean) {
    this.offline = offline;
  }

  static async open(): Promise<MemoryStore> {
    const store = new MemoryStore(config.offline);
    if (store.offline) {
      store.local = new OfflineMemory();
    } else {
      const { MemoryClient } = await import("@xtraceai/memory");
      // SDK 0.6 derives the org from the key server-side and no longer accepts
      // an orgId option, though the authentication guide still documents one.
      // XTRACE_ORG_ID is kept in .env because the raw HTTP API and the x-vec SDK
      // both still want an X-Org-Id header.
      store.client = new MemoryClient({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        maxRetries: 3,
      });
    }
    return store;
  }

  on(fn: Listener): void {
    this.listeners.push(fn);
  }

  private emit(kind: string, payload: unknown): void {
    for (const fn of this.listeners) fn({ kind, payload });
  }

  // ---------------------------------------------------------------- groups

  /**
   * Registers each group once and remembers the handle. A prompted group takes
   * only what its prompt describes; a group registered without a prompt is a
   * catch-all and takes everything shareable from the ingests it is passed on.
   */
  async ensureGroups(specs: Array<{ key: string; name: string; prompt: string | null }>): Promise<Record<string, string>> {
    const existing = this.offline ? this.local!.listGroups() : await this.client.groups.list();
    const byName = new Map<string, any>(existing.map((g: any) => [g.name, g]));

    for (const spec of specs) {
      const found = byName.get(spec.name);
      if (found && found.status !== "archived") {
        this.groupIds[spec.key] = found.id;
        continue;
      }
      const body: { name: string; prompt?: string } = { name: spec.name };
      // Only omitting prompt creates a catch-all. An empty string is rejected.
      if (spec.prompt) body.prompt = spec.prompt;
      const created = this.offline
        ? this.local!.createGroup(body)
        : await this.client.groups.create(body);
      this.groupIds[spec.key] = created.id;
      this.emit("group", { key: spec.key, name: spec.name, id: created.id, mode: spec.prompt ? "prompted" : "catch-all" });
    }
    return { ...this.groupIds };
  }

  groupId(key: string): string | undefined {
    return this.groupIds[key];
  }

  setGroupIds(ids: Record<string, string>): void {
    this.groupIds = { ...ids };
  }

  // ---------------------------------------------------------------- write

  get exposureCount(): number {
    return this.exposed.size;
  }

  resetExposure(): void {
    this.exposed.clear();
  }

  async ingest(args: IngestArgs): Promise<IngestOutcome> {
    const started = Date.now();

    // Measured at the wire, not at the retrieval. Once text is on someone else's
    // server it is exposed whether or not a search ever returns it.
    for (const line of args.messages.flatMap((m) => splitLines(m.content))) {
      if (routeIsSensitive(line)) this.exposed.add(line);
    }

    if (this.offline) {
      const res = this.local!.ingest({
        ...args,
        namespace: config.namespace,
        app_id: config.appId,
        agent_id: config.agentId,
      });
      const out = { created: res.memories_created, ignoredGroupIds: res.ignored_group_ids, ms: Date.now() - started };
      this.emit("ingest", out);
      return out;
    }

    // Ingest path choice matters more than it looks.
    //
    // `wait: true` holds one connection open for up to 30 seconds while the
    // server runs extraction. Plenty of networks — campus VPNs, corporate
    // proxies, hotel wifi — reset a connection that idles that long mid-read,
    // which surfaces as ECONNRESET even though short requests to the same host
    // work fine. The async path is short POST + short polls, so it survives
    // those networks, and the docs recommend it for agent loops anyway.
    //
    // Set MISE_SYNC_INGEST=1 to opt back into the inline path.
    const useSync = process.env.MISE_SYNC_INGEST === "1";

    let job: any = await this.withNetworkRetry<any>(() =>
      this.client.memories.ingest(
        {
          messages: args.messages,
          user_id: args.user_id,
          conv_id: args.conv_id,
          group_ids: args.group_ids,
          agentic: args.agentic ?? false,
          namespace: config.namespace,
          app_id: config.appId,
          agent_id: config.agentId,
        },
        useSync ? { wait: true } : undefined,
      ),
    );

    if (job.status !== "succeeded" && job.status !== "failed") {
      job = await this.client.memories.jobs.pollUntilDone(job.id, { timeoutMs: 120_000 });
    }
    if (job.status === "failed") {
      throw new Error(`ingest ${job.id} failed: ${job.error?.code} ${job.error?.message}`);
    }

    const out: IngestOutcome = {
      created: job.result?.memories_created ?? [],
      ignoredGroupIds: job.result?.ignored_group_ids ?? [],
      ms: Date.now() - started,
    };
    if (out.ignoredGroupIds.length) {
      console.warn(`  ! server dropped stale group ids: ${out.ignoredGroupIds.join(", ")}`);
    }
    this.emit("ingest", out);
    return out;
  }

  /**
   * Retries transient connection failures. The SDK retries 5xx and 429 itself
   * but leaves network errors on POST alone, correctly — a POST it cannot
   * confirm might already have landed. Ingest tolerates that: a duplicated
   * statement supersedes rather than double-counts, so one retry buys a demo
   * that survives a flaky room.
   */
  private async withNetworkRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        last = err;
        const code = (err as { cause?: { code?: string } })?.cause?.code;
        const transient = code === "ECONNRESET" || code === "ETIMEDOUT" ||
          code === "ECONNREFUSED" || code === "UND_ERR_SOCKET" || code === "EPIPE";
        if (!transient || i === attempts - 1) throw err;
        await new Promise((r) => setTimeout(r, 400 * 2 ** i));
      }
    }
    throw last;
  }

  // ---------------------------------------------------------------- read

  async search(query: string, scope: Scope, limit = 10): Promise<MemoryRow[]> {
    if (this.offline) return this.local!.search({ query, ...scope, limit }).data;
    const res = await this.client.memories.search({ query, ...scope, limit, mode: "compose" });
    return res.data as MemoryRow[];
  }

  /**
   * The union read. Search AND-narrows every axis you pass, so "my own context
   * plus the floor's shared context" cannot be one search — each scope goes in
   * its own pool and recall unions them.
   */
  async recall(
    query: string,
    pools: Scope[],
    limit = 10,
    /**
     * Supersession and decay are Mise features, not properties of the memory
     * service, so the pooled baseline does not get them for free. Turning this
     * off is what "one catch-all group and nothing else" actually means.
     */
    curate = true,
  ): Promise<{ memories: MemoryRow[]; prompt: string; scopes: Array<{ scope: string; count: number }> }> {
    const raw = this.offline
      ? this.local!.recall({ query, pools, limit })
      : await this.client.memories
          .recall({ query, pools, limit })
          .then((r: { memories: MemoryRow[]; prompt: string; scopes: Array<{ scope: string; count: number }> }) => ({
            memories: r.memories, prompt: r.prompt, scopes: r.scopes,
          }));

    if (!curate) return raw;

    // Retire contradicted facts, then let recency break near-ties. Both run
    // client-side so they apply identically to the hosted and offline paths.
    const current = decayed(live(raw.memories));
    const dropped = raw.memories.length - current.length;
    if (dropped > 0) this.emit("superseded", { query, dropped });

    return {
      memories: current,
      prompt: current.length
        ? "What you already know:\n" + current.map((m) => `- ${m.text}`).join("\n")
        : "No relevant memory yet.",
      scopes: raw.scopes,
    };
  }

  /**
   * Procedural recall, fired immediately before a tool runs. Matches the concrete
   * identifiers in the pending action against directives' trigger entities. This
   * is a tripwire, not a query — nothing fires unless an anchor matches exactly.
   */
  async trigger(action: ServiceAction, scope: Scope, task?: string): Promise<{ rows: MemoryRow[]; context: string | null }> {
    if (this.offline) {
      const res = this.local!.trigger({ action, ...scope, namespace: config.namespace });
      const revised = reviseDirectives(res.data);
      if (revised.length) {
        this.emit("trigger", { action, rows: revised, retired: res.data.length - revised.length });
      }
      return {
        rows: revised,
        context: revised.length
          ? "Before you act, past services recorded this:\n" + revised.map((d) => `- ${d.text}`).join("\n")
          : null,
      };
    }
    // The tripwire matches on exact identifier overlap, which means both sides
    // have to be speaking the same vocabulary. Offline that is easy — the same
    // file writes the anchors and reads them. On the hosted path the server
    // extracts entities from the debrief text itself, so it knows "second wave"
    // and "fry station" but has never heard of a tool called `fire_ticket`.
    //
    // So send both: the action for the server's own matching, and the domain
    // words that action implies. Extra entities can only widen the match, never
    // narrow it, so this is safe even where the server already got it right.
    const res = await this.client.memories.trigger({
      action,
      entities: [...new Set([...extractEntities(action), ...vocabularyFor(action.tool)])],
      task,
      namespace: config.namespace,
      mode: "compose",
      ...scope,
    });
    const rows = (res.data ?? []) as MemoryRow[];
    if (rows.length) {
      this.emit("trigger", { action, rows });
      return { rows, context: res.context ?? null };
    }

    // Fallback: the tripwire, client-side.
    //
    // `lesson` and `procedure` rows are not produced by public ingest on this
    // account — a measured result, not a guess: 298 memories across the floor
    // groups came back 237 fact, 49 episode, 12 artifact, zero directive. The
    // rules are all there, they are just typed `fact`.
    //
    // So do the matching here. Search the shared scope for the tool and the
    // vocabulary it owns, then keep only rows that read as standing rules. It is
    // the same contract — nothing fires unless the pending action matches — with
    // the match performed on this side of the wire.
    const vocab = vocabularyFor(action.tool);
    const hits = await this.search([action.tool, ...vocab].join(" "), scope, 12);
    const directives = hits.filter((m) => {
      const t = m.text.toLowerCase();
      const namesTool = t.includes(action.tool.toLowerCase());
      const readsAsRule = /\b(before|confirm|must|never|always|do not|applies when|rule)\b/.test(t);
      return namesTool && readsAsRule;
    });

    // One rule per subject. A later debrief that escalates an earlier rule
    // replaces it rather than firing alongside it.
    const revised = reviseDirectives(directives);
    if (revised.length) {
      this.emit("trigger", { action, rows: revised, retired: directives.length - revised.length });
      return {
        rows: revised,
        context: "Before you act, past services recorded this:\n" +
          revised.map((d) => `- ${d.text}`).join("\n"),
      };
    }

    return { rows: [], context: null };
  }

  /** Everything on record, for the inspector panel. */
  async dump(scope: Scope): Promise<MemoryRow[]> {
    if (this.offline) return this.local!.all();
    const out: MemoryRow[] = [];
    for await (const m of this.client.memories.list({ ...scope, limit: 200 })) {
      out.push(m as MemoryRow);
      if (out.length >= 500) break;
    }
    return out;
  }
}

export { extractEntities };

/**
 * The words a given action implies in service vernacular.
 *
 * A cook writing a debrief says "before firing any second wave"; the extraction
 * pass records that phrasing. Nobody writes "fire_ticket". This bridges the tool
 * name to the language the directive was actually written in.
 */
function vocabularyFor(tool: string): string[] {
  const map: Record<string, string[]> = {
    fire_ticket:   ["fire", "ticket", "wave", "second wave", "first wave", "covers", "table", "dupe"],
    fry_station:   ["fry station", "fryer", "fry", "basket", "dedicated basket", "cross-contamination", "dessert"],
    pour_drink:    ["alcohol", "wine", "pairing", "pour", "bar", "drink", "no-alcohol", "marker"],
    check_walkin:  ["walk-in", "temp log", "compressor", "raw fish", "41F", "temperature"],
    open_doors:    ["reservation", "reservation book", "press", "doors", "before doors", "pre-service"],
    seat_guest:    ["seat", "table", "guest", "reservation", "section"],
    grill_station: ["grill", "wood grill", "charcoal", "scallops"],
  };
  return map[tool] ?? [];
}
