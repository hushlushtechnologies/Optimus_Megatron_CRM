import type { Fils } from "@/src/lib/utils/sales-money";

/*
|--------------------------------------------------------------------------
| OFFERS AND PROMOTIONS — THE SHAPES
|--------------------------------------------------------------------------
|
| One campaign table, extended from the flat `promotions` lookup Inventory
| already used, plus targeting, eligibility, codes, assignments and
| redemptions around it.
|
| Money is Fils (bigint) everywhere a figure can become money owed. The
| legacy `discountValue` number stays because the existing listing preview
| reads it, but anything that reaches a deal goes through fils.
*/

export const PROMOTION_STATUSES = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "expired",
  "cancelled",
  "archived",
] as const;

export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

/** Which statuses count as work in progress, for the list tabs. */
export const OPEN_PROMOTION_STATUSES: readonly PromotionStatus[] = ["draft", "scheduled", "active", "paused"];

export const PROMOTION_STATUS_TONES: Record<
  PromotionStatus,
  "info" | "warning" | "success" | "danger" | "neutral"
> = {
  draft: "neutral",
  scheduled: "info",
  active: "success",
  paused: "warning",
  expired: "neutral",
  cancelled: "danger",
  archived: "neutral",
};

export const PROMOTION_TYPES = [
  "general",
  "vehicle",
  "brand",
  "model",
  "collection",
  "location",
  "customer",
  "segment",
  "code",
] as const;

export type PromotionType = (typeof PROMOTION_TYPES)[number];

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  general: "General",
  vehicle: "Vehicle",
  brand: "Brand",
  model: "Model",
  collection: "Collection",
  location: "Location",
  customer: "Customer",
  segment: "Segment",
  code: "Promo code",
};

export type DiscountType = "percentage" | "fixed";

/**
 * Whether a campaign may be combined with other discounts.
 *
 * The default is `none`, and that is deliberate: the plan asks for a safe
 * non-stacking policy until somebody configures otherwise. Four discounts
 * silently adding up is how a car gets sold below cost.
 */
export const STACKING_POLICIES = ["none", "with_manual", "with_loyalty", "with_manual_and_loyalty"] as const;

export type StackingPolicy = (typeof STACKING_POLICIES)[number];

export const STACKING_POLICY_LABELS: Record<StackingPolicy, string> = {
  none: "On its own — no other discount",
  with_manual: "May combine with a manual sales discount",
  with_loyalty: "May combine with a loyalty redemption",
  with_manual_and_loyalty: "May combine with a manual discount and loyalty",
};

export type TargetKind = "car" | "brand" | "model" | "collection" | "location";

export const ELIGIBILITY_RULE_KINDS = [
  "lifecycle_status",
  "customer_tag",
  "min_completed_deals",
  "min_lifetime_spend_fils",
  "interested_brand",
  "is_existing_customer",
] as const;

export type EligibilityRuleKind = (typeof ELIGIBILITY_RULE_KINDS)[number];

export const ELIGIBILITY_RULE_LABELS: Record<EligibilityRuleKind, string> = {
  lifecycle_status: "Customer status",
  customer_tag: "Has tag",
  min_completed_deals: "Completed purchases",
  min_lifetime_spend_fils: "Lifetime spend",
  interested_brand: "Interested in brand",
  is_existing_customer: "Existing customer",
};

export interface EligibilityRule {
  id: string;
  ruleKind: EligibilityRuleKind;
  operator: "in" | "not_in" | "gte" | "lte" | "eq";
  /** A JSON array for in/not_in, a single number for gte/lte. */
  value: unknown;
}

export interface PromotionTarget {
  id: string;
  targetKind: TargetKind;
  targetId: string;
}

/** A campaign, as the rules engine needs it. */
export interface Promotion {
  id: string;
  name: string;
  reference: string | null;
  description: string | null;
  promotionType: PromotionType;
  status: PromotionStatus;

  discountType: DiscountType;
  /** The legacy numeric value: percent, or whole dirhams for a fixed amount. */
  discountValue: number;

  startsAt: string | null;
  endsAt: string | null;
  priority: number;

  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  redemptionCount: number;

  minPurchaseFils: Fils | null;
  maxDiscountFils: Fils | null;
  pointsMultiplier: number | null;
  stackingPolicy: StackingPolicy;

  archivedAt: string | null;

