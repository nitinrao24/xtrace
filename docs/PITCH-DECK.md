# Mise — pitch deck

12 slides. Bullets go **on** the slide; speaker notes are what you **say**.

**The spine of this deck:** agent memory has four well-known failure modes.
Slides 5, 6 and 7 each name one, explain why it happens, and show the mechanism
we built for it. Slide 10 shows all four measured. That structure is what makes
this a product pitch rather than a demo — every claim is a named industry problem
with a mechanism attached and a number behind it.

Bullets stay short — 4 to 7 words. If a bullet is a sentence, the room reads
instead of listening.

**Pacing:** ~15s average. Slides 5, 6, 7, 9, 10 get 25–35s. Slides 1, 3, 4, 12
get 8–10s.

---

## Slide 1 — Title

> # MISE
> ### A service agent that learns the house
> Built on XTrace Memory · XTrace × Berkeley Summit House · July 2026

**Image:** None. Near-black, mint accent, matching the board.

**Say:** *"Mise. It's a French kitchen term — mise en place — everything in its
place. That's the whole idea, and I'll show you why."*

Don't explain the name. It pays off on slide 6.

---

## Slide 2 — The problem

- Ask a POS what it remembers → tickets, covers, totals
- Ask the **room** → something else entirely
- Scallops need 9 minutes, not 4
- Table 8 can't be offered wine
- None of it is written down
- **70% of restaurant staff leave every year**

**Image:** None, or one photo of a kitchen pass.

**Say:** *"A restaurant manager can tell you exactly what their point-of-sale
remembers. Covers, tickets, totals. Ask what the room remembers and it's a
different answer — that the scallops need nine minutes not four, that the six-top
gets fired in two waves, that the guest on table three can't go near the fryer.
That lives in the head of whoever worked last night. Turnover is seventy percent a
year. Every time someone quits, the restaurant gets worse at its own job."*

Cold open. Land it before any slide does work for you.

---

## Slide 3 — Memory is the obvious answer. It's also mostly broken.

- Four failure modes everyone hits:
- **Recall ≠ improvement** — it remembers, it doesn't get better
- **One pool leaks** — private data goes where everything goes
- **Nothing retires** — stale facts retrieved with full confidence
- **Cost scales with tenure** — your best customer is your most expensive
- We built a mechanism for each. All four are measured.

**Image:** None.

**Say:** *"So you add memory. Everyone does. And you hit the same four walls.
Recall isn't improvement — remembering my name doesn't make the agent better at
its job. One pool leaks, because the same bucket that holds the menu holds the
allergy. Nothing ever retires, so a fact that stopped being true gets retrieved
with exactly the same confidence as one that didn't. And cost scales with tenure —
your longest-standing customer becomes your most expensive one.*

*We built a mechanism for each. The next three slides are those mechanisms, and
slide ten is all four measured."*

This slide is the pitch. Everything after it is evidence.

---

## Slide 4 — Four kinds of memory

| | |
|---|---|
| **Semantic** | Bayview short-ships nettles 1 week in 3 |
| **Episodic** | Wednesday, 84 covers, fridge hit 43°F |
| **Artifact** | The prep sheet written at close |
| **Procedural** | Confirm the first wave went out before firing the second |

- Most projects use one
- We use all four
- Each layer compresses the one below it

**Image:** None — the table is the visual.

**Say:** *"XTrace splits memory into four types, and most projects here use one.
We use all four, because they're a compression cascade — raw turns collapse into
episodes, episodes yield facts, facts consolidate into procedures. Each layer up
is smaller and more stable than the one below. That's the thing a context window
doesn't have."*

---

## Slide 5 — Failure 1: recall isn't improvement ★

- Most memory is a **library** — you ask, it finds
- Ours is a **tripwire** — it fires before you act
- Monday: second wave sent early → $200 comped
- Friday: agent about to fire → **Monday's lesson appears**
- Nobody asked a question
- Silent unless the exact action matches

**Image:** ★ **The rail, cropped to one amber PROCEDURE card**, blown up. It must
show *"Before calling fire_ticket with second_wave true, confirm the first wave
was picked up"* and *"▲ fired before fire_ticket ran"*.

One card. Not the whole rail.

**Say:** *"First failure: recall isn't improvement. Most memory works like a
library — you ask, you get a book. Fine, but you have to know to ask, and the
mistake you're about to make is exactly the thing you don't know to ask about.*

