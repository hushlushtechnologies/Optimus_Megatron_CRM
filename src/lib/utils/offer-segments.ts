import type { EligibilityRuleKind } from "@/src/lib/types/offers";

/*
|--------------------------------------------------------------------------
| SEGMENTS, AS SHORTHAND FOR RULES
|--------------------------------------------------------------------------
|
| Phase 11 asks for targeting on customer properties: VIP, repeat buyer,
| high-value, existing customer, tagged customers.
|
| None of those is a new concept. Every one of them is a combination of the
| eligibility rules that already exist, so a segment here is shorthand that
| expands into those rules — not a second tagging system, and not a stored
| segment table that could drift from what the engine actually checks.
|
| Two consequences worth stating, because they are the whole reason for
| doing it this way:
|
|   1. A segment is explainable. Picking "Repeat Buyer" produces a visible
|      rule saying "Completed purchases: at least 2", which somebody can
|      read, change, or argue with. Nothing is hidden.
|
|   2. Nothing new has to be maintained. The engine already evaluates these
|      rules and already explains its refusals. A segment adds no code to
|      the evaluation path at all.
|
| VIP is deliberately `lifecycle_status in ["VIP"]` rather than a boolean:
| VIP is one value of that field in this database. A VIP flag would be the
| second tagging system the brief warns about, and it would quietly diverge
| the first time somebody wants "Gold".
|
| LOYALTY TIERS, when they arrive, are NOT these. A loyalty tier is earned
| from the points ledger; a lifecycle status and a customer tag are set by
| hand. Mixing them would mean nobody could say why a customer qualified.
| So a tier will get its own rule kind rather than being folded in here.
*/

export interface SegmentRule {
  ruleKind: EligibilityRuleKind;
  operator: "in" | "not_in" | "gte" | "lte" | "eq";
  /** As the form holds it: text. The server shapes it into jsonb. */
  value: string;
}

export interface SegmentPreset {
  key: string;
  label: string;
  /** What this means, in the words the rule will produce. */
  blurb: string;
  rules: SegmentRule[];
}

/**
 * The presets, in the order they are offered.
 *
 * `high_value` uses a round number rather than a computed percentile. A
 * percentile would move as the customer base changes, so a campaign aimed at
 * "the top 10%" would silently retarget itself month to month — and nobody
 * reading the campaign later could tell who it had been sent to. The number
 * is editable once applied, which is the point.
 */
export const SEGMENT_PRESETS: SegmentPreset[] = [
  {
    key: "vip",
    label: "VIP",
    blurb: "Customer status is VIP",
    rules: [{ ruleKind: "lifecycle_status", operator: "in", value: "VIP" }],
  },
  {
    key: "repeat_buyer",
    label: "Repeat buyer",
    blurb: "Has completed at least 2 purchases",
    rules: [{ ruleKind: "min_completed_deals", operator: "gte", value: "2" }],
  },
  {
    key: "high_value",
    label: "High value",
    blurb: "Has spent at least AED 500,000 with you",
    rules: [{ ruleKind: "min_lifetime_spend_fils", operator: "gte", value: "500000" }],
  },
  {
    key: "existing",
    label: "Existing customer",
    blurb: "Has bought from you before",
    rules: [{ ruleKind: "is_existing_customer", operator: "eq", value: "true" }],
  },
  {
    key: "new",
    label: "New customer",
    blurb: "Has never bought from you",
    rules: [{ ruleKind: "is_existing_customer", operator: "eq", value: "false" }],
  },
  {
    key: "active",
    label: "Active customer",
    blurb: "Customer status is Active",
    rules: [{ ruleKind: "lifecycle_status", operator: "in", value: "Active" }],
  },
];

/**
 * Which presets the current rules already match.
 *
 * Used to light up a chip when the rules happen to equal what it would add,
 * so the chips reflect reality rather than only what was last clicked. A
 * rule somebody edited by hand stops matching, which is correct — it is no
 * longer that segment.
 */
export function matchingPresets(rules: SegmentRule[]): string[] {
  return SEGMENT_PRESETS.filter((preset) =>
    preset.rules.every((wanted) =>
      rules.some(
        (held) =>
          held.ruleKind === wanted.ruleKind &&
          held.operator === wanted.operator &&
          held.value.trim() === wanted.value,
      ),
    ),
  ).map((preset) => preset.key);
}

/**
 * Apply a preset to a set of rules.
 *
 * Replaces any existing rule of the same kind rather than adding a second
 * one: two `lifecycle_status` rules would have to BOTH pass, and a customer
 * cannot be VIP and Active at once, so adding would build a segment that
 * matches nobody.
 *
 * Clicking a preset that is already applied removes its rules, so the chips
 * toggle.
 */
export function applyPreset(rules: SegmentRule[], presetKey: string): SegmentRule[] {
  const preset = SEGMENT_PRESETS.find((item) => item.key === presetKey);
  if (!preset) return rules;

  const already = matchingPresets(rules).includes(presetKey);

  if (already) {
    return rules.filter(
      (held) =>
        !preset.rules.some(
          (wanted) =>
            held.ruleKind === wanted.ruleKind &&
            held.operator === wanted.operator &&
            held.value.trim() === wanted.value,
        ),
    );
  }

  const kinds = new Set(preset.rules.map((rule) => rule.ruleKind));

  return [...rules.filter((held) => !kinds.has(held.ruleKind)), ...preset.rules];
}
