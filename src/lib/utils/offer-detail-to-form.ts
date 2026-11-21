import type { OfferDetail } from "@/src/lib/types/offer-detail";
import type { DraftEligibilityRule } from "@/src/components/offers/offer-eligibility-builder";
import type { OfferFormInitial } from "@/src/components/offers/offer-form";
import type { TargetSelection } from "@/src/lib/supabase/offer-queries";
import { filsToDecimalString } from "@/src/lib/utils/sales-money";

/*
|--------------------------------------------------------------------------
| A SAVED CAMPAIGN, BACK INTO THE FORM
|--------------------------------------------------------------------------
|
| The exact inverse of what the form submits, and the most dangerous
| conversion in Sprint 8.
|
| Get it wrong and opening a campaign to fix a typo silently changes its
| numbers. Three ways that can happen:
|
|   1. Fils vs dirhams. The database holds 5000000; the form shows "50000".
|      Miss the division and the next save makes the minimum price AED
|      5,000,000.
|
|   2. Timestamps. The database holds "2026-12-01T20:00:00+04:00"; a
|      datetime-local input needs "2026-12-01T20:00". Slice it wrong and the
|      campaign moves by hours.
|
|   3. Rule values. The database holds ["VIP"] as jsonb and 5000000 for
|      lifetime spend; the form holds "VIP" and "50000". This is the inverse
|      of shapeRuleValue, and the two have to agree or a saved rule changes
|      every time somebody opens the form.
|
| All three are tested in tests/detail-to-form-test.mts, round-tripped
| against shapeRuleValue so the pair cannot drift.
*/

/**
 * A timestamptz as a `datetime-local` value in Dubai time.
 *
 * Dubai is a fixed UTC+04:00 with no daylight saving, so this is arithmetic
 * rather than a timezone library: add four hours to the UTC instant and read
 * off the wall clock.
 */
export function toDubaiLocalInput(iso: string | null): string {
  if (!iso) return "";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const dubai = new Date(date.getTime() + 4 * 60 * 60 * 1000);

  /* Built from UTC parts because `dubai` is deliberately shifted. */
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    `${dubai.getUTCFullYear()}-${pad(dubai.getUTCMonth() + 1)}-${pad(dubai.getUTCDate())}` +
    `T${pad(dubai.getUTCHours())}:${pad(dubai.getUTCMinutes())}`
  );
}

/** Fils as the dirhams text a money input expects. Blank for null. */
function filsToInput(fils: string | null): string {
  if (fils === null || fils === "") return "";

  try {
    const text = filsToDecimalString(BigInt(fils));
    /* "50000.00" reads badly in an input; trailing zeroes add nothing. */
    return text.replace(/\.00$/, "");
  } catch {
    return "";
  }
}

/**
 * A stored jsonb rule value, back to the text the builder holds.
 *
 * The inverse of shapeRuleValue. Lifetime spend is the one that converts
 * units: stored in fils, shown in dirhams.
 */
export function ruleValueToInput(ruleKind: string, value: unknown): string {
  if (value === null || value === undefined) return "";

  if (ruleKind === "min_lifetime_spend_fils") {
    try {
      return filsToInput(String(value));
    } catch {
      return "";
    }
  }

  if (Array.isArray(value)) {
    /* The builder offers one value per rule, so the first is the one shown. */
    return value.length === 0 ? "" : String(value[0]);
  }

  if (typeof value === "boolean") return value ? "true" : "false";

  return String(value);
}

export function offerDetailToForm(detail: OfferDetail): OfferFormInitial {
  const targets: TargetSelection[] = detail.targets.map((target) => ({
    targetKind: target.targetKind,
    targetId: target.targetId,
  }));

  const eligibilityRules: DraftEligibilityRule[] = detail.eligibilityRules.map((rule) => ({
    ruleKind: rule.ruleKind as DraftEligibilityRule["ruleKind"],
    operator: rule.operator as DraftEligibilityRule["operator"],
    value: ruleValueToInput(rule.ruleKind, rule.value),
  }));

  return {
    id: detail.id,
    name: detail.name,
    reference: detail.reference ?? "",
    description: detail.description ?? "",
    promotionType: detail.promotionType,
    discountType: detail.discountType,
    discountValue: String(detail.discountValue),
    startsAt: toDubaiLocalInput(detail.startsAt),
    endsAt: toDubaiLocalInput(detail.endsAt),
    priority: String(detail.priority),
    maxRedemptions: detail.maxRedemptions === null ? "" : String(detail.maxRedemptions),
    maxPerCustomer: detail.maxPerCustomer === null ? "" : String(detail.maxPerCustomer),
    minPurchase: filsToInput(detail.minPurchaseFils),
    maxDiscount: filsToInput(detail.maxDiscountFils),
    stackingPolicy: detail.stackingPolicy,
    pointsMultiplier: detail.pointsMultiplier === null ? "" : String(detail.pointsMultiplier),
    internalNotes: detail.internalNotes ?? "",
    targets,
    eligibilityRules,
  };
}
