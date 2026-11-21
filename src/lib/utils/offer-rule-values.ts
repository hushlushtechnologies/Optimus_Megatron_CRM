import { toFils } from "@/src/lib/utils/sales-money";

/*
|--------------------------------------------------------------------------
| WHAT AN ELIGIBILITY RULE'S VALUE SHOULD BE
|--------------------------------------------------------------------------
|
| The column is jsonb and the rules engine expects a particular shape per
| rule: an array for in/not_in, a number for gte/lte, a boolean for eq. A
| form can only send text, so something has to do the shaping.
|
| It lives here, in a pure module, rather than inside the server action, for
| one reason: min_lifetime_spend_fils is stored in fils, so "50000" typed as
| dirhams has to become 5000000. That is money arithmetic, and money
| arithmetic that cannot be tested is money arithmetic that is wrong
| eventually.
|
| The action imports this. The conversion still happens on the server — this
| module is just where it is written down.
*/

/**
 * Turn a rule's text value into the JSON the engine expects.
 *
 * Never throws. A value it cannot make sense of becomes the safe floor for
 * its shape — 0 for a number, [] for a list — because a rule with a
 * nonsense value must not become a rule that matches everybody.
 */
export function shapeRuleValue(ruleKind: string, operator: string, raw: unknown): unknown {
  const text = typeof raw === "string" ? raw.trim() : raw;

  /* Lifetime spend arrives as dirhams and is stored as fils. */
  if (ruleKind === "min_lifetime_spend_fils") {
    const fils = toFils(typeof text === "string" ? text : null);

    /*
     * Null means the text was not a number. Zero rather than null, because
     * the column is not null and "no minimum" is not a rule — if somebody
     * typed rubbish, the rule should pass everyone rather than reject
     * everyone or break the insert.
     */
    return fils === null ? 0 : Number(fils);
  }

  if (operator === "gte" || operator === "lte") {
    const n = Number(text);
    return Number.isFinite(n) ? n : 0;
  }

  if (operator === "eq") {
    if (text === "true") return true;
    if (text === "false") return false;
    return text;
  }

  /*
   * in / not_in want an array. The form offers one value per rule, so this
   * is usually an array of one — but the engine handles longer arrays, so a
   * future multi-select needs no change here.
   */
  if (operator === "in" || operator === "not_in") {
    if (Array.isArray(text)) return text;
    return text === "" || text === null || text === undefined ? [] : [text];
  }

  return text;
}
