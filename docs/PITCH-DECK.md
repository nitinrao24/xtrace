# Mise — pitch deck

12 slides. Bullets go **on** the slide; speaker notes are what you **say**.

Keep bullets short — 4 to 7 words. If a bullet is a sentence, the audience reads
instead of listening. Several of these slides are 10-second slides. Only 2, 5, 8
and 9 deserve real time.

**Pacing:** ~15s per slide average. Slides 5, 8, 9 get 30s each. Slides 1, 3, 4,
11, 12 get 8–10s.

---

## Slide 1 — Title

> # MISE
> ### A service agent that learns the house
> Built on XTrace Memory · XTrace × Berkeley Summit House · July 2026

**Image:** None. Black slide, red accent. Match the dashboard palette.

**Say:** *"Mise. It's a French kitchen term — mise en place — everything in its
place. That's the whole idea, and I'll show you why."*

Don't explain the name further. It pays off on slide 6.

---

## Slide 2 — The problem

- Ask a POS what it remembers → tickets, covers, totals
- Ask the **room** → something else entirely
- Scallops need 9 minutes, not 4
- Table 8 can't be offered wine
- None of it is written down
- **70% of restaurant staff leave every year**

**Image:** None, or a single photo of a busy kitchen pass. Don't compete with
your own voice here.

**Say:** *"A restaurant manager can tell you exactly what their point-of-sale
remembers. Covers, tickets, totals. Ask them what the room remembers and it's a
completely different answer — that the scallops need nine minutes not four, that
the six-top gets fired in two waves, that the guest on table 3 can't go near the
fryer. That lives in the head of whoever worked last night. Turnover in this
industry is seventy percent a year. Every time someone quits, the restaurant gets
worse at its own job."*

This is your cold open. Land it before any slide does work for you.

---

## Slide 3 — What we built

- An agent that remembers how service ran
- Learns from each night's mistakes
- Warns staff **before** the mistake repeats
- Keeps guest medical data off the cloud entirely

**Image:** None.

**Say:** *"So we built an agent that holds that knowledge. Two jobs — remember
enough that tonight goes better than last night, and don't become the place a
guest's medical record ends up. Most memory demos do the first and quietly fail
the second. We measured both."*

---

## Slide 4 — Four kinds of memory

| | |
|---|---|
| **Semantic** | Bayview short-ships nettles 1 week in 3 |
| **Episodic** | Wednesday, 84 covers, fridge hit 43°F |
| **Artifact** | The prep sheet the agent writes at close |
| **Procedural** | Confirm the first wave went out before firing the second |

- Most projects use one
- We use all four
- **Procedural is the one that compounds**

**Image:** None — the table is the visual.

**Say:** *"XTrace splits memory into four types. Most projects here will use one.
We use all four, because restaurant operations genuinely need all four. The last
one is the interesting one — it's the only kind that changes what the agent does
rather than what it knows. Facts make an agent smarter. Procedures make it
better."*

---

## Slide 5 — The tripwire ★

- Most memory is a **library** — you ask, it finds
- Ours is a **tripwire** — it fires before you act
- Monday: second wave sent early → $200 comped
- Friday: agent about to fire a ticket → **Monday's lesson appears**
- Nobody asked a question
- Exact identifier match, not similarity — silent unless it matters

**Image:** ★ **Screenshot of the rail, cropped tight.** Use your second
screenshot — the right-hand column showing the red-outlined `PROCEDURE /
FIRE_TICKET` ticket reading *"Before calling fire_ticket with second_wave true,
confirm the first wave was picked up"* with *"▲ fired before fire_ticket ran"* at
the bottom.

Crop to just that one ticket, blown up large. It's the single most convincing
image you have.

**Say:** *"This is the piece I actually care about. Most memory systems work like
a library — you ask a question, you get a book back. Fine, but you have to know
to ask. Ours is a tripwire. On Monday this restaurant sent a second round of
plates before the first was picked up and comped two hundred dollars. That went
into the nightly debrief. On Friday, before the agent fires any ticket, that
Monday lesson surfaces on its own. Nobody asked it a question. It matches on the
exact identifiers in the action about to run — so it's silent unless it has
something to say, which is what makes it safe to run before every single
action."*

**Pause after "Nobody asked it a question."** That's the line.

---

## Slide 6 — Public pointer, private payload

- "Ada has a nut allergy" = medical data about a stranger
- **Two gates, in order:**
- Router → may this leave the building?
- XTrace's personal gate → may it cross between staff?
- Medical lines → encrypted vault on the restaurant's own machine
- The halves rejoin **by name**, at read time

**Image:** A simple two-branch diagram. One box splitting into two:
`XTrace Memory (cloud, shared)` and `x-vec vault (local, encrypted)`, with a
dotted line labelled "joined by name" connecting them. Draw it in Keynote/Slides
— 2 minutes of work, and it beats any screenshot here.

**Say:** *"Some of what gets said in a restaurant is nobody's business. A severe
nut allergy is medical information about a customer who never signed anything.
XTrace has a gate that stops that data crossing between staff, and we rely on it
— but it governs sharing, not transmission. The text still reaches the server.
So we put a gate in front. Medical lines go into an encrypted store on the
restaurant's own machine. And the two halves talk by name — the cloud knows Ines
is on table 3 tonight, the vault knows what that means. Mise en place. Everything
in its place."*

The name pays off here. Don't rush it.

---

## Slide 7 — How we tested it

- Same five services, run **three ways**, scored identically
- **Context window only** — smart agent, no memory
- **Single shared pool** — one big bucket (what most demos do)
- **Mise** — routed, grouped, tripwired
- Beating "no memory" proves nothing
- So we built the **good** version of the obvious approach

