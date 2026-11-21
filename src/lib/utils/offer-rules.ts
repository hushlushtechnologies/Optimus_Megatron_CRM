import { divRoundHalfUp, percentToBps } from "@/src/lib/utils/sales-pricing";
import type { Fils } from "@/src/lib/utils/sales-money";
import {
  REJECTION_MESSAGES,
  type CustomerOfferAssignment,
  type EligibleOffer,
  type OfferCarContext,
  type OfferCustomerContext,
  type OfferEvaluation,
  type EligibilityRule,
  type Promotion,
  type PromotionCode,
  type RejectedOffer,
  type RejectionReason,
} from "@/src/lib/types/offers";

/*
|--------------------------------------------------------------------------
| THE OFFER RULES ENGINE
|--------------------------------------------------------------------------
|
| One deterministic function. Given a customer, a car, a deal's current
| state and optionally a typed code, it says which campaigns apply, what
| each would take off, and — just as importantly — why each of the others
| would not.
|
| Three things it is careful about:
|
| 1. MONEY IS FILS. Percentages go through basis points and
|    divRoundHalfUp, the same helpers sales pricing uses, so a 7.5% discount
|    lands on the same fils here as it does on the deal. No floats anywhere
|    in the discount path.
|
| 2. IT DECIDES NOTHING. It returns a recommendation. Applying an offer is a
|    separate server-side write inside a transaction that re-runs this with
|    the same inputs. A client preview is never the source of truth.
|
| 3. IT NEVER STACKS BY ACCIDENT. The default policy is `none`. If a manual
|    discount or a loyalty redemption is already on the deal, a campaign has
|    to say explicitly that it may be combined, or it is rejected with
|    `blocked_by_stacking` rather than quietly added.
*/

const ZERO = BigInt(0);
const ONE_HUNDRED = BigInt(100);
const BPS_DIVISOR = BigInt(10_000);

/* =========================================================
   WHAT ONE CAMPAIGN TAKES OFF
========================================================= */

/**
 * The discount in fils, for a price in fils.
 *
 * A percentage goes via basis points so 7.5% is exact rather than
 * 0.075 in binary floating point. A fixed amount is stored in whole
 * dirhams on the legacy column, so it is multiplied up to fils here.
 *
 * Capped three ways: by the campaign's own ceiling, by the price (a
 * discount cannot exceed what is being bought), and at zero.
 */
/**
 * Just the three fields the discount actually depends on.
 *
 * Narrowed in Sprint 8 so the create form's preview can call this with the
 * values somebody is typing, rather than having to fabricate a whole
 * Promotion with fourteen fields it would never read. A full Promotion still
 * satisfies it, so every existing caller is unchanged.
 */
export type DiscountInputs = Pick<
  Promotion,
  "discountType" | "discountValue" | "maxDiscountFils"
>;

export function discountForPrice(promotion: DiscountInputs, priceFils: Fils): Fils {
  if (priceFils <= ZERO) return ZERO;

  let discount: Fils;

  if (promotion.discountType === "percentage") {
    const bps = percentToBps(promotion.discountValue);
    discount = divRoundHalfUp(priceFils * bps, BPS_DIVISOR);
  } else {
    /* discount_value is whole dirhams on the legacy column. */
    discount = BigInt(Math.round(promotion.discountValue)) * ONE_HUNDRED;
  }

  if (promotion.maxDiscountFils !== null && discount > promotion.maxDiscountFils) {
    discount = promotion.maxDiscountFils;
  }

  /* Never more than the thing costs, and never negative. */
  if (discount > priceFils) discount = priceFils;
  if (discount < ZERO) discount = ZERO;

  return discount;
}

/* =========================================================
   TARGETING
========================================================= */

/**
 * Whether a campaign covers this car.
 *
 * No targets at all means every eligible vehicle — that is how a general
 * campaign is expressed, and it is why "no rows" must not be read as "no
 * matches".
 *
 * Matching any one target is enough. A car that is both a targeted brand
 * and a targeted collection matches once, not twice: this returns a
 * boolean, so overlapping targets cannot produce a double discount.
 */
export function carIsTargeted(promotion: Promotion, car: OfferCarContext): boolean {
  if (promotion.targets.length === 0) return true;

  return promotion.targets.some((target) => {
    switch (target.targetKind) {
      case "car":
        return target.targetId === car.id;
      case "brand":
        return target.targetId === car.brandId;
      case "model":
        return target.targetId === car.modelId;
      case "collection":
        return target.targetId === car.collectionId;
      case "location":
        return target.targetId === car.locationId;
      default:
        return false;
    }
  });
}

