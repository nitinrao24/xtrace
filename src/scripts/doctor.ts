/**
 * One step at a time against the real service, with timings and full errors.
 *
 *   npm run doctor
 *
 * Every stage is a separate, small request. When something in the pipeline
 * fails, this says which stage and why, instead of the whole run going quiet.
 */

import { config, explain } from "../config.ts";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const amber = (s: string) => `\x1b[38;5;214m${s}\x1b[0m`;

process.on("unhandledRejection", (reason) => {
  console.error(red("\n  unhandled rejection: ") + explain(reason));
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error(red("\n  uncaught exception: ") + explain(err));
  process.exit(1);
});

let stage = "startup";

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  stage = name;
  const started = Date.now();
  process.stdout.write(`  ${name.padEnd(34)}`);
  try {
    const out = await fn();
    console.log(green("ok") + dim(`  ${Date.now() - started}ms`));
    return out;
  } catch (err) {
    console.log(red("failed") + dim(`  ${Date.now() - started}ms`));
    console.log();
    console.log(red("  " + explain(err)));
    const e = err as { status?: number; code?: string; requestId?: string };
    if (e.status) console.log(dim(`  http ${e.status}  code ${e.code ?? "?"}  request ${e.requestId ?? "?"}`));
    console.log();
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.log();
  console.log(bold("  MISE") + dim("  ·  doctor"));
  console.log();

  console.log(`  key       ${config.apiKey ? green(config.apiKey.slice(0, 8) + "…") : red("missing")}`);
  console.log(`  org       ${config.orgId ? dim(config.orgId) : dim("not set (fine — the SDK derives it)")}`);
  console.log(`  base      ${dim(config.baseUrl)}`);
  console.log(`  node      ${dim(process.version)}`);
  console.log();

  if (config.offline) {
    console.log(amber("  Running offline — no XTRACE_API_KEY. Nothing to test.\n"));
    return;
  }

  const { MemoryClient } = await import("@xtraceai/memory");
  const client = new MemoryClient({ apiKey: config.apiKey, baseUrl: config.baseUrl, maxRetries: 3 });

  await step("GET  /v1/groups", () => client.groups.list());

  const group = await step("POST /v1/groups", () =>
    client.groups.create({ name: `doctor ${Date.now()}`, prompt: "Throwaway group for a connection check." }),
  );

  const job = await step("POST /v1/memories  (async)", () =>
    client.memories.ingest({
      messages: [
        { role: "user", content: "The scallops need nine minutes on the wood grill, not four." },
        { role: "assistant", content: "Noted." },
      ],
      user_id: "doctor",
      conv_id: `doctor_${Date.now()}`,
      group_ids: [group.id],
    }),
  );
  console.log(dim(`     job ${job.id} · ${job.status}`));

  const done = await step("GET  /v1/memories/jobs/{id}", () =>
    client.memories.jobs.pollUntilDone(job.id, { timeoutMs: 120_000 }),
  );
  if (done.status === "failed") {
    console.log(red(`     extraction failed: ${done.error?.code} ${done.error?.message}`));
  } else {
    console.log(dim(`     ${done.result?.memories_created.length ?? 0} memories created`));
    for (const m of done.result?.memories_created ?? []) {
      console.log(dim(`     · ${m.type.padEnd(9)} ${m.text.slice(0, 60)}`));
    }
  }

  await step("POST /v1/memories/search", () =>
    client.memories.search({ query: "how long do the scallops take?", user_id: "doctor", limit: 3 }),
  );

  await step("POST /v1/memories/trigger", () =>
    client.memories.trigger({
      action: { tool: "fire_ticket", args: { station: "grill_station" } },
      user_id: "doctor",
      namespace: config.namespace,
    }),
  );

  await step("archive the throwaway group", () => client.groups.archive(group.id));

  console.log();
  console.log(green("  Every stage passed. The hosted path works from this machine."));
  console.log(dim("  If npm run replay still dies, the problem is volume, not connectivity —"));
  console.log(dim("  try:  npm run replay -- --noise 0"));
  console.log();
}

main().catch((err) => {
  console.error(red(`\n  doctor failed during ${stage}: `) + explain(err));
  process.exit(1);
});
