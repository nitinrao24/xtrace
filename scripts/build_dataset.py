#!/usr/bin/env python3
"""
Builds the Mise demo corpus.

Three artifacts land in ./data:
  guests.json   - guest profiles, split into shareable vs sensitive fields
  seed.json     - the pre-service memory corpus (ingested before shift 1)
  shifts.json   - five services, each a list of turns to ingest + probes to score

Run:  python3 scripts/build_dataset.py
"""

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

# ---------------------------------------------------------------- staff + groups

STAFF = [
    {"user_id": "maya", "role": "General manager, works the pass"},
    {"user_id": "dev", "role": "Sous chef, hot line"},
    {"user_id": "priya", "role": "Server, sections 1-3"},
    {"user_id": "tom", "role": "Bar"},
]

GROUPS = [
    {
        "key": "service",
        "name": "Verano service floor",
        "prompt": (
            "Operational facts about service at Verano: which dishes are 86'd, table and "
            "reservation notes, prep and timing instructions, supplier and delivery issues, "
            "equipment status, and guest preferences that the floor needs to plan service. "
            "Do not include staff personal circumstances."
        ),
    },
    {
        "key": "playbook",
        "name": "Verano playbook",
        "prompt": None,  # catch-all: post-shift lessons land here wholesale
    },
]

# ---------------------------------------------------------------- guests

GUESTS = [
    {
        "id": "g_okonkwo",
        "name": "Ada Okonkwo",
        "shareable": [
            "Ada Okonkwo always books the corner banquette, table 14.",
            "Ada Okonkwo drinks only Basque cider, never wine.",
        ],
        "sensitive": [
            "Ada Okonkwo has a severe tree-nut allergy and carries an epi-pen.",
        ],
    },
    {
        "id": "g_reyes",
        "name": "Marco Reyes",
        "shareable": [
            "Marco Reyes brings clients on Thursdays and wants the check dropped discreetly.",
            "Marco Reyes orders the tasting menu every visit.",
        ],
        "sensitive": [
            "Marco Reyes is in recovery and must never be offered alcohol, including sauces finished with wine.",
        ],
    },
    {
        "id": "g_lindqvist",
        "name": "Sofia Lindqvist",
        "shareable": [
            "Sofia Lindqvist is a food writer for the Chronicle and visits unannounced.",
            "Sofia Lindqvist prefers to sit at the counter facing the pass.",
        ],
        "sensitive": [],
    },
    {
        "id": "g_barros",
        "name": "Ines Barros",
        "shareable": [
            "Ines Barros celebrates her anniversary at Verano every March 12th.",
            "Ines Barros loves the burnt basque cheesecake.",
        ],
        "sensitive": [
            "Ines Barros is coeliac; cross-contamination on the fry station is a medical risk.",
        ],
    },
    {
        "id": "g_haddad",
        "name": "Karim Haddad",
        "shareable": [
            "Karim Haddad hosts a monthly supper club of twelve on the first Tuesday.",
            "Karim Haddad wants family-style service, no plated courses.",
        ],
        "sensitive": [
            "Karim Haddad's partner is undergoing chemotherapy and cannot be seated near strong aromatics.",
        ],
    },
]

# ---------------------------------------------------------------- seed corpus
# What the restaurant already knows before shift 1. This is the "prebuilt memory".

