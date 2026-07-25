/**
 * Runs the same five services three ways and scores them identically.
 *
 *   blind   a capable agent with a long context window and no persistence.
 *           It knows everything said tonight and nothing said before.
 *   pooled  the shortcut: one catch-all group, every turn ingested whole, no
 *           routing, no procedural layer. This is what most memory demos are.
 *   mise    routed writes, prompted plus catch-all groups, union recall, and a
 *           procedural tripwire fired before each action.
 *
 * The metric is context fidelity: of the facts the agent needed to have in hand
 * to answer correctly, how many did it actually retrieve. It is scored against
 * the brief the agent assembled, not against prose it generated, so no model
 * judges another model and the number means one thing only.
 *
 * The second metric is leaks: third-party medical facts that came back from the
 * shared cross-user pool. Fidelity that is bought by putting a guest's allergy
 * record on a shared server is not a win, and the two numbers have to be read
 * together.
 */

import { MemoryStore } from "../memory/store.ts";
import { Vault } from "../memory/vault.ts";
import { ServiceAgent } from "../agent.ts";
import { readData } from "../config.ts";
import type { Arm, GroupSpec, SeedConversation, Shift, ShiftResult } from "../types.ts";

export interface SeedFile {
  staff: Array<{ user_id: string; role: string }>;
  groups: GroupSpec[];
  conversations: SeedConversation[];
}

export interface RunOptions {
  arms?: Arm[];
  onEvent?: (event: { kind: string; payload: unknown }) => void;
  /**
   * Load the pre-service corpus before running the services. Offline this costs
   * nothing. Against the hosted service every conversation is an LLM extraction,
   * so seed once with `npm run seed` and then replay with this off.
   */
  seed?: boolean;
  /** How much background traffic to load. Trimmed automatically on the hosted path. */
  noiseLimit?: number;
  /** Parallel ingests during seeding. The SDK retries 429s on its own. */
  concurrency?: number;
}

const ARM_LABEL: Record<Arm, string> = {
  blind: "full transcript in context",
  pooled: "single shared pool",
  mise: "Mise",
};

