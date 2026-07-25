/**
 * Registers the groups Mise needs and checks the connection.
 *
 *   npm run setup
 *
 * Safe to run repeatedly. Groups are matched by name, so a second run adopts the
 * existing handles instead of creating duplicates.
 */

import { MemoryStore } from "../memory/store.ts";
import { Vault } from "../memory/vault.ts";
import { readData, saveState, explain } from "../config.ts";
import type { SeedFile } from "../eval/harness.ts";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const amber = (s: string) => `\x1b[38;5;214m${s}\x1b[0m`;

async function main(): Promise<void> {
  console.log();
  console.log(bold("  MISE") + dim("  ·  setup"));
  console.log();

  const seed = readData<SeedFile>("seed.json");
  const store = await MemoryStore.open();
  const vault = await Vault.open();

  if (store.offline) {
    console.log(amber("  ▲ No credentials found — running the offline stand-in."));
    console.log(dim("    Put XTRACE_API_KEY and XTRACE_ORG_ID in .env to use the hosted service."));
  } else {
    console.log(green("  ✓ ") + "connected to " + dim(process.env.XTRACE_BASE_URL || "api.production.xtrace.ai"));
  }

  const groups = await store.ensureGroups([
    ...seed.groups,
    { key: "pooled", name: "Baseline pool", prompt: null },
  ]);

  console.log();
  console.log("  groups");
  for (const spec of [...seed.groups, { key: "pooled", name: "Baseline pool", prompt: null }]) {
    const mode = spec.prompt ? "prompted" : "catch-all";
    console.log(`    ${spec.name.padEnd(24)} ${dim(mode.padEnd(10))} ${dim(groups[spec.key] ?? "?")}`);
  }

  console.log();
  console.log(`  vault    ${vault.backend === "x-vec" ? green("x-vec (encrypted)") : amber("local AES file — start vault/service.py for x-vec")}`);
  const chunks = await vault.count();
  if (chunks < 0) {
    console.log(`  chunks   ${amber("locked")}`);
    console.log(dim("           the vault was written under a different MISE_VAULT_PASSPHRASE."));
    console.log(dim("           delete the .mise directory to start fresh — npm run seed rebuilds it."));
  } else {
    console.log(`  chunks   ${chunks}`);
  }

  saveState("groups.json", groups);
  console.log();
  console.log(dim("  handles saved to .mise/groups.json  ·  next: npm run demo"));
  console.log();
}

main().catch((err) => {
  console.error("\n  setup failed:", explain(err));
  console.error(dim("  If this is a 403 org_mismatch, XTRACE_ORG_ID does not match the key's org."));
  process.exit(1);
});
