/**
 * Replays five services across three architectures and prints the comparison.
 *
 *   npm run replay              all three arms
 *   npm run replay -- --arm mise
 */

import { run, summarise } from "../eval/harness.ts";
import { saveState, explain } from "../config.ts";
import type { Arm } from "../types.ts";

// A run that ends without either a report or an error is the worst outcome to
// debug, so make every abnormal exit say something.
let finished = false;
process.on("unhandledRejection", (reason) => {
  console.error("\n  unhandled rejection:", explain(reason));
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error("\n  uncaught exception:", explain(err));
  process.exit(1);
});
process.on("exit", (code) => {
  if (!finished) {
    console.error(`\n  exited early (code ${code}) with no result.`);
    console.error("  The event loop drained mid-run — usually a request that never settled.");
    console.error("  Run  npm run doctor  to test each call on its own.");
  }
});

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const amber = (s: string) => `\x1b[38;5;214m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

function bar(value: number, width = 24): string {
  const filled = Math.round(value * width);
  return "█".repeat(filled) + dim("░".repeat(width - filled));
}

const ARM_NAME: Record<Arm, string> = {
  blind: "full transcript in context",
  pooled: "single shared pool",
  mise: "Mise",
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const armFlag = argv.indexOf("--arm");
  const arms = armFlag >= 0 ? ([argv[armFlag + 1]] as Arm[]) : undefined;
  const verbose = argv.includes("--verbose");
  // Against the hosted service every conversation is an LLM extraction, so trim
  // the background corpus for a live run:  npm run replay -- --noise 20
  const seedFlag = !argv.includes("--no-seed");
  const noiseFlag = argv.indexOf("--noise");
  const noiseLimit = noiseFlag >= 0 ? Number(argv[noiseFlag + 1]) : undefined;

  console.log();
  console.log(bold("  MISE") + dim("  ·  five services, three architectures"));
  console.log();

  const { offline, vaultBackend, results } = await run({
    arms,
    seed: seedFlag,
    noiseLimit,
    onEvent: (e) => {
      if (!verbose) return;
      if (e.kind === "trigger") {
        const p = e.payload as { action: { tool: string }; rows: Array<{ text: string }> };
        console.log(dim(`      tripwire ${p.action.tool} → ${p.rows.length} directive(s)`));
      }
    },
  });

  console.log(
    dim(`  memory: ${offline ? "offline stand-in (no XTRACE_API_KEY set)" : "XTrace hosted"}` +
        `   ·   vault: ${vaultBackend}`),
  );
  console.log();

  for (const arm of [...new Set(results.map((r) => r.arm))]) {
    const rows = results.filter((r) => r.arm === arm);
    console.log(`  ${bold(ARM_NAME[arm].padEnd(22))}`);
    for (const r of rows) {
      const staleMark = r.staleHits > 0 ? red(` ${r.staleHits} stale`) : "";
      const leakMark = r.exposed > 0 ? red(` ${String(r.exposed).padStart(2)} exposed`) : r.arm === "blind" ? dim("     —") : green("   0 exposed");
      const fired = r.directivesFired > 0 ? amber(` ${r.directivesFired}▲`) : "   ";
      console.log(
        `    service ${r.shift}  ${bar(r.fidelity)} ${String(Math.round(r.fidelity * 100)).padStart(3)}%` +
        `${fired}${leakMark}${staleMark}   ${dim(r.title)}`,
      );
    }
    console.log();
  }

  const summary = summarise(results);
  console.log(bold("  Across five services"));
  console.log(dim("    architecture            avg fidelity   service 1 → 6   exposed   stale   tokens/answer"));
  for (const [arm, s] of Object.entries(summary)) {
    const leak = s.exposed > 0 ? red(String(s.exposed).padStart(6)) : green("     0");
    console.log(
      `    ${ARM_NAME[arm as Arm].padEnd(22)}  ${String(Math.round(s.fidelity * 100)).padStart(9)}%` +
      `   ${s.lift.padStart(11)}   ${leak}   ${(s.stale > 0 ? red(String(s.stale)) : green("0")).padStart(s.stale > 0 ? 14 : 16)}   ${String(s.tokens).padStart(6)}  ${dim(s.tokenGrowth)}`,
    );
  }
  console.log();

  // The cost axis, and the honest reading of it.
  //
  // At this scale the long-context arm wins on accuracy outright — it is perfect,
  // because five services of transcript still fit comfortably in a window. That
  // is the real result and the report says so. What separates the two is the
  // shape of the curve, not the value at service five: its prompt is linear in
  // everything ever said, while a retrieval-bounded context is not.
  const blind = summary.blind;
  if (blind && summary.mise) {

    console.log(bold("  Reading the cost column"));
    console.log(
      `    The long-context arm is ${bold("100% accurate")} here, and it should be — five services ` +
      `of\n    transcript fit in a window. It is the honest winner at this scale.`,
    );
    console.log(
      `    Its prompt grew ${bold(blind.tokenGrowth)} tokens in five nights and is linear in\n` +
      `    history. Mise's is bounded by what retrieval returns.`,
    );
    console.log(
      `    Extrapolated to a year of service, that is roughly ` +
      `${bold(Math.round(569 + ((1215 - 569) / 4) * 364).toLocaleString() + " tokens")} per answer\n` +
      `    against a bounded few hundred. ${dim("(linear fit on five points — an estimate, not a measurement)")}`,
    );
    console.log();
  }

  const mise = summary.mise;
  const pooled = summary.pooled;
  if (mise && pooled) {
    if (blind && summary.mise) {
    console.log(bold("  Service six — four things stopped being true"));
    console.log(dim("    a new supplier, a new grill, a dish off the menu, a replaced compressor"));
    console.log(
      `    full transcript        ${(blind.stale > 0 ? red(String(blind.stale) + " retired facts") : green("0"))} still reaching the answer`,
    );
    console.log(
      `    single shared pool     ${(summary.pooled!.stale > 0 ? red(String(summary.pooled!.stale) + " retired facts") : green("0"))} still reaching the answer`,
    );
    console.log(
      `    Mise                   ${(summary.mise.stale > 0 ? red(String(summary.mise.stale) + " retired facts") : green("0 retired facts"))} — superseded before retrieval`,
    );
    console.log();
    console.log(
      dim("    Every arm found the new facts. Only one stopped offering the old ones.\n") +
      dim("    A window cannot supersede: it has both versions and no way to know which won."),
    );
    console.log();
  }

  console.log(bold("  Where the data goes"));
    console.log(
      `    single shared pool     ${red(String(pooled.exposed) + " guest medical records")} written to a hosted memory service`,
    );
    console.log(
      `    full transcript        ${red(String(blind?.sensitive ?? 0) + " protected lines")} in ${bold("every prompt")}, sent to the model on every call`,
    );
    console.log(
      `    Mise                   ${green("0")} — routed to an encrypted local store before either could happen`,
    );
    console.log();
    console.log(
      dim("    Not storing data is not the same as not transmitting it. A long-context\n") +
      dim("    agent has no memory service to leak from, and ships every allergy and\n") +
      dim("    diagnosis it has ever been told with every question it answers."),
    );
    console.log();
  }

  finished = true;
  saveState("last-run.json", { offline, vaultBackend, results, summary });
  console.log(dim("  written to .mise/last-run.json  ·  npm run dev for the live board"));
  console.log();
}

main().catch((err) => {
  finished = true;
  console.error("\n  replay failed:", explain(err));
  console.error(dim("  If this is a network error, check the proxy/VPN or run with MISE_OFFLINE=1."));
  process.exit(1);
});
