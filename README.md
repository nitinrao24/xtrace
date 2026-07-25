# Mise

**A service agent that learns the house.** Built on XTrace Memory for the XTrace × Berkeley Summit House hackathon, July 25 2026.

*Mise en place* — everything in its place. The name is the thesis: the value of memory is not that an agent can recall, it is that each thing ends up where it belongs.

---

## The problem

Ask a restaurant manager what their POS remembers and they will tell you: covers, tickets, totals. Ask what the *room* remembers and you get something else — that table 14 always takes the corner banquette, that the scallops need nine minutes not four, that the guest on 3 cannot go near the fry station, that the last time anyone double-fired a six-top it cost two hundred dollars in comps.

That knowledge lives in the heads of whoever worked last night. It leaves when they do.

An agent that holds it has two jobs, and the second one is the hard one:

1. **Remember enough** that tonight goes better than last night.
2. **Not become the place a guest's medical record ends up.**

Most memory demos do the first and quietly fail the second. Mise measures both.

---

## What it does

Five services at a 60-seat restaurant, run three ways, scored identically.

Measured against the hosted XTrace service:

| | avg fidelity | service 1 → 5 | guest records exposed |
|---|---|---|---|
| Context window only | 48% | 71% → 40% | 0 |
| Single shared pool | 88% | 88% → 88% | **6** |
| **Mise** | **96%** | **88% → 100%** | **0** |

The pooled baseline is flat. It ends its fifth service no better than its first,
because one undifferentiated bucket has nowhere for a lesson to live. Mise climbs.

(The offline stand-in scores Mise at 90% rather than 96% — real extraction and real
vector search beat a keyword approximation, so the gap the architecture produces is
wider on the hosted path than in the fallback.)

**Context fidelity** — of the facts the agent needed in hand to answer correctly, how many it actually retrieved. Scored against the brief the agent assembled, not against prose it generated, so no model judges another model and the number means exactly one thing.

**Records exposed** — distinct third-party medical facts sent to a hosted service. Measured at the wire, not at retrieval: once text is on someone else's server it is exposed whether or not a search ever returns it.

Read them together. The pooled baseline's accuracy is partly *purchased* with data it should not be holding.

---

## The four memory kinds, all load-bearing

XTrace exposes four. Most projects use one. Mise uses all four because service operations genuinely need all four.

| Kind | In a restaurant | Where it comes from |
|---|---|---|
| **Semantic** | "Bayview short-ships nettles one week in three" | facts extracted from service chatter |
| **Episodic** | "Wednesday, 84 covers, compressor at 43°F" | session summaries per service |
| **Artifact** | the prep sheet the agent writes at close | server-extracted when content warrants it |
| **Procedural** | "confirm the first wave was picked up before firing the second" | debriefs ingested on the agentic path |

### The part that makes it compound

Procedural memory is the only one that changes what the agent *does* rather than what it knows, and it is reached through a different endpoint entirely.

```ts
// Before the agent fires a ticket — not a search, a tripwire.
const fired = await client.memories.trigger({
  action: { tool: "fire_ticket", args: { table: "22", second_wave: true } },
  namespace: "verano:service",
  task: "fire the second wave for table 22",
  group_ids: [serviceGroup],
});
// → "Before firing any second wave, confirm the first wave was picked up."
//    Learned on Monday, after a $200 comp. Fires on Friday, unprompted.
```

`trigger` matches the **concrete identifiers** in the action about to run against directives' trigger entities. Exact overlap, never semantic similarity. Nothing fires unless an anchor matches — so it is silent when it has nothing to say, which is what makes it safe to call before every action.

The directives themselves come from `ingest({ agentic: true })`, which runs the second facts-only pass that captures situated `lesson` and `procedure` rows.

Neither is in the published guides. Both are in the shipped SDK's type declarations and in the `lesson` / `procedure` enum members of the list-memories OpenAPI spec. This is the same primitive MemHub uses as a `PreToolUse` hook for coding agents — Mise takes it somewhere nobody has pointed it: a physical room with people in it.

### Where the tripwire actually runs, and why

We built on `trigger`, then measured what the hosted service had stored. Across the floor
groups: **237 facts, 49 episodes, 12 artifacts, and zero directives.** The rules extract
perfectly — `agentic: true` on a debrief produces exactly the right sentences — they are
simply typed `fact`, so `trigger` has nothing to match and returns empty every time.

We tested a hypothesis: perhaps extraction wants a *situated* directive rather than a
reflection, so a debrief naming the tool would be typed differently. Two ingests, identical
content, different shape (`npm run probe`, kept in the repo). **The hypothesis was wrong.**
Narrative prose produced one vague fact; the agent-transcript phrasing produced four sharp,
correctly worded rules — all still typed `fact`.

So we kept the pattern and moved the match to our side. `MemoryStore.trigger()` calls the
hosted endpoint first; when it returns empty, it searches the shared scope for the tool name
plus the vocabulary that tool owns, and keeps only rows that name the tool *and* read as a
standing rule. Same contract — nothing fires unless the pending action matches — with the
matching performed client-side.

