# The three minutes

Demos slot: 16:00–17:00. Assume four minutes, plan for three, leave one for the question.

The judges are the creator of PowerPoint, the lead of Gen AI at Uber, a founder, and a Berkeley professor who directs AI at NVIDIA. Three of the four will have seen a hundred "look, it remembered my name" demos today. Do not be the hundred and first.

---

## Before you present

```bash
npm run replay            # populate the board so it opens with numbers on it
npm run dev               # leave it running at localhost:5174
```

Have a second terminal open, cleared, in the project root.

---

## 0:00 — the cold open

> "A restaurant manager can tell you exactly what their POS remembers. Covers, tickets, totals. Ask them what the *room* remembers and it's a different answer — that the scallops need nine minutes not four, that the six-top gets fired in two waves, that the guest on table 3 can't go near the fryer.
>
> That lives in the head of whoever worked last night. Turnover in this industry is seventy percent a year. Every time someone quits, the restaurant gets worse at its own job."

No slide. Just say it.

## 0:30 — the board

Press **Run the pass**. Tickets start printing on the right.

> "Five services at a sixty-seat restaurant, run three ways. Same events, same questions, same scoring.
>
> Grey is a very good agent with a long context window — it knows everything said tonight and nothing said before. It starts fine and it flatlines, because every night it starts over.
>
> Blue is what most memory demos are: one shared pool, every message goes in. It climbs. It gets to a hundred percent.
>
> Amber is us. Same hundred percent."

Pause here. Let them notice you just admitted the baseline matched you.

## 1:15 — the turn

Point at the exposure column.

> "Except the baseline is holding six guest medical records on a hosted server. Allergies, a coeliac diagnosis, a guest in recovery who must never be offered alcohol, someone's partner in chemotherapy. Third parties who never signed anything.
>
> We're holding zero. Same accuracy, none of the liability.
>
> XTrace has a personal gate that stops that data crossing *between* staff, and we rely on it. But it governs sharing — it doesn't stop the text reaching the server. So we put a gate in front of it. Medical lines go to x-vec instead: AES content, Paillier-encrypted vectors, never leaves the building."

## 1:50 — the part that compounds

Second terminal:

```bash
npm run inspect -- --trigger fire_ticket
```

> "This is the piece I actually care about. On Monday this restaurant double-fired a six-top and comped two hundred dollars, because nobody checked the first wave had gone. That went into the debrief.
>
> On Friday, before the agent fires *any* ticket, this runs — `memories.trigger`. It's not a search. It matches the concrete identifiers in the action about to run against what past services recorded about those same identifiers. Exact overlap, no embeddings. And Monday's lesson fires. Nobody asked it a question."

Let the output sit on screen.

> "That's `agentic: true` on ingest to capture the directive and `trigger` to fire it. Neither is in the guides — they're in the SDK's type declarations and the `lesson` and `procedure` enum members of the OpenAPI spec. Same primitive MemHub uses as a PreToolUse hook for coding agents. We pointed it at a room with people in it."

## 2:35 — close

> "The architecture isn't about restaurants. Any operation where the knowledge is procedural, the staff rotate, and some of what gets said is somebody's medical record — clinics, home care, field service — has the same two problems and needs the same two gates.
>
> It runs offline, so it just ran on this wifi. Everything's on GitHub."

Stop talking.

---

## Questions you will get, and the answers

**"How do you know it used the memory and isn't just a good language model?"**
Run `npm run inspect -- "can I run the churros and the calamari out of the same fryer?"`. It prints the assembled brief with every line attributed to floor memory, procedure, or vault. Fidelity is scored against that brief, not against generated prose — there is no model grading another model anywhere in the number.

**"Isn't the baseline strawmanned?"**
It is the architecture the Groups guide describes as the cheap option, and it beat us at first. At thirty memories it scored 88 against our 85. The gap only appears once there is realistic background traffic, which is the precision-recall trade the guide states outright. That is in the README.

**"Why not put everything in the vault?"**
Because then nothing is shareable and you have rebuilt a filing cabinet. The interesting claim is the split: the pointer is shareable, the payload is not, and they rejoin at read time by name.

**"Does the redaction break the procedure?"**
No — the tool anchors are what the tripwire fires on, and those are unchanged. `[dietary restriction]` reads the same to a cook as the diagnosis did.

**"What if the classifier doesn't tag something?"**
Tagging is an LLM relevance call and the personal gate fails closed. Nothing in the system requires a specific fact to be tagged, and `ignored_group_ids` is checked on every ingest.

**"Business model?"**
Restaurant groups, 5–50 rooms, already paying for POS and scheduling, none of which retains anything about how service ran. Priced per room. The churn that makes the problem is also the renewal argument.

---

## If the demo breaks

It runs offline by design. If the hosted service is down or the key is wrong, set `MISE_OFFLINE=1` and everything still works — say so out loud, it is a feature and they will note it. If the board will not load, `npm run replay` gives the whole story in the terminal in under a second.
