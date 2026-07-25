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

  // --directives : dump every lesson and procedure on record, with the entities
  // the server extracted for each. If this comes back empty, the tripwire has
  // nothing to fire and the problem is the ingest, not the matching.
  if (argv.includes("--directives")) {
    if (store.offline) {
      console.log();
      console.log(amber("  The offline store lives in this process only."));
      console.log(dim("  Nothing persists between commands, so there is nothing to list."));
      console.log(dim("  This diagnostic is for the hosted path — set XTRACE_API_KEY and rerun."));
      console.log();
      return;
    }
    const scope = { group_ids: [groups.service!, groups.playbook!].filter(Boolean) };
    const all = await store.dump(scope);
    const directives = all.filter((m) => m.type === "lesson" || m.type === "procedure");

    console.log();
    console.log(bold(`  ${all.length} memories in the floor groups`));
    const byType: Record<string, number> = {};
    for (const m of all) byType[m.type] = (byType[m.type] ?? 0) + 1;
    for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(dim(`    ${String(n).padStart(4)}  ${t}`));
    }

    console.log();
    if (!directives.length) {
      console.log(amber("  No lesson or procedure memories exist."));
      console.log(dim("  The debriefs went in, but the agentic pass did not produce directives."));
      console.log(dim("  Nothing can fire on the tripwire until they do."));
      console.log();
      return;
    }

    console.log(bold(`  ${directives.length} directive(s)`));
    for (const d of directives) {
      const details = (d.details ?? {}) as { trigger_entities?: string[] };
      console.log();
      console.log(`  ${amber("▲")} ${d.text}`);
      console.log(dim(`    type ${d.type}`));
      console.log(dim(`    fires on: ${(details.trigger_entities ?? []).join(", ") || "(no entities recorded)"}`));
    }
    console.log();
    return;
  }

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
