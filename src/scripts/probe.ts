/**
 * Does directive extraction depend on how a debrief is phrased?
 *
 *   npm run probe
 *
 * Two ingests, both with agentic: true, differing only in shape.
 *
 *   A  narrative prose, third person, no tool named. This is what Mise sends
 *      today, and it produced 237 facts and zero directives.
 *
 *   B  an agent transcript: a named tool, the concrete arguments, the outcome,
 *      and the rule stated as an instruction for next time.
 *
 * The SDK describes the agentic pass as capturing *situated* directives, and
 * MemHub's own example — "this repo uses pnpm, running npm breaks CI, use pnpm
 * add instead" — is a rule about a specific tool invocation, not a reflection.
 * If B produces a lesson or procedure and A does not, that is the answer, and
 * the fix is to reshape the debrief rather than to change the retrieval.
 *
 * Costs two ingests. Takes about thirty seconds.
 */

import { config, explain } from "../config.ts";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const amber = (s: string) => `\x1b[38;5;214m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

const NARRATIVE =
  "Two things cost us tonight. We comped table 9 because a second fire went out " +
  "with no check on the first. Going forward, before firing any second wave, " +
  "confirm the first wave was picked up.";

const TRANSCRIPT_USER =
  "I called fire_ticket with table 9, second_wave true. The first wave had not been " +
  "picked up yet, so the table got both courses at once and we comped two hundred " +
  "dollars. Do not do that again.";

const TRANSCRIPT_ASSISTANT =
  "Understood. Rule for next time: before calling fire_ticket with second_wave true, " +
  "confirm the first wave was picked up. This applies to every ticket over six covers.";

async function main(): Promise<void> {
  console.log();
  console.log(bold("  MISE") + dim("  ·  directive extraction probe"));
  console.log();

  if (config.offline) {
    console.log(amber("  Needs the hosted service. Set XTRACE_API_KEY and rerun.\n"));
    return;
  }

  const { MemoryClient } = await import("@xtraceai/memory");
  const client = new MemoryClient({ apiKey: config.apiKey, baseUrl: config.baseUrl, maxRetries: 3 });

  const group = await client.groups.create({
    name: `probe ${Date.now()}`,
    prompt: "Service rules and procedures for a restaurant floor.",
  });

  async function attempt(label: string, messages: Array<{ role: "user" | "assistant"; content: string }>) {
    const started = Date.now();
    process.stdout.write(`  ${label.padEnd(30)}`);
    let job = await client.memories.ingest({
      messages,
      user_id: "probe",
      conv_id: `probe_${label}_${Date.now()}`,
      group_ids: [group.id],
      agentic: true,
      namespace: config.namespace,
    });
    job = await client.memories.jobs.pollUntilDone(job.id, { timeoutMs: 120_000 });

    if (job.status === "failed") {
      console.log(red("failed") + dim(`  ${job.error?.code ?? ""}`));
      return;
    }
    const created = job.result?.memories_created ?? [];
    const directives = created.filter((m: { type: string }) => m.type === "lesson" || m.type === "procedure");
    console.log(
      (directives.length ? green(`${directives.length} directive(s)`) : dim("no directives")) +
      dim(`  ·  ${created.length} memories  ·  ${Date.now() - started}ms`),
    );
    for (const m of created) {
      const mark = m.type === "lesson" || m.type === "procedure" ? amber("▲") : " ";
      console.log(dim(`    ${mark} ${m.type.padEnd(9)} ${m.text.slice(0, 66)}`));
    }
  }

  await attempt("A  narrative prose", [
    { role: "user", content: NARRATIVE },
    { role: "assistant", content: "Recorded as house procedure." },
  ]);

  console.log();

  await attempt("B  agent transcript", [
    { role: "user", content: TRANSCRIPT_USER },
    { role: "assistant", content: TRANSCRIPT_ASSISTANT },
  ]);

  console.log();
  await client.groups.archive(group.id);
  console.log(dim("  probe group archived"));
  console.log();
  console.log(dim("  If B produced directives and A did not, reshape the debrief in"));
  console.log(dim("  src/agent.ts → debrief(): name the tool and its arguments, state"));
  console.log(dim("  the outcome, then state the rule as an instruction."));
  console.log();
}

main().catch((err) => {
  console.error(red("\n  probe failed: ") + explain(err));
  process.exit(1);
});
