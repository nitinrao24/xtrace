/**
 * The router decides where a line of service knowledge is allowed to live.
 *
 * XTrace already applies a personal gate server-side: content about health,
 * family, finances or credentials is never tagged into a group, so it cannot
 * cross to other users. That gate protects sharing. It does not stop the text
 * from reaching the hosted service in the first place.
 *
 * For a restaurant that is not quite enough. "Ada Okonkwo carries an epi-pen" is
 * health data about a third party who never agreed to anything. Mise keeps that
 * class of line off the hosted service entirely and puts it in an encrypted
 * local store instead, where the content is AES-encrypted and the embedding is
 * homomorphically encrypted before it leaves the building.
 *
 * So there are two gates, not one:
 *   router (here) - may this text leave the restaurant at all?
 *   personal gate - given that it left, may it cross between staff?
 */

import type { RoutedLine } from "../types.ts";

interface Rule {
  id: string;
  pattern: RegExp;
  why: string;
}

/**
 * Third-party health and protected-condition data. Anything matching stays local.
 * Deliberately over-broad: a false positive costs one extra local lookup, a false
 * negative puts a guest's medical record on someone else's server.
 */
const VAULT_RULES: Rule[] = [
  { id: "allergy", pattern: /\ballerg\w*|epi-?pen|anaphyla\w*/i, why: "allergy — medical, identifies a named guest" },
  {
    id: "allergen",
    pattern: /\b(no|cannot have|can't have|avoid(?:s|ing)?|fatal if|reacts? to)\b[^.!?]{0,25}\b(nuts?|peanuts?|tree nuts?|shellfish|crustaceans?|gluten|dairy|lactose|sesame|soy|eggs?)\b/i,
    why: "named allergen without the word 'allergy' — same risk, different phrasing",
  },
  { id: "coeliac", pattern: /\bcoeliac|celiac\b/i, why: "diagnosed condition" },
  { id: "treatment", pattern: /chemo\w*|dialysis|immunocompromised|in treatment/i, why: "ongoing medical treatment" },
  { id: "recovery", pattern: /\bin recovery\b|sober|must never be offered alcohol/i, why: "protected personal circumstance" },
  { id: "pregnancy", pattern: /pregnan\w*/i, why: "protected health status" },
  { id: "medication", pattern: /medication|prescribed|diagnos\w*/i, why: "medical record" },
  { id: "payment", pattern: /card ending|cvv|account number/i, why: "payment data" },
];

/** Split a message body into lines and route each one independently. */
export function route(text: string): RoutedLine[] {
  const lines = text
    .split(/(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const hit = VAULT_RULES.find((r) => r.pattern.test(line));
    if (hit) {
      return {
        text: line,
        destination: "vault" as const,
        sensitivity: "personal" as const,
        reason: hit.why,
      };
    }
    return {
      text: line,
      destination: "hosted" as const,
      sensitivity: "shareable" as const,
      reason: "operational — the floor needs it to run service",
    };
  });
}

/** Convenience: does this message contain anything that must stay local? */
export function hasSensitive(text: string): boolean {
  return VAULT_RULES.some((r) => r.pattern.test(text));
}

/** The rule list, for the dashboard's explain panel. */
export function rules(): Array<{ id: string; why: string }> {
  return VAULT_RULES.map((r) => ({ id: r.id, why: r.why }));
}

/** What a redacted term is replaced with. The category survives; the diagnosis does not. */
const CATEGORY: Record<string, string> = {
  allergy: "[allergy flag]",
  allergen: "[allergy flag]",
  coeliac: "[dietary restriction]",
  treatment: "[care requirement]",
  recovery: "[no-alcohol flag]",
  pregnancy: "[care requirement]",
  medication: "[care requirement]",
  payment: "[payment detail]",
};

/**
 * A debrief has to be shareable — it is the whole point of writing one — but it
 * usually names the guest condition that prompted it. So the condition comes out
 * and the category goes in: "when a ticket carries a [dietary restriction] flag,
 * the fry station runs a dedicated basket."
 *
 * The procedure stays actionable, fires on the same tool anchors, and reads the
 * same to a cook. The diagnosis stays in the vault, where the record already is.
 */
export function redact(text: string): { text: string; removed: string[] } {
  let out = text;
  const removed: string[] = [];
  for (const rule of VAULT_RULES) {
    const global = new RegExp(rule.pattern.source, "gi");
    out = out.replace(global, (match) => {
      removed.push(match);
      return CATEGORY[rule.id] ?? "[redacted]";
    });
  }
  return { text: out, removed };
}
