# Long context, or memory?

The strongest argument against building memory systems is that you shouldn't have
to. Windows get longer and cheaper every year. Put the whole history in the
prompt and let attention sort it out.

We built that agent as one of our three arms and gave it every advantage: the
pre-service corpus, every service turn, every nightly debrief, nothing ever
evicted. Then we scored it identically to the others.

## It wins

| | avg fidelity | service 1 → 5 | tokens per answer |
|---|---|---|---|
| **Full transcript in context** | **100%** | 100% → 100% | 569 → **1,215** |
| Single shared pool | 88% | 88% → 100% | 307 → 352 |
| Mise | 90% | 88% → 100% | 343 → 704 |

*(offline stand-in; on the hosted service Mise reaches 96%)*

A long-context agent is perfect on this workload. Not competitive — perfect. Five
services of restaurant chatter is a few thousand tokens, which is nothing, and
attention finds every fact we ask for.

**That is the honest result and we lead with it.** Any pitch that buries this is
one question away from falling apart, because the first person who thinks about
it will ask.

## What it costs

The interesting number is not the accuracy. It's the shape of the curve.

The long-context prompt grew **2.1× in five nights** and is linear in everything
ever said. Extrapolating the fit to a year of service is roughly **59,000 tokens
per answer** — for one question, from one server, about one table. *(Linear fit on
five points. An estimate, not a measurement.)*

A retrieval-bounded context does not have that property. Mise's prompt is capped
by what recall returns, so it grows with the *relevance* of history rather than
its *length*. The gap at service five is 1.7×. At service fifty it isn't a
multiple worth writing down.

Restaurants run 360 services a year. This is not a hypothetical horizon.

## What it transmits

There's a second column that matters more, and it's the one the long-context
framing hides.

| | where protected data ends up |
|---|---|
| Single shared pool | 6 medical records written to a hosted memory service |
| Full transcript in context | **5 protected lines in every prompt**, sent to the model provider on every call |
| Mise | 0 — routed to an encrypted local store before either could happen |

A long-context agent has no memory service to leak from, so it scores zero on
records-exposed and looks clean. Then it ships every allergy and every diagnosis
it has ever been told with **every question it answers**.

**Not storing data is not the same as not transmitting it.** One is a database
you can audit, delete from, and put under a retention policy. The other is an
egress event per query, to a third party, with no record of what went out.

For a restaurant that's careless. For a clinic it's the thing that stops the
deployment.

## The framing

> **Context is state. Memory is structure.**

A window holds what happened. It has no opinion about what any of it means, what
supersedes what, what's shareable, or what should fire before you act. Those are
structural questions, and structure is what you build a memory layer to impose.

Every one of our differentiators is a structural claim that a window cannot make:

- **Routing** — this line may leave the building, that one may not
- **Scoping** — this belongs to the floor, that belongs to one person
- **Redaction** — keep the procedure, drop the diagnosis
- **The tripwire** — fire this before that action runs, and stay silent otherwise

None of those are retrieval problems. Retrieval is what you do once you've
decided them.

## Where long context genuinely wins

State this before someone else does. An argument with no boundary reads as
advocacy.

- **Short horizons.** Under a few hundred turns, just use the window. We proved
  that ourselves.
- **Novel reasoning across the whole history.** Attention over everything beats
  retrieving twelve rows when the question needs synthesis rather than lookup.
- **Cold start.** No corpus, no groups, no schema. Working in one line of code.
- **When you can't run infrastructure.** A memory layer is a service to operate.

The honest position: **long context is the right default, and it stops being the
right default at exactly the point where history outlives a session, cost scales
with tenure, or someone in the room has a diagnosis.**

That's our market. Not "memory beats context." It's narrower and it's true.

## What we'd need to prove this properly

Five services and 30 turns is small, and we won't pretend otherwise.

1. **Extend to 50+ services** and find where the long-context curve actually
   crosses — measured, not fitted.
2. **Price both arms** at real per-token rates, in dollars per service.
3. **Test degradation, not just cost.** Our long-context arm held at 100% because
   the corpus is clean. Add contradictions — a supplier changes, a dish comes off
   — and a window with no supersession model should start losing to one that
   knows which fact won.

Number three is the real experiment. If it holds, the argument stops being about
cost and starts being about correctness, which is a much stronger place to stand.
