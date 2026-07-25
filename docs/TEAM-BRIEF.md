# Mise — team brief

Read this once and you can answer anything a judge asks.

Every section has two halves. **The simple version** is what you'd tell a smart
kid. **The precise version** is what you say to the Berkeley professor who
directs AI at NVIDIA. Learn the simple one first — if you can't explain it
simply, you'll get caught out when someone pushes.

---

## 1. What we built

**Simple:** A helper for a restaurant that actually remembers things. Most
computer helpers forget everything the moment you close them, so the restaurant
makes the same mistakes over and over. Ours writes down what went wrong each
night and then taps the staff on the shoulder right before they're about to make
that exact mistake again. And when something private comes up — like a
customer's food allergy — it locks that in a safe on the restaurant's own
computer instead of sending it off to a company's servers.

**Precise:** A service-operations agent built on XTrace's memory API. It uses all
four memory kinds, adds a routing layer that keeps third-party medical data off
the hosted service, and fires procedural memory as a pre-action tripwire. We
measure two things across five simulated services: how much of what the agent
needed it actually retrieved, and how much private data it leaked to do it.

**The name:** *mise en place* is a French kitchen term meaning "everything in its
place." That's the whole thesis — the value of memory isn't that an agent can
recall, it's that each thing ends up where it belongs.

---

## 2. The problem we're solving

**Simple:** Imagine you work at a restaurant. The person who worked last night
knows a hundred little things — that table 14 always wants the corner seat, that
the scallops take nine minutes not four, that the guy on table 8 can't be offered
wine. None of that is written down anywhere. It's just in their head. When they
quit, it's gone, and the restaurant gets worse at its own job.

Restaurants lose about **70% of their staff every year**. So this happens
constantly.

**Precise:** Operational knowledge in service industries is procedural and
tacit. POS systems capture transactions; nothing captures how service actually
ran. The knowledge lives in staff heads and leaves with turnover, so the
organisation cannot compound its own learning.

---

## 3. The four kinds of memory

XTrace splits memory into four types. Most hackathon projects use one. We use all
four, because restaurant operations genuinely need all four.

| Type | Simple | Restaurant example |
|---|---|---|
| **Semantic** | Facts about the world | "Bayview runs short on nettles one week in three" |
| **Episodic** | What happened, when | "Wednesday, 84 covers, the fridge hit 43°F" |
| **Artifact** | Things that got made | The prep sheet the agent writes at close |
| **Procedural** | How to do something better next time | "Confirm the first wave went out before firing the second" |

**The one that matters most is procedural**, because it's the only one that
changes what the agent *does* rather than what it knows. Facts make an agent
smarter. Procedures make it better.

---

## 4. The tripwire — our centrepiece

**Simple:** Most memory systems work like a library. You ask a question, they
find you a book. That's fine, but you have to know to ask.

Ours works like a **tripwire**. The agent is about to do something — say, send
the second round of plates to table 22 — and *right before it does*, the system
checks: "has anything gone wrong with this exact action before?" On Monday the
restaurant sent a second round before the first was picked up and had to comp
$200 of food. So on Friday, before the agent sends anything, that Monday lesson
pops up on its own. Nobody asked a question.

**Precise:** `POST /v1/memories/trigger` — procedural recall fired as a
pre-action hook. It matches the concrete identifiers in the pending action
(`fire_ticket`, `second_wave: true`, `table:22`) against directives' trigger
entities. **Exact overlap, not semantic similarity.** Nothing fires unless an
anchor matches, which is what makes it safe to call before every single action —
it's silent when it has nothing to say.

**Why this is the interesting part:** almost every memory demo is retrieval —
ask, receive. A tripwire is memory that intervenes. That's the difference
between a system that remembers and a system that improves.

---

## 5. The privacy split — our second-strongest idea

**Simple:** Some of what gets said in a restaurant is nobody's business. "Ada has
a severe nut allergy and carries an epi-pen" is medical information about a
customer who never signed anything.

So we built a sorting step. Every line gets checked before it's saved:

- **Normal restaurant stuff** ("the fish is 86'd tonight") → goes to the cloud,
  shared with the whole staff
- **Medical or private stuff** ("Ines is coeliac") → goes into a **locked safe on
  the restaurant's own computer**, scrambled so even the company hosting it
  couldn't read it

Then here's the clever bit. The two halves talk to each other **using the
customer's name**. The cloud knows "Ines Barros is on table 3 tonight." The safe
knows what that name means. When a cook asks "can I use the same fryer?", the
system looks up who's in the room, finds Ines, checks the safe, and warns them —
without her diagnosis ever having left the building.