export async function run(opts: RunOptions = {}): Promise<{
  offline: boolean;
  vaultBackend: string;
  results: ShiftResult[];
}> {
  const arms = opts.arms ?? (["blind", "pooled", "mise"] as Arm[]);
  const emit = opts.onEvent ?? (() => {});

  const seed = readData<SeedFile>("seed.json");
  const { shifts } = readData<{ shifts: Shift[] }>("shifts.json");
  const noise = readData<{ conversations: SeedConversation[] }>("noise.json").conversations;

  const store = await MemoryStore.open();
  const vault = await Vault.open();
  store.on(emit);

  const doSeed = opts.seed ?? true;
  // Offline the corpus is free, so use all of it. On the hosted path each
  // conversation is an LLM extraction, so trim it unless asked otherwise.
  const noiseLimit = opts.noiseLimit ?? (store.offline ? noise.length : 60);
  const concurrency = opts.concurrency ?? (store.offline ? 1 : 4);

  // The pooled baseline gets its own catch-all so its rows never mix with Mise's.
  const groups = await store.ensureGroups([
    ...seed.groups,
    { key: "pooled", name: "Baseline pool", prompt: null },
  ]);

  emit({ kind: "ready", payload: { offline: store.offline, vault: vault.backend, groups } });

  const results: ShiftResult[] = [];

  for (const arm of arms) {
    emit({ kind: "arm", payload: { arm, label: ARM_LABEL[arm] } });

    const agent = new ServiceAgent({ store, vault, groups, arm });
    const ns = (id: string) => `${arm}:${id}`;
    store.resetExposure();

    // The long-context arm gets the pre-service corpus too — into its window
    // rather than into a memory service. Denying it the house standards while
    // giving them to the other two would have made it a strawman, and the whole
    // point of this arm is to be the strongest honest version of "just put
    // everything in the prompt".
    if (arm === "blind" && doSeed) {
      for (const conv of seed.conversations) {
        await agent.learn(
          { user_id: ns(conv.user_id), groups: [], messages: conv.messages },
          `${arm}:${conv.conv_id}`,
        );
      }
      emit({ kind: "seeded", payload: { arm, conversations: seed.conversations.length, background: 0 } });
    }

    if (arm !== "blind" && doSeed) {
      // Background traffic. Both arms receive the same messages; they differ in
      // where they put them. The pooled baseline sends everything to its one
      // catch-all, which is what makes a catch-all cheap to build. Mise sends
      // this traffic on no group at all — it is nobody's shared context — so it
      // stays in the author's personal scope and never dilutes a floor read.
      const background = noise.slice(0, noiseLimit);
      await inParallel(background, concurrency, (conv) =>
        agent.learn(
          { user_id: ns(conv.user_id), groups: [], messages: conv.messages },
          `${arm}:${conv.conv_id}`,
        ),
      );

      // Pre-service corpus. The house already knows some things on day one.
      for (const conv of seed.conversations) {
        await agent.learn(
          { user_id: ns(conv.user_id), groups: conv.groups, guest_id: conv.guest_id, messages: conv.messages },
          `${arm}:${conv.conv_id}`,
        );
      }
      emit({ kind: "seeded", payload: { arm, conversations: seed.conversations.length, background: background.length } });
    }

    for (const shift of shifts) {
      agent.newService();
      const convId = `${arm}:svc_${shift.date}`;

      for (const turn of shift.turns) {
        await agent.learn({ ...turn, user_id: ns(turn.user_id) }, convId);
        emit({ kind: "turn", payload: { arm, shift: shift.n, text: turn.messages[0]!.content, user: turn.user_id } });
      }

      const probes = [];
      for (const probe of shift.probes) {
        const res = await agent.answer({ ...probe, user_id: ns(probe.user_id) });
        probes.push({ ...res, asker: probe.user_id });
        emit({ kind: "probe", payload: { arm, shift: shift.n, ...res, asker: probe.user_id } });
      }

      const fidelity = probes.reduce((a, p) => a + p.fidelity, 0) / Math.max(1, probes.length);
      const exposed = store.exposureCount;
      const directivesFired = probes.reduce((a, p) => a + p.directives.length, 0);
      // Four characters to the token is the usual rule of thumb for English. It
      // is an estimate and the docs say so; what matters is that it is applied
      // identically to all three arms, so the ratio between them is sound even
      // where the absolute number is approximate.
      const staleHits = probes.reduce((a, p) => a + p.stale.length, 0);
      const sensitiveInPrompt = Math.round(
        probes.reduce((a, p) => a + p.sensitiveInPrompt, 0) / Math.max(1, probes.length),
      );
      const tokensPerAnswer = Math.round(
        probes.reduce((a, p) => a + p.contextChars, 0) / Math.max(1, probes.length) / 4,
      );

      const result: ShiftResult = {
        shift: shift.n,
        date: shift.date,
        title: shift.title,
        covers: shift.covers,
        arm,
        fidelity,
        exposed,
        directivesFired,
        tokensPerAnswer,
        sensitiveInPrompt,
        staleHits,
        probes,
      };
      results.push(result);
      emit({ kind: "shift", payload: result });

      // The debrief is where tomorrow's procedure comes from.
      const learned = await agent.debrief(shift.debrief, ns("maya"), `${convId}:debrief`);
      if (learned) emit({ kind: "debrief", payload: { arm, shift: shift.n, directives: learned } });
    }
  }

  return { offline: store.offline, vaultBackend: vault.backend, results };
}

/** Runs a bounded number of tasks at a time. Keeps a hosted seed from serialising. */
async function inParallel<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  if (limit <= 1) {
    for (const item of items) await fn(item);
    return;
  }
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export function summarise(results: ShiftResult[]): Record<Arm, { fidelity: number; exposed: number; lift: string; tokens: number; tokenGrowth: string; sensitive: number; stale: number }> {
  const out = {} as Record<Arm, { fidelity: number; exposed: number; lift: string; tokens: number; tokenGrowth: string; sensitive: number; stale: number }>;
  const arms = [...new Set(results.map((r) => r.arm))];
  for (const arm of arms) {
    const rows = results.filter((r) => r.arm === arm);
    const fidelity = rows.reduce((a, r) => a + r.fidelity, 0) / rows.length;
    const first = rows[0]!.fidelity;
    const last = rows[rows.length - 1]!.fidelity;
    out[arm] = {
      fidelity,
      exposed: Math.max(...rows.map((r) => r.exposed)),
      tokens: Math.round(rows.reduce((a, r) => a + r.tokensPerAnswer, 0) / rows.length),
      tokenGrowth: `${rows[0]!.tokensPerAnswer} → ${rows[rows.length - 1]!.tokensPerAnswer}`,
      sensitive: Math.max(...rows.map((r) => r.sensitiveInPrompt)),
      stale: rows.reduce((a, r) => a + r.staleHits, 0),
      lift: `${(first * 100).toFixed(0)}% → ${(last * 100).toFixed(0)}%`,
    };
  }
  return out;
}