*Ours is a tripwire. On Monday this restaurant sent a second round of plates
before the first was picked up and comped two hundred dollars. That went into the
nightly debrief. On Friday, before the agent fires any ticket, that Monday lesson
surfaces on its own. Nobody asked it a question. It matches on the exact
identifiers in the action about to run, so it's silent unless it has something to
say — which is what makes it safe to run before every single action."*

**Pause after "Nobody asked it a question."**

---

## Slide 6 — Failure 2: one pool leaks ★

- "Ada has a nut allergy" = medical data about a stranger
- Sharing controls don't stop **transmission**
- **Two gates, in order:**
- Router → may this leave the building?
- Personal gate → may it cross between staff?
- Medical lines → encrypted, on-premises
- The halves rejoin **by name**, at read time

**Image:** A two-branch diagram. One box splitting into `XTrace Memory (hosted,
shared)` and `x-vec vault (local, encrypted)`, dotted line labelled "joined by
name." Draw it — two minutes in Slides, beats any screenshot.

**Say:** *"Second failure: one pool leaks. Some of what gets said in a restaurant
is nobody's business — a severe nut allergy is medical information about a
customer who never signed anything.*

*Every memory product has one policy layer: who can see what. That governs
sharing. It does nothing about transmission — the text still reaches the server.
So we put a gate in front of it. Medical lines go to an encrypted store on the
restaurant's own machine, and the two halves talk by name. The cloud knows Ines is
on table three tonight; the vault knows what that means. Mise en place. Everything
in its place."*

The name pays off here. Don't rush it.

---

## Slide 7 — Failure 3: nothing retires ★

- Supplier changes. New grill. Dish comes off.
- Old facts stay **fluent and confident**
- Wrong is worse than missing
- **Supersession** — contradicted facts retire, history kept
- **Decay** — 45-day half-life breaks near-ties
- **Revision** — newest rule wins per action

**Image:** None, or the service-six terminal block.

**Say:** *"Third failure, and it's the one nobody talks about. Memory systems
accumulate. Nothing retires. When the produce supplier changes, 'Bayview
short-ships nettles one week in three' doesn't start sounding false — it stays
perfectly fluent, and the agent retrieves it forever.*

*Being wrong is worse than not knowing, because it's confident. So we built
supersession: a later statement that contradicts an earlier one retires it. We
keep the old row, so you can still ask what we used to do — it just stops being
offered as current. Plus recency decay, and directive revision so two versions of
the same rule never fire at once."*

---

## Slide 8 — How we tested it

- Same services, run **three ways**, scored identically
- **Full transcript in context** — everything in the window, nothing evicted
- **Single shared pool** — one big bucket (what most demos do)
- **Mise** — routed, superseded, tripwired
- Beating "no memory" proves nothing
- So we built the **strongest** version of each alternative

**Image:** None.

**Say:** *"Six services, three architectures, identical scoring. And we gave the
alternatives every advantage — the first arm is a long-context agent that gets the
whole corpus, every turn, every debrief, and never evicts anything. If we'd only
compared against an agent with no memory, we'd be beating a strawman."*

---

## Slide 9 — Results, and the concession ★

| | fidelity | tokens/answer | records exposed | stale facts |
|---|---|---|---|---|
| **Full transcript** | **100%** | 569 → **1,215** | 0 stored | **4** |
| Single shared pool | 88% | 307 → 352 | **6** | **3** |
| **Mise** | **96%** | 343 → 704 | **0** | **1** |

- **Long context wins on accuracy. It's perfect.**
- Six services fit in a window
- That's the honest result at this scale

**Image:** ★ **The full board**, all three arms populated, from the hosted run.

**Say:** *"Here's the honest result, and I'll lead with the part that doesn't
flatter us. The long-context agent is perfect. Not competitive — perfect. A
hundred percent, every service. Six nights of restaurant chatter is a few thousand
tokens and attention finds everything we ask for. At this scale, just putting it
all in the prompt wins.*

*So the question isn't accuracy. It's what that accuracy costs, what it sends, and
whether it's still true."*

**Do not skip the concession.** Conceding the obvious objection before it's raised
is the most credible move you have, and you win on the next slide anyway.

---

## Slide 10 — Four findings ★

> **1. Cost is linear in history**
> 2.1× in five nights · ~59,000 tokens/answer at a year
>
> **2. The shared pool doesn't learn**
> 88% → 88%. Six services, no improvement.
>
> **3. Not storing ≠ not transmitting**
> Long context ships 5 protected lines in **every prompt**
>
> **4. A window can't supersede**
> 4 retired facts still answering. Ours: 1.

**Image:** None. Four statements, whole screen.