  targets: PromotionTarget[];
  eligibilityRules: EligibilityRule[];
}

/** A private offer, narrowing a campaign to one customer. */
export interface CustomerOfferAssignment {
  id: string;
  promotionId: string;
  customerId: string;
  carId: string | null;
  dealId: string | null;
  validFrom: string | null;
  validTo: string | null;
  discountOverrideFils: Fils | null;
  status: "active" | "used" | "expired" | "cancelled";
  notes: string | null;
}

export interface PromotionCode {
  id: string;
  promotionId: string;
  code: string;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usedCount: number;
  isActive: boolean;
}

/* =========================================================
   WHAT THE ENGINE IS GIVEN
========================================================= */

/** The customer, as far as eligibility is concerned. */
export interface OfferCustomerContext {
  id: string;
  lifecycleStatus: string;
  tagIds: string[];
  completedDeals: number;
  lifetimeSpendFils: Fils;
  interestedBrandIds: string[];
}

/** The vehicle a discount would apply to. */
export interface OfferCarContext {
  id: string;
  brandId: string | null;
  modelId: string | null;
  collectionId: string | null;
  locationId: string | null;
  /** The price the discount comes off. */
  priceFils: Fils;
}

/* =========================================================
   WHAT THE ENGINE RETURNS
========================================================= */

/**
 * Why a campaign was turned down.
 *
 * A code rather than a sentence so the UI can phrase it and a test can
 * assert on it. The plan asks for eligibility to be explainable; a bare
 * "not eligible" explains nothing to the salesperson on the phone.
 */
export const REJECTION_REASONS = [
  "not_live",
  "not_started",
  "ended",
  "archived",
  "wrong_status",
  "car_not_targeted",
  "customer_not_eligible",
  "below_minimum_purchase",
  "campaign_limit_reached",
  "customer_limit_reached",
  "already_applied_to_deal",
  "assignment_required",
  "assignment_expired",
  "assignment_used",
  "code_required",
  "code_inactive",
  "code_limit_reached",
  "code_customer_limit_reached",
  "no_discount",
  "blocked_by_stacking",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const REJECTION_MESSAGES: Record<RejectionReason, string> = {
  not_live: "This campaign isn't running.",
  not_started: "This campaign hasn't started yet.",
  ended: "This campaign has ended.",
  archived: "This campaign has been archived.",
  wrong_status: "This campaign isn't active.",
  car_not_targeted: "This vehicle isn't included in the campaign.",
  customer_not_eligible: "This customer doesn't meet the campaign's conditions.",
  below_minimum_purchase: "The price is below the campaign's minimum.",
  campaign_limit_reached: "This campaign has been fully redeemed.",
  customer_limit_reached: "This customer has already used this campaign as often as allowed.",
  already_applied_to_deal: "This campaign is already on this deal.",
  assignment_required: "This offer has to be assigned to the customer first.",
  assignment_expired: "The customer's offer has expired.",
  assignment_used: "The customer has already used this offer.",
  code_required: "This campaign needs a promotional code.",
  code_inactive: "That code isn't active.",
  code_limit_reached: "That code has been used as often as allowed.",
  code_customer_limit_reached: "This customer has already used that code.",
  no_discount: "This campaign works out to no discount.",
  blocked_by_stacking: "Another discount is already applied and this one can't be combined with it.",
};

export interface EligibleOffer {
  promotion: Promotion;
  /** What it takes off, in fils. */
  discountFils: Fils;
  /** Set when a private assignment is what makes it eligible. */
  assignment: CustomerOfferAssignment | null;
  /** Set when a code is what makes it eligible. */
  code: PromotionCode | null;
  /** Null unless the campaign changes points earning. */
  pointsMultiplier: number | null;
  /** In the customer's words: why this applies. */
  explanation: string;
}

export interface RejectedOffer {
  promotion: Promotion;
  reason: RejectionReason;
  message: string;
}

export interface OfferEvaluation {
  /** Everything that could be applied, best first. */
  eligible: EligibleOffer[];
  /** Everything that could not, with why. */
  rejected: RejectedOffer[];
  /**
   * The one the engine would pick, by priority then discount.
   *
   * A recommendation, not an action. Nothing is applied until somebody
   * chooses it and the server writes it inside a transaction.
   */
  best: EligibleOffer | null;
  /** True when a manual discount or loyalty redemption is already on the deal. */
  hasOtherDiscount: boolean;
}