The one change that made this work came out of the failed experiment: debriefs are now
written as situated directives that name their tools (`situate()` in `src/agent.ts`), because
that puts the tool name inside the stored text where a later search can find it. The negative
result produced the fix.

---

## The second gate

XTrace applies a **personal gate** server-side: content touching health, family, finances or credentials is never tagged into a group, so it cannot cross between users. That is a good gate and Mise relies on it.

But it governs *sharing*. It does not stop the text reaching the hosted service in the first place. And "Ada Okonkwo has a severe tree-nut allergy and carries an epi-pen" is medical data about a third party who never signed anything.

So Mise adds a gate in front of it:

```
                          ┌─ router ─────────────────────────┐
  a line of service       │  may this leave the building?    │
  chatter          ───────┤                                  │
                          └──┬───────────────────┬───────────┘
                             │ operational       │ medical / protected
                             ▼                   ▼
                    XTrace Memory            x-vec vault
                    hosted, grouped          AES content
                    personal gate applies    Paillier vectors
                    ↓                        never leaves the machine
                    "Ines Barros is on       "Ines Barros is coeliac;
                     table 3 tonight"         the fry station is a risk"
                            └──── joined at read time by name ────┘
```

**Public pointer, private payload.** Hosted memory holds the fact that a named guest is in the room; the vault holds what that name implies. At read time the agent expands its vault query with every proper name the hosted read just surfaced — without that, a cook asking "can I use the same fryer?" never reaches a record that does not contain the word *fryer*.

Debriefs get the same treatment in reverse. A procedure has to be shareable — that is the point of writing one — but it usually names the condition that prompted it. So the condition comes out and the category goes in:

> ~~when any ticket carries a **coeliac** flag~~ → when any ticket carries a **[dietary restriction]** flag

Same procedure, same tool anchors, same meaning to a cook. The diagnosis stays in the vault, where the record already was.

---

## Running it

Everything works with no credentials at all — there is an offline stand-in for the memory service and an AES-encrypted local file for the vault. Conference wifi is not a dependency.

```bash
npm install
cp .env.example .env       # optional: add your XTrace key
npm run setup              # register groups, check the connection
npm run seed               # load the pre-service corpus
npm run replay             # five services, three architectures
npm run dev                # the live board at localhost:5174
```

Ask it something and see exactly what it pulled and from where:

```bash
npm run inspect -- "can I run the churros and the calamari out of the same fryer?"
npm run inspect -- --trigger fire_ticket
```

### Against the real service

Every conversation is an LLM extraction on the hosted path, so trim the
background corpus for a live run:

```bash
npm run setup                     # register the groups, confirm the key works
npm run replay -- --noise 20      # ~100 ingests, 8 at a time
npm run inspect -- --trigger fire_ticket
```

Drop `--noise` entirely and it loads all 280 background messages across three
arms, which is roughly 900 extractions. Fine overnight, not fine on stage.

The encrypted vault needs its Python side up. Skip it and the fallback is still local, which for this class of data is the conservative failure:

```bash
cd vault
python -m venv .venv && .venv\Scripts\activate     # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
xtrace init && xtrace kb create mise-vault         # note the KB id
python service.py
```

---

## Layout

```
src/
  agent.ts              recall → trigger → vault → act → learn
  memory/store.ts       one interface, two backings (hosted / offline)
  memory/router.ts      the second gate, and debrief redaction
  memory/vault.ts       x-vec client, AES-file fallback
  memory/offline.ts     the stand-in — honest about what it approximates
  eval/harness.ts       three arms, identical scoring
vault/service.py        x-vec behind a local HTTP interface
web/index.html          the board
data/                   guests · seed · 5 services · 280 background messages
scripts/build_dataset.py  regenerates all of data/
```

---

## Honest notes

- **The offline stand-in is a fallback, not a reimplementation.** It approximates extraction with one fact per turn, the personal gate with a keyword list, and search with lexical overlap. Everything it gets wrong, the hosted service gets right. `src/memory/offline.ts` says so at the top.
- **The background corpus exists to make precision matter.** With 30 tidy memories, scoping does not pay — the pooled baseline scored 88% against Mise's 85% and the honest move was to say so rather than tune until the chart flattered the project. 280 background messages later, the gap is real. This is the trade XTrace's own Groups guide states outright: a catch-all trades precision for recall.
- **SDK 0.6 no longer takes `orgId`** — it derives the org from the key, though the authentication guide still documents both. `XTRACE_ORG_ID` stays in `.env` because x-vec and the raw HTTP API still want the header.
- **Directive tagging is best-effort.** Whether a fact lands in a group is an LLM relevance call, and the personal gate fails closed. Nothing here requires a specific fact to be tagged.

---

## Where it goes

Restaurant groups already pay for POS, reservations, and scheduling, and none of them retain a single thing about how service actually ran. The wedge is a group with 5–50 rooms where staff turnover is 70%+ annually and every departure is an uncompensated loss of operating knowledge.

The architecture is not about restaurants. Any operation where the knowledge is procedural, the staff rotate, and some of what gets said is somebody's medical record — clinics, home care, schools, field service — has the same two problems and the same two gates.