**Say:** *"Four things.*

*One, cost. That prompt grew two point one times in five nights and it's linear in
everything ever said. Restaurants run three hundred sixty services a year.*

*Two, the shared pool ends where it started. Eighty-eight to eighty-eight. It
doesn't learn, because one bucket has nowhere for a lesson to live.*

*Three — the long-context agent has no memory service to leak from, so it scores
zero on records exposed and looks clean. Then it ships every allergy it's ever been
told with every question it answers. Not storing data is not the same as not
transmitting it.*

*Four, and this is the one. On our sixth service, four things stop being true —
new supplier, new grill, a dish off the menu, a replaced compressor. Every arm
finds the new facts. Only one stops offering the old ones. A window holds both
versions and has no way to know which won.*

*That's where this stops being about cost and starts being about correctness."*

---

## Slide 11 — What we got wrong

- Built on XTrace's `trigger` endpoint
- Measured: **237 facts · 49 episodes · 12 artifacts · 0 directives**
- Rules extract fine — they're typed as facts
- Tested a fix. **Hypothesis was wrong.**
- Our router missed *"no peanuts, could be fatal"*
- Supersession is lexical — it will miss subtle contradictions

**Image:** Optional — `--directives` output, small, corner.

**Say:** *"Three things I want to be straight about. We built on XTrace's trigger
endpoint, then measured what was actually stored — two hundred ninety-eight
memories, zero typed as directives. The rules extract perfectly, they're just typed
as facts. We had a theory why, tested it, were wrong, and moved the matching to our
side.*

*Our own privacy router had a hole — it caught the word 'allergy' but would have
missed 'no peanuts for table six, could be fatal.' Found it, fixed it, still a word
list.*

*And supersession is lexical. It catches contradictions with a change marker or a
number that disagrees. It will miss one phrased carefully enough. That needs a
classifier, and we're not claiming it's solved."*

Judges trust people who volunteer their failures. **Do not cut this slide.**

---

## Slide 12 — Where it goes, and close

- Restaurant groups, 5–50 rooms · priced per room
- Already paying for POS, reservations, scheduling
- None of it retains **how service ran**
- **The wedge, not the market**
- Compliance-safe memory wherever regulated data is spoken
- Runs fully offline — this just ran without wifi
- github.com/nitinrao24/xtrace

**Say:** *"Restaurant groups with five to fifty rooms already pay for POS,
reservations and scheduling, and none of it retains anything about how service ran.
Priced per room — and the churn that creates the problem is also the renewal
argument. But restaurants are the wedge, not the market. Any operation where the
knowledge is procedural, the staff rotate, and some of what gets said is somebody's
medical record has the same four problems.*

*Most memory demos prove an agent can recall. We measured what it costs, what it
transmits, and whether it's still true. It runs offline by design, so it just ran
on this wifi. Everything's on GitHub."*

Then **stop talking.** Silence is confidence.

---

## Question you will get, and the answer

**"Why doesn't XTrace just build this?"**

> *"Nothing stops them building the tripwire — they already have. What they won't
> build is the layer deciding what never reaches them. That's structurally against
> their interest, and it's the first thing a regulated buyer asks for. We'd rather
> be what makes their product deployable in healthcare than compete with it."*

**"Isn't your baseline a strawman?"**

> *"It beat us at first — 88 to our 85 at small scale. And the long-context arm
> still beats us on accuracy. We say so on slide nine."*

**"Is the hosted trigger endpoint what's firing?"**

> *"No. It's called first and returns empty — we measured it. The match runs
> client-side over semantic memory. Same contract, our side of the wire."*

---

## Image checklist

| Slide | What to capture |
|---|---|
| **5** ★ | One amber `PROCEDURE` card from the rail, blown up |
| **6** | Hand-drawn two-branch diagram: hosted vs vault |
| **9** ★ | Full board, three arms populated, **hosted** run |
| **11** | Optional: `--directives` output, small |

Four images in twelve slides. Take them fresh after `npm run replay -- --noise 0`.

## If you're cut

- **2 minutes:** 3 → 5 → 9 → 10 → 12
- **60 seconds:** slide 10 alone. The four findings are the project.

## Speaking split, four people

- **1–3** — opener and the four failure modes. Sets up everything.
- **4–7** — the mechanisms. Must know all four memory types and all three gates.
- **8–10** — results. Must deliver the slide 9 concession without sounding
  apologetic, and field questions afterwards. Hardest slot.
- **11–12** — honesty and close. Requires not sounding defensive.
