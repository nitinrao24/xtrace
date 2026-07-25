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
  blind: "context window only",
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
      const leakMark = r.exposed > 0 ? red(` ${String(r.exposed).padStart(2)} exposed`) : r.arm === "blind" ? dim("     —") : green("   0 exposed");
      const fired = r.directivesFired > 0 ? amber(` ${r.directivesFired}▲`) : "   ";
      console.log(
        `    service ${r.shift}  ${bar(r.fidelity)} ${String(Math.round(r.fidelity * 100)).padStart(3)}%` +
        `${fired}${leakMark}   ${dim(r.title)}`,
      );
    }
    console.log();
  }

  const summary = summarise(results);
  console.log(bold("  Across five services"));
  console.log(dim("    architecture            avg fidelity   service 1 → 5   records exposed"));
  for (const [arm, s] of Object.entries(summary)) {
    const leak = s.exposed > 0 ? red(String(s.exposed).padStart(8)) : green("       0");
    console.log(
      `    ${ARM_NAME[arm as Arm].padEnd(22)}  ${String(Math.round(s.fidelity * 100)).padStart(9)}%` +
      `   ${s.lift.padStart(11)}   ${leak}`,
    );
  }
  console.log();

  const mise = summary.mise;
  const pooled = summary.pooled;
  if (mise && pooled) {
    console.log(
      `  ${amber("▲")} Mise ends ${bold(mise.lift.split("→")[1]!.trim())} accurate and leaked ` +
      `${bold("nothing")}, against ${pooled.exposed} guest medical records the shared pool is holding.`,
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
