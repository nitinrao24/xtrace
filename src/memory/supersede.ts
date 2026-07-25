/**
 * Keeping stale knowledge out of the answer.
 *
 * A memory system that only accumulates is a system that gets confidently wrong.
 * When the produce supplier changes, "Bayview short-ships nettles one week in
 * three" does not become false-sounding — it stays perfectly fluent, and an agent
 * with no notion of supersession will retrieve it forever.
 *
 * Three mechanisms, in increasing order of how much they matter:
 *
 *   decay        older memories rank lower, all else equal. Cheap, always on,
 *                never decisive on its own.
 *   supersession a later statement that contradicts an earlier one retires it.
 *                The old row is kept — history is not deleted — but it stops
 *                being retrievable for answering.
 *   revision     a later directive covering the same tool and subject as an
 *                earlier one replaces it, so two versions of a rule never fire
 *                at the same action.
 *
 * All three are lexical. They are heuristics, not a model, and they will miss
 * contradictions phrased carefully enough. That is the honest boundary and it is
 * stated in the README rather than hidden.
 */

import type { MemoryRow } from "../types.ts";

// ---------------------------------------------------------------- markers

/**
 * Language that signals a statement is *revising* something rather than adding
 * to it. Without one of these, two facts that merely differ are treated as
 * coexisting — restaurants genuinely do have two suppliers and two grills.
 */
/**
 * Phrases that retire something outright rather than merely revising it. These
 * need far less topical overlap to fire, because "the cavatelli is off the menu
 * permanently" shares almost no vocabulary with "the cavatelli is running slow
 * tonight" — one word — and yet unmistakably retires it.
 */
const STRONG_MARKERS = [
  /\bis off the menu\b/i,
  /\bpermanently\b/i,
  /\bdiscontinued\b/i,
  /\bno longer (?:applies|holds|stands|valid)\b/i,
  /\bis retired\b/i,
  /\bwas replaced\b/i,
];

const CHANGE_MARKERS = [
  /\bno longer\b/i,
  /\bmoved (?:off|to)\b/i,
  /\bnow drinks?\b/i,
  /\bswitched (?:from|to|off)\b/i,
  /\breplaced\b/i,
  /\bpermanently off\b/i,
  /\bdiscontinued\b/i,
  /\bstopped\b/i,
  /\bnot .{0,24}\b(?:any ?more|anylonger)\b/i,
  /\bfrom now on\b/i,
  /\bas of (?:today|tonight|this week)\b/i,
  /\bnow takes?\b/i,
  /\bnow arrives?\b/i,
  /\bnow \w+s\b/i,
  /\bis off the menu\b/i,
  /\bcame off\b/i,
  /\binstead of\b/i,
];

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "it",
  "we", "our", "with", "that", "this", "was", "were", "has", "have", "not", "but",
  "at", "by", "from", "now", "all", "any", "its", "their", "them", "they", "you",
  "will", "can", "does", "did", "been", "than", "then", "when", "what", "which",
]);

