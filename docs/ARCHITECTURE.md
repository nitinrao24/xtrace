# Architecture

## The loop

Every question the agent answers runs the same four steps in the same order.

```
  question ────────────────────────────────────────────────────────┐
      │                                                            │
      ▼                                                            │
  1  RECALL           memories.recall({ pools: [                    │
     union read         { user_id: "priya" },        ← personal     │
     personal + floor    { group_ids: [service,      ← shared       │
                            playbook] } ] })                        │
      │                                                            │
      │  Search AND-narrows every axis you pass, so                 │
      │  { user_id, group_ids } is an intersection, not a union.    │
      │  Each scope has to go in its own pool.                      │
      ▼                                                            │
  2  TRIGGER          memories.trigger({                            │
     symbol tripwire     action: { tool: "fire_ticket",             │
     procedural only               args: { table: "22" } },         │
                         namespace: "verano:service" })             │
      │                                                            │
      │  Exact identifier overlap. Not a query. Silent unless       │
      │  an anchor matches, which is what makes it safe to call     │
      │  before every action.                                       │
      ▼                                                            │
  3  VAULT            vault.query(question + proper names           │
     encrypted, local              surfaced in step 1)              │
      │                                                            │
      │  Only runs when step 1 named someone. The name is the       │
      │  join key between the two halves.                           │
      ▼                                                            │
  4  ACT + LEARN      route(each line) → hosted | vault             │
                      memories.ingest({ ... })                      │
      └─────────────────────────────────────────────────────────────┘
                         each service feeds the next
```

## The write path

```
  "Ines Barros is in tonight, it is her anniversary. She is coeliac."
                              │
                    ┌─────────┴─────────┐
                    │      router       │
                    └─────────┬─────────┘
             ┌────────────────┴────────────────┐
             ▼                                 ▼
   "Ines Barros is in tonight,        "She is coeliac."
    it is her anniversary."            matched: diagnosed condition
             │                                 │
             ▼                                 ▼
   memories.ingest({                  vault.put([{ text, guest_id }])
     group_ids: [service] })            AES content
             │                          Paillier vector
             ▼                          never leaves the machine
   XTrace personal gate runs
   → shareable, tagged to the floor
```

Two gates, in order. The router asks *may this leave the building*. The personal gate, server-side, asks *given that it left, may it cross between staff*. Mise depends on both and duplicates neither.

## Groups

| Group | Mode | What it holds | Why that mode |
|---|---|---|---|
| Verano service floor | prompted | 86'd dishes, table notes, prep and timing, supplier and equipment status | The ingests mix concerns. A sharp prompt keeps payroll and marketing out of a mid-service read. |
| Verano playbook | catch-all | post-service debriefs, wholesale | Every debrief belongs to the shared playbook by definition, so per-memory matching would only lose rules. |
| Baseline pool | catch-all | everything, from every ingest | Not part of Mise. This is the comparison arm. |

Background traffic — payroll, rotas, marketing, the sister location — is ingested on **no group at all**. It is nobody's shared context, so it stays in the author's personal scope and never dilutes a floor read. The pooled arm sends the same traffic to its one catch-all, which is exactly why its precision degrades.

## The memory types in play

| Type | Written by | Read by |
|---|---|---|
| `fact` | every service turn | `recall` |
| `episode` | server-side, per service session | `recall` |
| `artifact` | server-extracted from close-of-service notes | `get`, with `full_content` |
| `lesson` / `procedure` | `ingest({ agentic: true })` on debriefs | `trigger`, never `search` |

The last row is the important one. `lesson` and `procedure` are not reachable by semantic search — they are recalled by the tripwire on exact identifier overlap, scoped by `namespace`. So a rule learned in one working context does not fire in an unrelated one, and global rules always pass.

## Scoping, precisely

```
org (from the key)
  AND kb_type
  [ AND user_id ]
  [ AND ( group_ids ∩ requested ) ]     ← any-of within the list
  [ AND agent_id ]
  [ AND app_id ]
```

Everything supplied AND-narrows; anything omitted is unconstrained; at least one axis is required. `recall` is the only OR — axes AND within a pool, pools OR across.

## Measurement

**Context fidelity.** For each probe, the fraction of required facts present in the brief the agent assembled. Scored on the assembled context, not on generated prose. No model grades another model.

**Records exposed.** Distinct lines matching the router's medical and protected-status rules that were sent to the hosted service, counted at ingest. Measured at the wire because retrieval is not what makes data exposed.

Both are computed identically for all three arms in `src/eval/harness.ts`. The arms differ only in the agent's write path and read path, never in how they are graded.

## Failure behaviour

| Failure | What happens |
|---|---|
| No credentials | Offline stand-in. Full pipeline, no network. |
| Vault service down | AES-encrypted local file. Still local, which for this data is the conservative failure. |
| Ingest job fails | Surfaced with its `error.code`; no silent retry, matching the service's own no-auto-retry contract. |
| Stale group id | Soft-skipped server-side, echoed in `ignored_group_ids`, logged. |
| Directive not tagged | Nothing breaks. Tagging is best-effort and the personal gate fails closed by design. |
