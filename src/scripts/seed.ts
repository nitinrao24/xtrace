/**
 * Loads the pre-service corpus: what the house already knows before service one.
 *
 *   npm run seed
 *
 * Every line is routed first. Operational facts go to the hosted memory service
 * tagged to the floor's group; guest medical facts go to the encrypted vault and
 * never touch the network.
 */

import { MemoryStore } from "../memory/store.ts";
import { Vault } from "../memory/vault.ts";
import { ServiceAgent } from "../agent.ts";
import { route } from "../memory/router.ts";
import { readData, saveState, explain } from "../config.ts";
import type { SeedFile } from "../eval/harness.ts";
import type { SeedConversation } from "../types.ts";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const violet = (s: string) => `\x1b[38;5;141m${s}\x1b[0m`;

async function main(): Promise<void> {
  const withNoise = !process.argv.includes("--no-noise");

  console.log();
  console.log(bold("  MISE") + dim("  ·  seeding memory"));
  console.log();

  const seed = readData<SeedFile>("seed.json");
  const noise = readData<{ conversations: SeedConversation[] }>("noise.json").conversations;

  const store = await MemoryStore.open();
  const vault = await Vault.open();
  const groups = await store.ensureGroups([
    ...seed.groups,
    { key: "pooled", name: "Baseline pool", prompt: null },
  ]);
  saveState("groups.json", groups);

  const agent = new ServiceAgent({ store, vault, groups, arm: "mise" });

  let hosted = 0;
  let vaulted = 0;

  for (const conv of seed.conversations) {
    const body = conv.messages.map((m) => m.content).join(" ");
    const routed = route(body);
    hosted += routed.filter((r) => r.destination === "hosted").length;
    vaulted += routed.filter((r) => r.destination === "vault").length;

    await agent.learn(conv, conv.conv_id);

    for (const line of routed) {
      const mark = line.destination === "vault" ? violet("vault ") : green("floor ");
      console.log(`  ${mark} ${line.text.slice(0, 74)}${line.text.length > 74 ? "…" : ""}`);
      if (line.destination === "vault") console.log(dim(`          ${line.reason}`));
    }
  }

  if (withNoise) {
    console.log();
    process.stdout.write(dim(`  loading ${noise.length} background conversations `));
    for (const [i, conv] of noise.entries()) {
      await agent.learn({ user_id: conv.user_id, groups: [], messages: conv.messages }, conv.conv_id);
      if (i % 40 === 0) process.stdout.write(dim("·"));
    }
    console.log(dim(" done"));
  }

  console.log();
  console.log(`  ${green(String(hosted).padStart(3))} lines to the hosted floor memory`);
  console.log(`  ${violet(String(vaulted).padStart(3))} lines to the encrypted vault ${dim(`(${vault.backend})`)}`);
  console.log(`  ${dim(String(withNoise ? noise.length : 0).padStart(3))} background conversations`);
  console.log();
  console.log(dim("  next: npm run replay"));
  console.log();
}

main().catch((err) => {
  console.error("\n  seed failed:", explain(err));
  process.exit(1);
});
