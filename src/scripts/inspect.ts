/**
 * Ask the agent something, and see exactly what it pulled and from where.
 *
 *   npm run inspect -- "can I use the same fryer for the churros?"
 *   npm run inspect -- --trigger fire_ticket
 *
 * This is the panel to open when a judge asks "but how do you know it used the
 * memory?" It prints the assembled brief with each line attributed to its source.
 */

import { MemoryStore } from "../memory/store.ts";
import { Vault } from "../memory/vault.ts";
import { ServiceAgent, actionFor } from "../agent.ts";
import { readState } from "../config.ts";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const violet = (s: string) => `\x1b[38;5;141m${s}\x1b[0m`;
const amber = (s: string) => `\x1b[38;5;214m${s}\x1b[0m`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const triggerFlag = argv.indexOf("--trigger");
  const asker = "priya";

  const store = await MemoryStore.open();
  const vault = await Vault.open();
  const groups = readState<Record<string, string>>("groups.json", {});
  if (!Object.keys(groups).length) {
    console.error("\n  No groups on record. Run npm run setup first.\n");
    process.exit(1);
  }
  store.setGroupIds(groups);
  const agent = new ServiceAgent({ store, vault, groups, arm: "mise" });

  if (triggerFlag >= 0) {
    const tool = argv[triggerFlag + 1] ?? "fire_ticket";
    const res = await store.trigger({ tool, args: {} }, { group_ids: [groups.service!, groups.playbook!].filter(Boolean) });
    console.log();
    console.log(bold(`  tripwire · ${tool}`));
    if (!res.rows.length) console.log(dim("    nothing fires on this action yet"));
    for (const row of res.rows) {
      const matched = (row.details as { matched_on?: string[] } | undefined)?.matched_on ?? [];
      console.log(`    ${amber("▲")} ${row.text}`);
      console.log(dim(`      ${row.type} · fired on ${matched.join(", ") || "—"}`));
    }
    console.log();
    return;
  }

  const query = argv.filter((a) => !a.startsWith("--")).join(" ") ||
    "can I run the churros and the calamari out of the same fryer?";

  const brief = await agent.brief(query, asker);
  const action = actionFor(query);

  console.log();
  console.log(bold("  question  ") + query);
  console.log(dim(`  action    ${action.tool} ${JSON.stringify(action.args)}`));
  console.log();

  console.log(green("  floor memory") + dim(`  ${brief.sources.shared} rows`));
  for (const line of brief.sharedLines.slice(0, 6)) console.log(`    ${line}`);

  console.log();
  console.log(amber("  procedure") + dim(`  ${brief.sources.directives} fired`));
  for (const line of brief.directiveText) console.log(`    ▲ ${line}`);
  if (!brief.directiveText.length) console.log(dim("    none — no directive anchors this action"));

  console.log();
  console.log(violet("  vault") + dim(`  ${brief.sources.vault} rows, decrypted locally`));
  for (const line of brief.vaultLines) console.log(`    ${line}`);
  if (!brief.vaultLines.length) console.log(dim("    none"));

  console.log();
}

main().catch((err) => {
  console.error("\n  inspect failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