**Image:** None.

**Say:** *"We didn't just build it and say it's good. Same five services, three
architectures, identical scoring. And the middle one matters — if we only
compared against an agent with no memory, we'd be beating a strawman. So we built
the good version of the obvious approach: one shared pool, everything in it.
That's the real thing to beat."*

---

## Slide 8 — Results ★

| | fidelity | 1 → 5 | records exposed |
|---|---|---|---|
| Context window only | 48% | 71% → 40% | 0 |
| Single shared pool | 88% | 88% → **88%** | **6** |
| **Mise** | **96%** | **88% → 100%** | **0** |

- Fidelity = did it retrieve what it needed
- Exposed = private records sent to a hosted service

**Image:** ★ **The full dashboard**, your first screenshot. Three grey/red bar
groups. Either put it full-bleed with the table overlaid, or table on the left,
screenshot on the right.

**Say:** *"Fidelity is the fraction of facts the agent needed and actually
retrieved — scored on the context it assembled, not on text it generated, so
there's no model grading another model anywhere in this number. Grey is a very
good agent with a long context window. It starts fine and flatlines, because
every night it starts over. Blue is the shared pool. Amber is us."*

Then go straight to slide 9. Don't editorialise yet.

---

## Slide 9 — The finding ★

> # 88% → 88%
> ### The obvious approach does not learn.

- Five services. No improvement.
- One bucket has nowhere for a lesson to live
- Mise: 88% → **100%**
- And the baseline's 88% is **bought** with 6 medical records

**Image:** None — this slide is one number. Give it the whole screen.

**Say:** *"Here's the finding. The shared pool ends its fifth service exactly
where it started. Eighty-eight to eighty-eight. It doesn't learn, because one
undifferentiated bucket has nowhere for a lesson to live. We go to a hundred.*

*And notice the last column. The baseline's accuracy is partly purchased with six
guest medical records sitting on a hosted server — allergies, a coeliac
diagnosis, someone in recovery. We're holding zero. Same accuracy, none of the
liability."*

**This is your best slide.** More than the 96%. Anyone can show a high number;
"the obvious approach does not learn" is a finding.

---

## Slide 10 — What we got wrong

- Built on XTrace's `trigger` endpoint
- Measured what was actually stored:
- **237 facts · 49 episodes · 12 artifacts · 0 directives**
- Rules extract fine — they're just typed as facts
- Tested a fix. **Hypothesis was wrong.**
- Kept the pattern, moved matching to our side

**Image:** Optional — a screenshot of the `npm run inspect -- --directives`
terminal output showing the type breakdown. Small, bottom corner.

**Say:** *"One thing I want to be straight about. We built on XTrace's trigger
endpoint for procedural recall. Then we measured what was actually there — two
hundred ninety-eight memories, zero typed as directives. The rules extract
perfectly, they're just typed as facts, so trigger had nothing to match. We had a
theory about why, tested it, and were wrong. So we kept the pattern and moved the
matching to our side. Same contract — nothing fires unless the pending action
matches."*

Judges trust people who volunteer their own failures. This slide buys credibility
for every other number in the deck. **Do not cut it.**

---

## Slide 11 — Where it goes

- Restaurant groups, 5–50 rooms
- Already paying for POS, reservations, scheduling
- None of it retains **how service ran**
- Priced per room
- The churn that creates the problem is the renewal argument
- Not really about restaurants: clinics, home care, field service

**Image:** None.

**Say:** *"Restaurant groups with five to fifty rooms already pay for POS,
reservations, and scheduling, and not one of those retains anything about how
service actually ran. Priced per room — and the churn that creates the problem is
also the renewal argument. But the architecture isn't about restaurants. Any
operation where the knowledge is procedural, the staff rotate, and some of what
gets said is somebody's medical record has the same two problems and needs the
same two gates."*

---

## Slide 12 — Close

> ### Most memory demos prove an agent can recall.
> ### We measured whether it gets **better** — and whether it stayed **safe**.

- Runs fully offline — this just ran without wifi
- github.com/nitinrao24/xtrace

**Image:** None.

**Say:** *"Most memory demos prove an agent can recall. We measured whether it
gets better, and whether it stayed safe doing it. It runs completely offline by
design, so it just ran on this wifi. Everything's on GitHub."*

Then **stop talking.** Silence is confidence.

---

## Image checklist

| Slide | What to capture |
|---|---|
| **5** ★ | Rail cropped to one red `PROCEDURE / FIRE_TICKET` ticket, blown up. Must show "▲ fired before fire_ticket ran". |
| **6** | Hand-drawn two-branch diagram: cloud vs vault, "joined by name" |
| **8** ★ | Full dashboard — all three arms visible |
| **10** | Optional: `--directives` terminal output, small |

Everything else is text. Four images in twelve slides is right — every image you
add competes with your voice.

**Take the screenshots fresh** after running all three arms, so the pooled and
blind rows are populated. Right now your board only has Mise filled in.

---

## If you're cut to 2 minutes

Slides **2 → 5 → 8 → 9 → 12**. That's the whole argument: the problem, the
tripwire, the numbers, the finding, the close.

## Speaking split, four people

- **Slides 1–3** — one person opens. Whoever is most comfortable cold.
- **Slides 4–6** — the architecture. Needs to know the four types and the split.
- **Slides 7–9** — the results. Needs to defend the methodology under questioning.
- **Slides 10–12** — the honest slide and the close. Hardest to deliver well
  because it requires not sounding defensive.

Whoever takes 7–9 should also field questions — that's where they'll come.