/** Distinctive terms — proper nouns weighted, stopwords dropped. */
function keyTerms(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.split(/\s+/)) {
    const w = raw.replace(/[^A-Za-z0-9'-]/g, "");
    if (w.length < 4) continue;
    const lower = w.toLowerCase();
    if (STOP.has(lower)) continue;
    out.add(lower);
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n += 1;
  return n / Math.max(1, Math.min(a.size, b.size));
}

/** Numbers with units, so "nine minutes" and "six minutes" can be compared. */
function measures(text: string): Array<{ value: number; unit: string }> {
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  const out: Array<{ value: number; unit: string }> = [];
  const re = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(minutes?|mins?|hours?|degrees?|f\b|covers?|days?|weeks?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1]!.toLowerCase();
    const value = words[raw] ?? Number(raw);
    if (!Number.isNaN(value)) out.push({ value, unit: m[2]!.toLowerCase().replace(/s$/, "") });
  }
  return out;
}

// ---------------------------------------------------------------- decisions

/**
 * Does `next` retire `prev`?
 *
 * Two independent routes, both requiring the statements to be about the same
 * thing:
 *
 *   1  `next` carries an explicit change marker and shares subject matter
 *   2  both state a measurement in the same unit and the values disagree
 *
 * Requiring a marker or a measurement is deliberate. Topical overlap alone would
 * retire half the corpus — a restaurant says many true things about nettles.
 */
export function supersedes(next: string, prev: string): boolean {
  if (next.trim() === prev.trim()) return false;

  const a = keyTerms(next);
  const b = keyTerms(prev);
  const shared = overlap(a, b);

  if (STRONG_MARKERS.some((r) => r.test(next)) && shared >= 0.12) return true;

  const marked = CHANGE_MARKERS.some((r) => r.test(next));
  if (marked && shared >= 0.28) return true;

  const ma = measures(next);
  const mb = measures(prev);
  if (ma.length && mb.length && shared >= 0.3) {
    for (const x of ma) {
      for (const y of mb) {
        if (x.unit === y.unit && x.value !== y.value) return true;
      }
    }
  }

  return false;
}

/**
 * Walks a corpus oldest-first and returns the ids that have been retired.
 * Nothing is deleted — a superseded row is still there to answer "what did we
 * used to do", it simply stops being offered as current.
 */
export function findSuperseded(rows: MemoryRow[]): Set<string> {
  const ordered = [...rows].sort(
    (x, y) => Date.parse(x.created_at ?? "") - Date.parse(y.created_at ?? ""),
  );
  const dead = new Set<string>();

  for (let i = ordered.length - 1; i >= 0; i--) {
    const next = ordered[i]!;
    if (dead.has(next.id)) continue;
    for (let j = i - 1; j >= 0; j--) {
      const prev = ordered[j]!;
      if (dead.has(prev.id)) continue;
      if (supersedes(next.text, prev.text)) dead.add(prev.id);
    }
  }
  return dead;
}

/** Drops retired rows from a retrieval result. */
export function live(rows: MemoryRow[]): MemoryRow[] {
  const dead = findSuperseded(rows);
  return rows.filter((r) => !dead.has(r.id));
}

// ---------------------------------------------------------------- decay

/**
 * Time weighting. Last night outranks last March when relevance is otherwise
 * equal, and never outranks it when relevance is not.
 *
 * The half-life is deliberately long — 45 days — because service knowledge is
 * seasonal, not hourly. A supplier pattern from six weeks ago is still worth
 * most of its original weight; one from a year ago is not.
 */
const HALF_LIFE_DAYS = 45;

export function decayed(rows: MemoryRow[], now = Date.now()): MemoryRow[] {
  return rows
    .map((r) => {
      const created = Date.parse(r.created_at ?? "");
      if (Number.isNaN(created)) return r;
      const ageDays = Math.max(0, (now - created) / 86_400_000);
      const weight = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
      // Floor at 0.55 so decay reorders near-ties without ever burying a fact
      // that is the only answer to the question.
      return { ...r, score: (r.score ?? 1) * (0.55 + 0.45 * weight) };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

// ---------------------------------------------------------------- revision

/**
 * Directive revision.
 *
 * Shift 4's debrief escalates the alcohol rule: reading the excluded dishes back
 * is no longer enough, the dupe gets a marker and the bar confirms. Both versions
 * anchor to `pour_drink`, so without this both fire at the same action and the
 * agent presents two versions of one rule.
 *
 * Newest wins per (tool, subject) pair. Subject is approximated by term overlap,
 * which is enough to tell "the alcohol rule" from "the fry station rule" while
 * still catching a restatement of the same rule.
 */
export function reviseDirectives(rows: MemoryRow[]): MemoryRow[] {
  const ordered = [...rows].sort(
    (x, y) => Date.parse(y.created_at ?? "") - Date.parse(x.created_at ?? ""),
  );

  const kept: MemoryRow[] = [];
  for (const row of ordered) {
    const terms = keyTerms(row.text);
    const duplicate = kept.some((k) => overlap(terms, keyTerms(k.text)) >= 0.45);
    if (!duplicate) kept.push(row);
  }
  return kept;
}