We call it **public pointer, private payload.**

**Precise:** XTrace applies a *personal gate* server-side — health, family, and
financial content is never tagged into a group, so it can't cross between users.
Good gate, and we rely on it. But it governs *sharing*, not *transmission*: the
text still reaches the hosted service.

So we add a gate in front of it. A regex-based router classifies each line;
medical and protected-status lines go to **x-vec**, XTrace's encrypted vector
database — AES-encrypted content, Paillier-encrypted embeddings, homomorphic
search over ciphertext. At read time we expand the vault query with every proper
name the hosted read surfaced, which is the join between the halves.

**Two gates, in order:** the router asks *may this leave the building?* The
personal gate asks *given that it left, may it cross between staff?*

### Redaction

There's a wrinkle. A procedure has to be shareable — that's the point of writing
one — but it usually names the condition that caused it. So we swap the condition
for its category:

> ~~when a ticket carries a **coeliac** flag~~ → when a ticket carries a
> **[dietary restriction]** flag

Same instruction, same trigger, reads identically to a cook. The diagnosis stays
in the safe.

---

## 6. The experiment — why anyone should believe us

We didn't just build a thing and say it's good. We ran the **same five services
three different ways** and scored all three identically.

| Arm | Simple | Precise |
|---|---|---|
| **Context window only** | A smart assistant with no memory. Knows everything said tonight, nothing from before. | Long-context baseline, no persistence |
| **Single shared pool** | Dumps every message into one big bucket. This is what most memory demos do. | One catch-all group, no routing, no procedural layer |
| **Mise** | Ours. | Routed writes, prompted + catch-all groups, union recall, tripwire |

**Why three and not two:** if we only compared against "no memory," we'd be
beating a strawman. The pooled arm is the *good* version of the obvious approach.
Beating it is the real claim.

---

## 7. The numbers, and what each one means

### Context fidelity (the bars)

**Simple:** Before answering, did the agent actually dig up the right facts? If a
question needs 4 facts and it found 3, that's 75%.

**Precise:** Fraction of required facts present in the assembled brief. Scored on
**the context the agent built, not on prose it generated** — so no model is
grading another model. This is the answer when someone asks if you're measuring
vibes.

### ▲N — procedures fired

**Simple:** How many times the tripwire went off on its own, before an action ran.

**Note service 1 fires zero.** That's correct — no debrief has happened yet, so
there's nothing to fire. The agent genuinely starts empty. Don't hide this;
point at it.

### "N exposed" — guest records

**Simple:** How many private medical facts got sent to an outside company's
servers.

**Precise:** Counted **at the wire**, when the request goes out — not at
retrieval. Once text is on someone else's server it's exposed whether or not a
search ever returns it. This is why our number can be 0 while we still answer
allergy questions correctly.

### The results

| | avg fidelity | service 1 → 5 | records exposed |
|---|---|---|---|
| Context window only | 48% | 71% → 40% | 0 |
| Single shared pool | 88% | 88% → **88%** | **6** |
| **Mise** | **96%** | **88% → 100%** | **0** |

**Three things to notice, in priority order:**

1. **The pooled baseline is flat.** 88% → 88%. It ends its fifth service no
   better than its first, because one undifferentiated bucket has nowhere for a
   lesson to live. **This is our strongest single fact. Lead with it.**
2. **Mise climbs.** 88% → 100%. That's the compounding.
3. **The baseline's accuracy is partly bought with data it shouldn't hold** — 6
   guest medical records on a hosted server. Read the two columns together or
   the comparison is dishonest.

---

## 8. Things we got wrong, and what we did about it

Judges trust people who volunteer their own failures. Don't hide any of these.

### The tripwire doesn't work the way we first built it

We built on XTrace's `trigger` endpoint. Then we **measured what was actually
there**: 298 memories in our groups came back as 237 facts, 49 episodes, 12
artifacts, and **zero directives**. The rules extract perfectly — they're just
typed as `fact`, so `trigger` had nothing to match.

We tested a hypothesis (maybe phrasing matters?) with a two-ingest experiment. It
was **wrong** — both phrasings produced facts. So we kept the pattern and moved
the matching to our side: search the shared scope for the tool name and its
vocabulary, keep only rows that read as standing rules.

**What to say:** *"Same contract — nothing fires unless the pending action
matches — with the match performed on our side of the wire."*

