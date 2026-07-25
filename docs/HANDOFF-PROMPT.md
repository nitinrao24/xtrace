# Paste this into Claude

Everything below the line is the prompt. It carries all the context your Claude
needs — it has never seen this project.

---

I'm working on a hackathon project called **Mise** and I want your help making it
sharper for investors, specifically around the memory-versus-long-context
argument. Please start by cloning and reading the repo:

```bash
git clone https://github.com/nitinrao24/xtrace.git
cd xtrace
```

Read `README.md`, `docs/ARCHITECTURE.md`, `docs/TEAM-BRIEF.md`,
`docs/PITCH-DECK.md`, and the source under `src/` before you suggest anything.
Do not skip this — the repo contains measured results and honest caveats that
must not be contradicted by anything you write.

## What Mise is

A service-operations agent for restaurants, built on XTrace's memory API. It uses
all four memory types (semantic, episodic, artifact, procedural), routes
sensitive lines away from the hosted service into an encrypted local vault, and
fires procedural memory as a tripwire immediately before the agent acts.

It runs the same five simulated services three ways and scores them identically:

| Arm | What it is | avg fidelity | service 1 → 5 | guest records exposed |
|---|---|---|---|---|
| Context window only | long-context agent, no persistence | 48% | 71% → 40% | 0 |
| Single shared pool | one catch-all memory group | 88% | 88% → **88%** | **6** |
| **Mise** | routed, grouped, tripwired | **96%** | **88% → 100%** | **0** |

Two metrics:

- **Context fidelity** — of the facts the agent needed in hand before acting, how
  many it retrieved. Scored on the assembled context, not on generated prose, so
  no model grades another model.
- **Records exposed** — third-party medical facts sent to the hosted service,
  counted at the wire when the request goes out, not at retrieval.

## Things that are true and must stay true

Do not let any rewrite contradict these. They are measured, and several are
deliberately unflattering.

1. The **hosted `trigger` endpoint returns empty**. A census of stored memories
   returned 237 facts, 49 episodes, 12 artifacts, **zero** `lesson`/`procedure`
   rows. The rules extract correctly, they are just typed as facts. The tripwire
   therefore matches **client-side** over semantic memory. The repo says this
   plainly and it must continue to.
2. A hypothesis about debrief phrasing was **tested and disproved**
   (`src/scripts/probe.ts`). Keep that in.
3. The pooled baseline **beat Mise at first** — 88% to 85% at small scale. The
   gap only appears with realistic background traffic. Keep that in.
4. There is an **offline stand-in** that approximates extraction crudely. It is a
   fallback, not a reimplementation.
5. The data is **synthetic**. Five simulated services, 280 synthetic background
   messages. There is no real customer.

Never invent traction, pilots, LOIs, or revenue. If a claim needs evidence the
repo doesn't have, mark it as an assumption in square brackets.

## What I want you to do

### 1. Sharpen the long-context-versus-memory argument

This is the main thing. The "context window only" arm is a long-context agent
with no persistence, and it goes 71% → 40% across five services — it gets
*worse*, because more is said each night and none of it is retained.

That's live-debate evidence. As context windows get cheaper and longer, the
common view is that memory systems become unnecessary. This project has data
arguing otherwise. Help me make that argument precisely and defensibly:

- What exactly does a long context window fail to do that persistent memory does?
- Why does the pooled arm plateau at 88% — is that a retrieval-precision ceiling,
  and does that ceiling apply to long context too?
- Where is the honest boundary? Long context genuinely wins at some things; say
  which, or the argument sounds like advocacy.
- Is "context is state, memory is structure" the right framing, or is there a
  better one? Push back on me if you have a sharper one.

Be skeptical here. Tell me if the data doesn't support the claim I want to make.
A weaker argument I can defend beats a stronger one that collapses under one
question.

### 2. Strengthen the investor case

Read `docs/PITCH-DECK.md`, then improve it along these lines:

- **Reframe the wedge.** Currently pitched as a restaurant product. I think the
  stronger framing is a *compliance-safe memory layer for operations agents*,
  with restaurants as the wedge — because the two-gate split is what unblocks
  agent memory anywhere regulated data gets spoken aloud (clinics, home care,
  schools, HR, field service). Tell me if you disagree.
- **Name the regulation.** "6 records exposed" is abstract. Allergy and diagnosis
  data is special-category data under GDPR Article 9. Work out what else applies,
  flag anything you're unsure of, and turn the metric into a liability argument.
  Do not state legal conclusions as fact — this is a pitch, not advice.
- **Do the ROI math.** The dataset contains a $200 comp caused by a missing
  procedure. Extrapolate conservatively across a 20-room group and show your
  assumptions.
- **Name the retention curve.** Mise starts at 88%, same as the naive approach,
  and reaches 100% by service five. A customer with a year of history has memory
  they can't take with them. That's the moat and the product argument on one
  graph.
- **Answer "why doesn't XTrace just build this?"** My current answer: they'd
  build the tripwire (they have), but not the layer deciding what never reaches
  them — that's against their interest and it's what a regulated buyer needs.
  Sharpen it.

### 3. Make it more technically distinctive

Suggest **two or three** concrete additions, ranked by impact per hour of work,
that would make this more novel rather than more polished. Bias toward things
that strengthen the memory argument. Some directions worth considering, though I
want your own ideas too:

- A memory-decay or supersession model — service knowledge goes stale (a supplier
  changes, a dish comes off), and nothing currently handles contradiction over
  time.
- A cost axis: tokens and dollars per service for each arm. Long context is
  expensive; if Mise is cheaper *and* better, that's a second axis on the chart
  and investors read cost curves fluently.
- A conflict case: two staff record contradictory facts. Which wins, and how does
  the system know?
- Anything you think is stronger.

For each, say what it proves, roughly how long it takes, and what could go wrong.
**Do not build any of them until I pick one.**

## Constraints

- **Do not break the working demo.** `npm run replay` and `npm run dev` must keep
  working, offline and hosted. Typecheck with `npx tsc --noEmit` before you hand
  me anything.
- **Keep every honesty section.** The measured null result, the failed
  hypothesis, the baseline that beat us — those are load-bearing for credibility.
- Match the existing code style: comments explain *why*, not *what*.
- The dashboard palette is near-black with a single red accent. Don't redesign it.
- Node runs TypeScript directly via `--experimental-strip-types`, so no enums, no
  namespaces, no parameter properties. Use `import type` for type-only imports.

## What to hand me

1. **A written analysis first** — the long-context argument, the investor
   reframe, and your ranked technical suggestions. Before any code.
2. **Then, once I've picked**, the changed files as a **downloadable zip**, along
   with the exact Windows PowerShell commands to drop them into
   `C:\Programming\xtrace` and overwrite the originals.
3. **Then the git commands** to commit and push to
   `https://github.com/nitinrao24/xtrace` — including a check that `.env` is not
   staged, since it holds an API key.

Start with the analysis. Tell me where you think I'm wrong.