/* =========================================================
   ELIGIBILITY
========================================================= */

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/** Whether one rule passes. */
function rulePasses(rule: EligibilityRule, customer: OfferCustomerContext): boolean {
  switch (rule.ruleKind) {
    case "lifecycle_status": {
      const wanted = asStringArray(rule.value);
      const has = wanted.includes(customer.lifecycleStatus);
      return rule.operator === "not_in" ? !has : has;
    }

    case "customer_tag": {
      const wanted = asStringArray(rule.value);
      const has = wanted.some((tagId) => customer.tagIds.includes(tagId));
      return rule.operator === "not_in" ? !has : has;
    }

    case "interested_brand": {
      const wanted = asStringArray(rule.value);
      const has = wanted.some((brandId) => customer.interestedBrandIds.includes(brandId));
      return rule.operator === "not_in" ? !has : has;
    }

    case "min_completed_deals": {
      const threshold = asNumber(rule.value);
      if (threshold === null) return false;
      return rule.operator === "lte"
        ? customer.completedDeals <= threshold
        : customer.completedDeals >= threshold;
    }

    case "min_lifetime_spend_fils": {
      const threshold = asNumber(rule.value);
      if (threshold === null) return false;
      const thresholdFils = BigInt(Math.round(threshold));
      return rule.operator === "lte"
        ? customer.lifetimeSpendFils <= thresholdFils
        : customer.lifetimeSpendFils >= thresholdFils;
    }

    case "is_existing_customer": {
      const wantExisting = rule.value === true || rule.value === "true";
      const isExisting = customer.completedDeals > 0;
      return wantExisting ? isExisting : !isExisting;
    }

    default:
      /*
       * An unknown rule kind fails closed. A rule nobody can evaluate must
       * not quietly become "everyone qualifies" — that is how a VIP-only
       * campaign ends up on every deal in the showroom.
       */
      return false;
  }
}

/** Every rule has to pass. */
export function customerIsEligible(promotion: Promotion, customer: OfferCustomerContext): boolean {
  if (promotion.eligibilityRules.length === 0) return true;

  return promotion.eligibilityRules.every((rule) => rulePasses(rule, customer));
}

/* =========================================================
   THE EVALUATION
========================================================= */

export interface EvaluateOffersInput {
  promotions: Promotion[];
  customer: OfferCustomerContext;
  car: OfferCarContext;

  /** Private offers this customer holds. */
  assignments: CustomerOfferAssignment[];

  /** A code the person typed, already looked up. */
  code?: PromotionCode | null;

  /** Campaign ids already applied to this deal. */
  appliedPromotionIds?: string[];

  /** How many times this customer has redeemed each campaign. */
  customerRedemptionCounts?: Record<string, number>;

  /** A manual discount already on the deal, in fils. */
  manualDiscountFils?: Fils;

  /** Points already being redeemed against this deal. */
  loyaltyPointsApplied?: number;

  /** Taken as "now". Passed in so a test does not depend on the clock. */
  now?: Date;
}

/**
 * Which offers apply, which don't, and why.
 *
 * Deterministic: the same inputs give the same answer, including the order
 * of the eligible list. Ties are broken by priority, then by the larger
 * discount, then by id — never by the order rows came back from the
 * database.
 */