SEED = [
    {
        "conv_id": "seed_house_standards",
        "user_id": "maya",
        "groups": ["service"],
        "messages": [
            {"role": "user", "content": "House standard: every ticket over six covers gets fired in two waves, apps then mains, never all at once."},
            {"role": "assistant", "content": "Recorded as a service standard."},
            {"role": "user", "content": "The walk-in's second compressor has been unreliable since April. If the temp log reads above 41F we pull all raw fish immediately."},
            {"role": "assistant", "content": "Noted, with the 41F threshold."},
        ],
    },
    {
        "conv_id": "seed_menu",
        "user_id": "dev",
        "groups": ["service"],
        "messages": [
            {"role": "user", "content": "Current menu: hamachi crudo, wood-grilled scallops, duck breast with cherries, cavatelli with nettles, burnt basque cheesecake."},
            {"role": "assistant", "content": "Menu logged."},
            {"role": "user", "content": "The cavatelli is finished with a white wine reduction. The duck jus also has madeira in it."},
            {"role": "assistant", "content": "Noted which dishes carry alcohol."},
            {"role": "user", "content": "Scallops take nine minutes on the wood grill, not four. Everyone underestimates this and the pass backs up."},
            {"role": "assistant", "content": "Nine minutes recorded for scallops."},
        ],
    },
    {
        "conv_id": "seed_suppliers",
        "user_id": "maya",
        "groups": ["service"],
        "messages": [
            {"role": "user", "content": "Monterey Fish delivers Tuesday and Friday before 10am. If they are late it is always the Friday truck."},
            {"role": "assistant", "content": "Delivery pattern recorded."},
            {"role": "user", "content": "Bayview Produce short-ships nettles roughly one week in three. We keep frozen pea shoots as the sub."},
            {"role": "assistant", "content": "Substitution noted."},
        ],
    },
]

# Guest facts get seeded per-guest so the router can demonstrate splitting.
for g in GUESTS:
    msgs = [{"role": "user", "content": line} for line in g["shareable"] + g["sensitive"]]
    interleaved = []
    for m in msgs:
        interleaved.append(m)
        interleaved.append({"role": "assistant", "content": "Noted."})
    SEED.append(
        {
            "conv_id": f"seed_{g['id']}",
            "user_id": "priya",
            "groups": ["service"],
            "guest_id": g["id"],
            "messages": interleaved,
        }
    )

# ---------------------------------------------------------------- shifts
# Each shift: turns to ingest during service, probes scored mid-service,
# and a debrief the Chef agent turns into procedural memory.


def turn(user, content, reply="Noted.", groups=("service",), guest=None):
    t = {"user_id": user, "groups": list(groups), "messages": [
        {"role": "user", "content": content},
        {"role": "assistant", "content": reply},
    ]}
    if guest:
        t["guest_id"] = guest
    return t


def probe(q, asker, must_recall, must_avoid=None, scope="service"):
    return {
        "query": q,
        "user_id": asker,
        "scope": scope,
        "must_recall": must_recall,
        "must_avoid": must_avoid or [],
    }


