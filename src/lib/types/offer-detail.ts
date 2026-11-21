import type { DiscountType, PromotionStatus, PromotionType, StackingPolicy } from "@/src/lib/types/offers";

/*
|--------------------------------------------------------------------------
| THE DETAIL PAGE'S SHAPES
|--------------------------------------------------------------------------
|
| Kept apart from the list shapes: a list row needs "2 brands" in a sentence,
| a detail page needs the two brands by name. Loading the latter for sixty
| rows would be sixty queries.
*/

export interface OfferDetailTarget {
  id: string;
  targetKind: "car" | "brand" | "model" | "collection" | "location";
  targetId: string;
  /** Resolved for display. Null when the thing it pointed at is gone. */
  name: string | null;
}

export interface OfferDetailRule {
  id: string;
  ruleKind: string;
  operator: string;
  value: unknown;
}

export interface OfferAssignment {
  id: string;
  customerId: string;
  customerName: string | null;
  /** The customer_number — what people quote on the phone, not the uuid. */
  customerNumber: string | null;
  customerStatus: string | null;
  carId: string | null;
  carTitle: string | null;
  validFrom: string | null;
  validTo: string | null;
  /** This person's own discount, when it differs from the campaign's. */
  discountOverrideFils: string | null;
  status: "active" | "used" | "expired" | "cancelled";
  notes: string | null;
  assignedByName: string | null;
  createdAt: string;
}

export interface OfferCode {
  id: string;
  code: string;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usedCount: number;
  isActive: boolean;
  createdByName: string | null;
  createdAt: string;
}

export interface OfferRedemption {
  id: string;
  customerId: string;
  customerName: string | null;
  customerNumber: string | null;
  dealId: string | null;
  codeId: string | null;
  code: string | null;
  /** Kept as a string: a bigint of fils does not survive JSON as a number. */
  discountFils: string;
  status: "applied" | "reversed";
  reversedAt: string | null;
  reversalReason: string | null;
  redeemedByName: string | null;
  redeemedAt: string;
  /**
   * What the campaign said at the moment this was redeemed.
   *
   * A snapshot, not a reference. Editing the campaign afterwards must not
   * change what this customer was given — which is the whole point of
   * "do not allow changes to rewrite historical redemption amounts".
   */
  terms: Record<string, unknown>;
}

export interface OfferStatusChange {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  reason: string | null;
  changedByName: string | null;
  changedAt: string;
}

export interface OfferActivity {
  id: string;
  activityType: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  description: string | null;
  changedByName: string | null;
  changedAt: string;
}

export interface OfferDetail {
  id: string;
  name: string;
  reference: string | null;
  description: string | null;

  promotionType: PromotionType;
  status: PromotionStatus;

  discountType: DiscountType;
  discountValue: number;
  minPurchaseFils: string | null;
  maxDiscountFils: string | null;
  pointsMultiplier: number | null;
  stackingPolicy: StackingPolicy;

  startsAt: string | null;
  endsAt: string | null;
  priority: number;

  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  redemptionCount: number;

  internalNotes: string | null;
  bannerUrl: string | null;

  isActive: boolean;
  archivedAt: string | null;

  createdByName: string | null;
  createdAt: string;

  targets: OfferDetailTarget[];
  eligibilityRules: OfferDetailRule[];
  assignments: OfferAssignment[];
  codes: OfferCode[];
  redemptions: OfferRedemption[];
  statusHistory: OfferStatusChange[];
  activity: OfferActivity[];

  /** Totals across redemptions, for the Redemptions tab's header. */
  totals: {
    appliedCount: number;
    reversedCount: number;
    /** Sum of applied discounts, in fils, as a string. */
    discountGivenFils: string;
  };
}

export const OFFER_DETAIL_TABS = [
  "overview",
  "discount",
  "audience",
  "vehicles",
  "schedule",
  "redemptions",
  "history",
  "audit",
] as const;

export type OfferDetailTab = (typeof OFFER_DETAIL_TABS)[number];

export const OFFER_DETAIL_TAB_LABELS: Record<OfferDetailTab, string> = {
  overview: "Overview",
  discount: "Discount Rules",
  audience: "Audience",
  vehicles: "Eligible Vehicles",
  schedule: "Schedule",
  redemptions: "Redemptions",
  history: "History",
  audit: "Audit",
};