**Do not let anyone think the hosted trigger endpoint is what's firing.** Saying
this plainly is a strength, not a weakness. It shows we measure instead of
assume.

### The baseline beat us at first

With ~30 memories, the pooled arm scored 88% against our 85%. Scoping doesn't pay
at that scale. Rather than tune until the chart flattered us, we added 280
background messages — payroll, rotas, marketing, the sister location — so
retrieval precision actually gets tested. That's the trade **XTrace's own docs
state outright**: a catch-all group trades precision for recall.

### There's an offline fallback and it's cruder

With no API key, everything runs against an in-process stand-in. It approximates
extraction as one fact per turn and search as keyword overlap. **It's a fallback,
not a reimplementation** — the file says so at the top. It exists so the demo
can't die on conference wifi. Offline scores Mise at 90%; hosted at 96%, because
real extraction beats our approximation.

---

## 9. Hard questions, and how to answer them

**"How do you know it used the memory and isn't just a good language model?"**
Run `npm run inspect -- "can I run the churros and the calamari out of the same
fryer?"`. It prints the assembled brief with every line attributed to floor
memory, procedure, or vault. Fidelity is scored on that brief, not on generated
text.

**"Isn't your baseline a strawman?"**
It's the architecture XTrace's own Groups guide describes as the cheap option,
and it beat us at first — 88% to our 85% at small scale. The gap only appears
once there's realistic background traffic. It's in the README.

**"Why not put everything in the encrypted vault?"**
Then nothing is shareable and you've rebuilt a filing cabinet. The interesting
claim is the *split* — the pointer is shareable, the payload isn't, and they
rejoin at read time by name.

**"Doesn't redaction break the procedure?"**
No. The tripwire fires on tool anchors, which are unchanged. `[dietary
restriction]` reads the same to a cook as the diagnosis did.

**"What if the classifier mis-tags something?"**
Group tagging is an LLM relevance call and the personal gate fails closed.
Nothing in the system requires a specific fact to be tagged. We check
`ignored_group_ids` on every ingest.

**"Why does service 4 dip in the offline run?"**
Service 4's questions are about supply and logistics — a late truck, a nettle
shortage. Those are retrieval questions with no procedure attached, so the
tripwire has nothing to contribute. Procedural memory helps where there's a
procedure.

**"Does this only work for restaurants?"**
No. Any operation where the knowledge is procedural, staff rotate, and some of
what gets said is somebody's medical record — clinics, home care, schools, field
service. Same two problems, same two gates.

**"What's the business model?"**
Restaurant groups, 5–50 rooms, already paying for POS and scheduling, none of
which retains anything about how service ran. Priced per room. The churn that
creates the problem is also the renewal argument.

**"What would you build next?"**
Get directives typed properly so the hosted `trigger` endpoint fires natively,
and finish the x-vec Python service — it's written but untested, and we're
currently running an AES-file fallback.

---

## 10. Commands, if you need to drive

```bash
npm run dev                    # the board — localhost:5174
npm run replay -- --noise 0    # all three arms, ~12 min hosted
npm run inspect -- --trigger fire_ticket    # show the tripwire in isolation
npm run inspect -- --directives             # what's actually stored, by type
npm run doctor                 # test each API call one at a time
```

**If anything breaks on stage:** set `MISE_OFFLINE=1` and everything runs with no
network at all, in under a second. Say it out loud — a demo that deliberately
doesn't need wifi reads as engineering judgment.

---

## 11. Reading the board

**Left side:** three architectures, five services each. Grey bars are baselines,
red is Mise — so the eye finds our architecture without being told.

**Right side (the rail):** every memory as it's written, stamped with where it
was allowed to go.

- **FLOOR** — operational, shared to the floor group on the hosted service
- **PROCEDURE** (red outline) — a rule firing before an action. The red is
  deliberate: it's the only thing on the rail that isn't quiet.
- **DEBRIEF** — end of service, condition redacted, category kept
- **SEED** — the pre-service corpus

**One quirk to know:** memory accumulates server-side between runs, so directive
counts go *up* if you re-run. If a judge notices a number changed, that's why —
the restaurant has more services behind it now.

---

## 12. The 30-second version, if you only remember one thing

> Most memory demos prove an agent can recall. We measured whether an agent gets
> **better** — and whether it stayed **safe** doing it.
>
> The obvious approach — one big shared pool — hits 88% and stays there. Flat. It
> ends its fifth night no better than its first. And it does it while holding six
> guest medical records on a hosted server.
>
> Ours climbs to 100% and leaks nothing.