SHIFTS = [
    {
        "n": 1,
        "date": "2026-03-10",
        "covers": 62,
        "title": "Monday. Nothing is written down yet.",
        "turns": [
            turn("dev", "86 the hamachi crudo, the Friday fish came in soft and I am not serving it."),
            turn("priya", "Table 14 is Ada Okonkwo tonight, eight thirty.", guest="g_okonkwo"),
            turn("tom", "We are out of Basque cider until the Thursday order lands."),
            turn("dev", "Cavatelli is running slow because the nettles came in short again, I am subbing pea shoots."),
            turn("priya", "Sofia Lindqvist just walked in and asked for the counter. I did not recognise her until she sat down."),
            turn("maya", "We double-fired table 9 and comped two hundred dollars of food. Nobody checked whether the apps had already gone."),
        ],
        "probes": [
            probe("What can I actually sell on the raw section right now?", "priya", ["hamachi", "86"]),
            probe("Ada Okonkwo is on 14, what do I need to know before I take her order?", "priya",
                  ["nut", "cider", "banquette"]),
            probe("Is the cavatelli still on?", "priya", ["pea shoot", "nettle"]),
            probe("Who is at the counter and does it matter?", "maya", ["Lindqvist", "writer"]),
        ],
        "debrief": (
            "Two things cost us tonight. We comped table 9 because a second fire went out with no check "
            "on the first, and Sofia Lindqvist sat unrecognised for four minutes. Going forward: before "
            "firing any second wave, confirm the first wave was picked up; and check the reservation book "
            "against known press before doors, every service."
        ),
    },
    {
        "n": 2,
        "date": "2026-03-11",
        "covers": 71,
        "title": "Tuesday. The first lessons land.",
        "turns": [
            turn("dev", "Fish came in clean today, hamachi is back on."),
            turn("maya", "Karim Haddad's supper club is in tonight, twelve people, family style as always.", guest="g_haddad"),
            turn("dev", "Scallops are backing up again, the wood grill is running cool with the new charcoal."),
            turn("tom", "Cider landed. Ada is in on Thursday so we are covered."),
            turn("priya", "Table 6 asked for the duck without alcohol and I had to check with the kitchen mid-service."),
            turn("maya", "Karim asked to move his party away from the grill side, too much smoke."),
        ],
        "probes": [
            probe("Karim's twelve-top is booked, how am I setting the room?", "maya",
                  ["family", "aromatic", "grill"]),
            probe("Second wave is ready for table 11, can I fire?", "priya", ["first wave", "confirm"]),
            probe("Which dishes do I need to flag for a no-alcohol table?", "priya",
                  ["cavatelli", "duck", "madeira"]),
            probe("How long do I actually need on scallops tonight?", "dev", ["nine", "grill"]),
        ],
        "debrief": (
            "The no-alcohol question came up mid-service again and stalled a table. Build the alcohol flag "
            "into the order-taking step: whenever a guest declines alcohol, the server reads back cavatelli "
            "and duck as excluded before sending the ticket."
        ),
    },
    {
        "n": 3,
        "date": "2026-03-12",
        "covers": 84,
        "title": "Wednesday. Anniversary and a compressor.",
        "turns": [
            turn("maya", "Ines Barros is in tonight, it is her anniversary, March twelfth like every year.", guest="g_barros"),
            turn("dev", "Walk-in temp log is reading 43F this afternoon."),
            turn("dev", "Pulled all the raw fish per the standard. Crudo is 86 for the night."),
            turn("priya", "Ines asked whether the cheesecake is safe for her."),
            turn("tom", "Marco Reyes booked a client dinner Thursday, four covers.", guest="g_reyes"),
            turn("maya", "Fry station was used for both the churros and the calamari tonight with no changeover."),
        ],
        "probes": [
            probe("Temp log says 43, what is the call?", "dev", ["41", "pull", "raw fish"]),
            probe("Ines Barros, table 3, anything I should be handling differently?", "priya",
                  ["coeliac", "anniversary", "cheesecake"]),
            probe("Can I run the churros and the calamari out of the same fryer?", "dev",
                  ["cross-contam", "coeliac"]),
            probe("What is on for Marco Reyes tomorrow?", "maya", ["tasting", "check", "Thursday"]),
        ],
        "debrief": (
            "We nearly served a coeliac guest out of a shared fryer. New procedure: when any ticket in the "
            "room carries a coeliac flag, the fry station runs a dedicated basket for the whole service and "
            "the expo calls it out at the start of the shift, not when the dessert order lands."
        ),
    },
    {
        "n": 4,
        "date": "2026-03-13",
        "covers": 78,
        "title": "Thursday. Clients, cider, and a late truck.",
        "turns": [
            turn("maya", "Monterey is late again, Friday truck pattern but on a Thursday this time."),
            turn("tom", "Marco Reyes is on table 8 at seven, four covers, clients.", guest="g_reyes"),
            turn("priya", "Ada Okonkwo moved her booking to tonight, she is on 14.", guest="g_okonkwo"),
            turn("dev", "Nettles short again so cavatelli is pea shoots, third week in a row."),
            turn("maya", "Someone nearly poured Marco a glass of the pairing wine."),
            turn("tom", "Cider is in the low boy for table 14."),
        ],
        "probes": [
            probe("Marco Reyes table 8, brief me before service.", "tom",
                  ["alcohol", "check", "tasting"], must_avoid=[]),
            probe("Ada on 14 again, what is the drink and what is the risk?", "priya",
                  ["cider", "nut"]),
            probe("Nettles are short a third time, what do we do about it?", "dev",
                  ["pea shoot", "Bayview"]),
            probe("Truck is late, what usually happens next?", "maya", ["Monterey", "Friday"]),
        ],
        "debrief": (
            "The near-miss on Marco's wine pour is the third alcohol incident in four services. Escalate it: "
            "any guest flagged no-alcohol gets a marker on the dupe itself, and the bar confirms the flag "
            "before any pairing pour leaves the well."
        ),
    },
    {
        "n": 5,
        "date": "2026-03-14",
        "covers": 91,
        "title": "Friday. The room runs itself.",
        "turns": [
            turn("dev", "Grill is back to temperature with the old charcoal supplier."),
            turn("maya", "Full book, ninety one on the sheet, two known press bookings."),
            turn("priya", "Ines Barros came back in with friends, six covers."),
            turn("dev", "Fish landed on time and clean, everything is on."),
            turn("tom", "Marco is in again, same table."),
            turn("maya", "No comps tonight and no incidents."),
        ],
        "probes": [
            probe("Full book with a coeliac and a no-alcohol guest in the room. Walk me through the setup.", "maya",
                  ["fry", "dedicated", "marker", "bar"]),
            probe("Press is in, what is the pre-service check?", "maya", ["reservation", "press", "doors"]),
            probe("Table 22 is six covers, how do I fire it?", "priya", ["two waves", "confirm"]),
            probe("Everything I need on scallops and the grill.", "dev", ["nine", "charcoal"]),
        ],
        "debrief": (
            "Clean service. Ninety one covers, no comps, no near misses. The procedures held. Keep the "
            "pre-doors read of the book, the two-wave confirmation, the dedicated fry basket, and the "
            "dupe-level alcohol marker as standing house procedure."
        ),
    },
    {
        "n": 6,
        "date": "2026-03-15",
        "covers": 88,
        "title": "Saturday. The world changes underneath the memory.",
        "turns": [
            turn("maya", "We have moved off Bayview Produce to Coastline Growers. Nettles now arrive reliably every Tuesday."),
            turn("dev", "New wood grill went in this morning. Scallops now take six minutes on it."),
            turn("dev", "The cavatelli is off the menu permanently, it never sold at this price."),
            turn("maya", "The walk-in compressor was replaced on Thursday. The 41F rule no longer applies, it holds at 38 now."),
            turn("tom", "Ada Okonkwo now drinks alcohol-free sparkling, as of tonight.", guest="g_okonkwo"),
            turn("priya", "Full book again, no incidents."),
        ],
        "probes": [
            probe("How long do the scallops need?", "dev",
                  ["six"], must_avoid=["nine"]),
            probe("Who supplies our nettles and how reliable are they?", "dev",
                  ["Coastline"], must_avoid=["short-ship"]),
            probe("What do I pour for Ada on 14?", "priya",
                  ["alcohol-free", "sparkling"], must_avoid=["Basque"]),
            probe("Can I sell the cavatelli tonight?", "priya",
                  ["off the menu"], must_avoid=["pea shoot"]),
        ],
        "debrief": (
            "Nothing went wrong tonight, but four things we had written down stopped being true "
            "this week. Any standing note about the old supplier, the old grill timing, the "
            "cavatelli, or the 41F threshold is retired as of today."
        ),
    },
]

