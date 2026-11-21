import type { DiscountType, PromotionStatus, PromotionType } from "@/src/lib/types/offers";

/*
|--------------------------------------------------------------------------
| THE LIST AND DASHBOARD SHAPES
|--------------------------------------------------------------------------
|
| Kept apart from the rules-engine shapes in offers.ts. The engine needs
| targets and eligibility rows to decide anything; a list row needs a
| sentence describing them. Loading full targeting for sixty rows to render
| "3 brands" would be a query per row.
*/

export interface OfferListRow {
  id: string;
  name: string;
  reference: string | null;
  promotionType: PromotionType;
  status: PromotionStatus;

  discountType: DiscountType;
  discountValue: number;

  startsAt: string | null;
  endsAt: string | null;
  priority: number;

  redemptionCount: number;
  maxRedemptions: number | null;

  /** "2 brands, 1 collection" — built from the target counts. */
  targetSummary: string | null;
  /** How many customers hold this as a private offer. */
  assignmentCount: number;
  /** How many codes unlock it. */
  codeCount: number;

  createdByName: string | null;
  createdAt: string;
  archivedAt: string | null;
}

/** The tabs on the offers list. */
export const OFFER_TABS = ["all", "active", "scheduled", "ended", "drafts"] as const;

export type OfferTab = (typeof OFFER_TABS)[number];

export const OFFER_TAB_LABELS: Record<OfferTab, string> = {
  all: "All",
  active: "Running",
  scheduled: "Scheduled",
  ended: "Finished",
  drafts: "Drafts",
};

/**
 * Which statuses each tab holds.
 *
 * "Finished" groups expired and cancelled: both mean "not coming back", and
 * two tabs for that is two tabs nobody clicks.
 */
export const OFFER_TAB_STATUSES: Record<OfferTab, readonly PromotionStatus[] | null> = {
  all: null,
  active: ["active", "paused"],
  scheduled: ["scheduled"],
  ended: ["expired", "cancelled"],
  drafts: ["draft"],
};

export const OFFER_SORTS = [
  { id: "newest", label: "Newest first", column: "created_at", ascending: false },
  { id: "oldest", label: "Oldest first", column: "created_at", ascending: true },
  { id: "name", label: "Name A–Z", column: "name", ascending: true },
  { id: "ending", label: "Ending soonest", column: "ends_at", ascending: true },
  { id: "redemptions", label: "Most redeemed", column: "redemption_count", ascending: false },
  { id: "priority", label: "Highest priority", column: "priority", ascending: false },
] as const;

export type OfferSortId = (typeof OFFER_SORTS)[number]["id"];

export interface OfferFilters {
  type: string;
  status: string;
  discountType: string;
  createdBy: string;
  from: string;
  to: string;
}

export const EMPTY_OFFER_FILTERS: OfferFilters = {
  type: "",
  status: "",
  discountType: "",
  createdBy: "",
  from: "",
  to: "",
};

export function countActiveOfferFilters(filters: OfferFilters): number {
  return Object.values(filters).filter((value) => value !== "").length;
}

/* =========================================================
   THE DASHBOARD
========================================================= */

export interface OfferSummary {
  totalPromotions: number;
  activePromotions: number;
  scheduledPromotions: number;
  expiredPromotions: number;
  personalisedOffers: number;
  totalRedemptions: number;

  /** Running now, soonest to end first. */
  currentlyActive: OfferListRow[];
  /** Starting next, soonest first. */
  scheduledNext: OfferListRow[];
  /** Ended in the last 30 days. */
  recentlyExpired: OfferListRow[];

  /**
   * Campaigns worth a look, each with the reason.
   *
   * Not a vague "needs attention" list: every entry says what is wrong, so
   * somebody can act on it rather than open all of them to find out.
   */
  needsAttention: { offer: OfferListRow; reason: string }[];

  /**
   * Null when the loyalty program has never been switched on, which is
   * different from being on with nothing happening.
   */
  loyalty: {
    isEnabled: boolean;
    participatingCustomers: number;
    pointsOutstanding: number;
    pointsEarned30d: number;
    pointsRedeemed30d: number;
  } | null;
}