export function evaluateOffers(input: EvaluateOffersInput): OfferEvaluation {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();

  const applied = new Set(input.appliedPromotionIds ?? []);
  const perCustomer = input.customerRedemptionCounts ?? {};
  const manualDiscount = input.manualDiscountFils ?? ZERO;
  const loyaltyApplied = input.loyaltyPointsApplied ?? 0;

  const hasOtherDiscount = manualDiscount > ZERO || loyaltyApplied > 0;

  const eligible: EligibleOffer[] = [];
  const rejected: RejectedOffer[] = [];

  const reject = (promotion: Promotion, reason: RejectionReason) => {
    rejected.push({ promotion, reason, message: REJECTION_MESSAGES[reason] });
  };

  for (const promotion of input.promotions) {
    /* ---- Is it running at all? ---- */

    if (promotion.archivedAt !== null) {
      reject(promotion, "archived");
      continue;
    }

    if (promotion.status !== "active") {
      reject(promotion, promotion.status === "expired" ? "ended" : "wrong_status");
      continue;
    }

    if (promotion.startsAt !== null && Date.parse(promotion.startsAt) > nowMs) {
      reject(promotion, "not_started");
      continue;
    }

    if (promotion.endsAt !== null && Date.parse(promotion.endsAt) <= nowMs) {
      reject(promotion, "ended");
      continue;
    }

    /* ---- Already on this deal? ---- */

    if (applied.has(promotion.id)) {
      reject(promotion, "already_applied_to_deal");
      continue;
    }

    /* ---- Limits ---- */

    if (promotion.maxRedemptions !== null && promotion.redemptionCount >= promotion.maxRedemptions) {
      reject(promotion, "campaign_limit_reached");
      continue;
    }

    if (promotion.maxPerCustomer !== null && (perCustomer[promotion.id] ?? 0) >= promotion.maxPerCustomer) {
      reject(promotion, "customer_limit_reached");
      continue;
    }

    /* ---- A private offer, or a public campaign? ---- */

    const assignment =
      input.assignments.find(
        (item) => item.promotionId === promotion.id && item.customerId === input.customer.id,
      ) ?? null;

    const isPrivate = promotion.promotionType === "customer";

    if (isPrivate) {
      if (!assignment) {
        /*
         * The whole point of a private offer: without an assignment it does
         * not exist for this customer. Ahmed's AED 25,000 cannot be used by
         * Mohammed.
         */
        reject(promotion, "assignment_required");
        continue;
      }

      if (assignment.status === "used") {
        reject(promotion, "assignment_used");
        continue;
      }

      if (assignment.status !== "active") {
        reject(promotion, "assignment_expired");
        continue;
      }

      if (assignment.validFrom !== null && Date.parse(assignment.validFrom) > nowMs) {
        reject(promotion, "not_started");
        continue;
      }

      if (assignment.validTo !== null && Date.parse(assignment.validTo) <= nowMs) {
        reject(promotion, "assignment_expired");
        continue;
      }

      /* An assignment can pin the offer to one car. */
      if (assignment.carId !== null && assignment.carId !== input.car.id) {
        reject(promotion, "car_not_targeted");
        continue;
      }
    }

    /* ---- Codes ---- */

    const needsCode = promotion.promotionType === "code";
    let usedCode: PromotionCode | null = null;

    if (needsCode) {
      const code = input.code;

      if (!code || code.promotionId !== promotion.id) {
        reject(promotion, "code_required");
        continue;
      }

      if (!code.isActive) {
        reject(promotion, "code_inactive");
        continue;
      }

      if (code.usageLimit !== null && code.usedCount >= code.usageLimit) {
        reject(promotion, "code_limit_reached");
        continue;
      }

      if (code.perCustomerLimit !== null && (perCustomer[promotion.id] ?? 0) >= code.perCustomerLimit) {
        reject(promotion, "code_customer_limit_reached");
        continue;
      }

      usedCode = code;
    }

    /* ---- Does it cover this car? ---- */
    /* A private offer pinned to a car has already been checked above. */

    if (!isPrivate && !carIsTargeted(promotion, input.car)) {
      reject(promotion, "car_not_targeted");
      continue;
    }

    /* ---- Does this customer qualify? ---- */

    if (!isPrivate && !customerIsEligible(promotion, input.customer)) {
      reject(promotion, "customer_not_eligible");
      continue;
    }

    /* ---- Minimum spend ---- */

    if (promotion.minPurchaseFils !== null && input.car.priceFils < promotion.minPurchaseFils) {
      reject(promotion, "below_minimum_purchase");
      continue;
    }

    /* ---- Stacking ---- */

    if (hasOtherDiscount) {
      const allowsManual =
        promotion.stackingPolicy === "with_manual" || promotion.stackingPolicy === "with_manual_and_loyalty";

      const allowsLoyalty =
        promotion.stackingPolicy === "with_loyalty" || promotion.stackingPolicy === "with_manual_and_loyalty";

      const manualBlocks = manualDiscount > ZERO && !allowsManual;
      const loyaltyBlocks = loyaltyApplied > 0 && !allowsLoyalty;

      if (manualBlocks || loyaltyBlocks) {
        reject(promotion, "blocked_by_stacking");
        continue;
      }
    }

    /* ---- What does it actually take off? ---- */

    const discountFils =
      assignment?.discountOverrideFils !== null && assignment?.discountOverrideFils !== undefined
        ? /* A per-customer figure still cannot exceed the price. */
          assignment.discountOverrideFils > input.car.priceFils
          ? input.car.priceFils
          : assignment.discountOverrideFils
        : discountForPrice(promotion, input.car.priceFils);

    /*
     * A points-multiplier campaign legitimately has no discount, so it is
     * only "no discount" if it does nothing at all.
     */
    if (discountFils <= ZERO && promotion.pointsMultiplier === null) {
      reject(promotion, "no_discount");
      continue;
    }

    eligible.push({
      promotion,
      discountFils,
      assignment: isPrivate ? assignment : null,
      code: usedCode,
      pointsMultiplier: promotion.pointsMultiplier,
      explanation: explain(promotion, assignment, usedCode),
    });
  }

  /*
   * Deterministic order: priority, then the bigger discount, then id. The
   * id tie-break matters — without it two identical campaigns could swap
   * places between page loads and the "best" offer would change on refresh.
   */
  eligible.sort((a, b) => {
    if (b.promotion.priority !== a.promotion.priority) {
      return b.promotion.priority - a.promotion.priority;
    }
    if (b.discountFils !== a.discountFils) {
      return b.discountFils > a.discountFils ? 1 : -1;
    }
    return a.promotion.id.localeCompare(b.promotion.id);
  });

  return {
    eligible,
    rejected,
    best: eligible[0] ?? null,
    hasOtherDiscount,
  };
}

/** Why this applies, in a sentence somebody can read out. */
function explain(
  promotion: Promotion,
  assignment: CustomerOfferAssignment | null,
  code: PromotionCode | null,
): string {
  if (assignment) {
    return assignment.discountOverrideFils !== null
      ? "Assigned to this customer, with a discount set for them."
      : "Assigned to this customer.";
  }

  if (code) return `Unlocked by code ${code.code}.`;

  if (promotion.targets.length === 0) return "Applies to every eligible vehicle.";

  if (promotion.eligibilityRules.length > 0) {
    return "This vehicle is included and the customer meets the conditions.";
  }

  return "This vehicle is included in the campaign.";
}