# ---------------------------------------------------------------- noise
# A real restaurant group's agent does not see thirty tidy facts. It sees every
# message anyone sent it. This is the rest of that traffic: true, ingested, and
# almost never what the floor needs mid-service.
#
# It exists to make retrieval precision matter. A catch-all group takes all of
# it; a prompted group scoped to service declines most of it. That trade is the
# whole argument, so the corpus has to be big enough to show it.

NOISE_TOPICS = [
    ("payroll", "maya", [
        "Payroll runs on the 15th and the last day of the month, no exceptions.",
        "Overtime over eight hours needs my sign-off before the shift, not after.",
        "The new hire paperwork for the dish station is still sitting with the accountant.",
        "Holiday pay accrues at one hour per thirty worked under the current contract.",
        "Direct deposit changes have to clear two business days before the run.",
    ]),
    ("scheduling", "maya", [
        "Dev is off the second week of April, cover is Ramon from the Oakland room.",
        "Priya asked to drop Sundays through the summer.",
        "We are short one runner on weekends until the new rota starts.",
        "Tom swapped Thursday with Ramon for the rest of the month.",
        "Nobody is scheduled more than five services in a row, that is the rule.",
    ]),
    ("marketing", "maya", [
        "The Instagram post about the spring menu goes out Tuesday at eleven.",
        "We are not doing paid social this quarter, the return was not there.",
        "The newsletter open rate was thirty one percent last month.",
        "Someone needs to reply to the wedding catering enquiry from the website form.",
        "The photographer is booked for the second week of April for new menu shots.",
    ]),
    ("facilities", "maya", [
        "The landlord is repainting the exterior in June and we lose the patio for a week.",
        "Insurance renewal is due the first of May, the broker sent three quotes.",
        "The grease trap service comes quarterly, next one is late April.",
        "Fire extinguisher inspection tags expire in August.",
        "The awning on the west side needs replacing before the rainy season.",
    ]),
    ("oakland", "dev", [
        "The Oakland room is running a completely different menu this season.",
        "Oakland 86'd their lamb dish permanently, it never sold.",
        "Oakland's walk-in was replaced last year so they do not have our compressor issue.",
        "Oakland does forty covers on a good night, we do ninety.",
        "The Oakland pastry section makes our cheesecake bases twice a week.",
    ]),
    ("admin", "maya", [
        "The POS contract renews automatically unless we cancel sixty days out.",
        "We switched card processors in January and the rates dropped forty basis points.",
        "Health inspection scored ninety six on the last visit.",
        "The liquor licence renewal paperwork is filed and acknowledged.",
        "Waste hauling moved to Wednesday pickups this year.",
    ]),
    ("insurance", "maya", [
        "Workers comp audit is scheduled for the second quarter.",
        "The general liability policy covers the patio but not the sidewalk seating.",
        "We raised the equipment breakdown limit after the compressor scare.",
        "Business interruption cover has a seventy two hour waiting period.",
        "The broker wants updated payroll figures before renewal.",
    ]),
]

NOISE = []
# Fan the topics out across several months of conversations so the corpus has
# realistic volume rather than seven long messages.
for month in range(1, 9):
    for topic, author, lines in NOISE_TOPICS:
        for idx, line in enumerate(lines):
            NOISE.append(
                {
                    "conv_id": f"noise_{topic}_{month:02d}_{idx}",
                    "user_id": author,
                    "topic": topic,
                    "messages": [
                        {"role": "user", "content": line},
                        {"role": "assistant", "content": "Noted."},
                    ],
                }
            )

# ---------------------------------------------------------------- write

(DATA / "guests.json").write_text(json.dumps({"guests": GUESTS}, indent=2) + "\n")
(DATA / "seed.json").write_text(
    json.dumps({"staff": STAFF, "groups": GROUPS, "conversations": SEED}, indent=2) + "\n"
)
(DATA / "shifts.json").write_text(json.dumps({"shifts": SHIFTS}, indent=2) + "\n")
(DATA / "noise.json").write_text(json.dumps({"conversations": NOISE}, indent=2) + "\n")

n_turns = sum(len(s["turns"]) for s in SHIFTS)
n_probes = sum(len(s["probes"]) for s in SHIFTS)
print(f"guests.json  {len(GUESTS)} guests")
print(f"seed.json    {len(SEED)} seed conversations, {len(GROUPS)} groups, {len(STAFF)} staff")
print(f"shifts.json  {len(SHIFTS)} shifts, {n_turns} turns, {n_probes} probes")
print(f"noise.json   {len(NOISE)} background conversations across {len(NOISE_TOPICS)} topics")
