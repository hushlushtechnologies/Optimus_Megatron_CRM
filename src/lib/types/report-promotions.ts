import type { ReportFigure } from "@/src/lib/supabase/report-aggregate";
import type { Money } from "@/src/lib/utils/report-money";
import type { NamedCount } from "@/src/lib/types/report-customers";

/*
|--------------------------------------------------------------------------
| THE PROMOTIONS AND LOYALTY REPORT
|--------------------------------------------------------------------------
|
| Reads Sprint 8's data: campaigns, redemptions and the points ledger.
|
| THREE THINGS THIS REPORT HAS TO GET RIGHT
|
| ONE: A REVERSED REDEMPTION GAVE NO DISCOUNT.
|
| offer_redemptions keeps reversals in place rather than deleting them, so
| the history survives. Summing discount_fils without excluding them
| overstates what the dealership actually gave away — and it overstates it
| in the direction that makes a campaign look more expensive than it was,
| which is how a campaign that worked gets cancelled.
|
| They are not dropped either. Reversals are counted and shown on their own
| line, because "we gave AED 40,000 of discount" and "we gave AED 52,000 and
| clawed back AED 12,000" are different facts about how the month went.
|
| TWO: THE STATUS CASING.
|
| promotions.status is lowercase in the database — 'active', 'paused'.
| sales_deals.status is capitalised — 'Completed'. Both conventions are live
| in this schema. Sprint 8 had a notification that compared against "Active"
| and therefore never fired once. Everything here compares lowercase, and
| the constants below are the single place that is written down.
|
| THREE: POINTS ARE NOT ONE NUMBER.
|
| The ledger holds seven kinds of entry and the database constrains their
| signs: earn is positive; redeem, expire, reverse and refund_reversal are
| negative; adjust and correction may be either. Summing the column gives a
| net movement, which is a real figure and not the one anybody means by
| "points earned this month". So the earn side, the spend side and the
| lapse side are reported separately, and the net is shown as what it is.
*/

/** Campaign statuses, lowercase, as the database stores them. */
export const PROMOTION_LIVE_STATUS = "active";
export const PROMOTION_PAUSED_STATUS = "paused";

/** Ledger entry types, from the CHECK constraint on loyalty_ledger. */
export const LOYALTY_ENTRY_TYPES = [
  "earn",
  "redeem",
  "expire",
  "reverse",
  "adjust",
  "refund_reversal",
  "correction",
] as const;

export type LoyaltyEntryType = (typeof LOYALTY_ENTRY_TYPES)[number];

export const LOYALTY_ENTRY_LABELS: Record<LoyaltyEntryType, string> = {
  earn: "Earned",
  redeem: "Redeemed",
  expire: "Expired",
  reverse: "Reversed",
  adjust: "Adjusted",
  refund_reversal: "Reversed on refund",
  correction: "Corrected",
};

export const REVERSAL_NOTE =
  "Reversed redemptions are excluded from discount given and counted on their own line. A reversal undoes a discount; leaving it in would overstate what was given away.";

export const POINTS_NOTE =
  "Earned, redeemed and expired are reported separately because they answer different questions. Net movement is the sum of every entry, including manual adjustments.";

export interface CampaignPerformanceRow {
  id: string;
  name: string;
  reference: string | null;
  status: string;
  /** Redemptions in the period that were not reversed. */
  redemptions: number;
  /** Reversed in the period. Not included in `redemptions`. */
  reversals: number;
  /** Discount actually given, reversals excluded. */
  discount: Money;
}

export interface PointsMovementRow {
  id: LoyaltyEntryType;
  label: string;
  /** Ledger entries of this kind in the period. */
  entries: number;
  /** Their total, keeping the ledger's own sign. */
  points: number;
}

export interface PromotionsReportData {
  /* ---- campaigns ---- */

  /** Campaigns with status 'active' right now. Not a period figure. */
  liveCampaigns: ReportFigure<number>;
  pausedCampaigns: ReportFigure<number>;
  /** Campaigns that ran at any point in the period. */
  campaignsInPeriod: ReportFigure<number>;

  /* ---- redemptions ---- */

  redemptions: ReportFigure<number>;
  reversals: ReportFigure<number>;
  /** Discount given, reversals excluded. */
  discountGiven: ReportFigure<Money>;
  /** Discount that was reversed. Shown so the two reconcile. */
  discountReversed: ReportFigure<Money>;
  /** Discount given divided by redemptions. Null when there were none. */
  averageDiscount: ReportFigure<Money | null>;

  byCampaign: ReportFigure<CampaignPerformanceRow[]>;
  byDiscountType: ReportFigure<NamedCount[]>;

  /* ---- loyalty ---- */

  pointsEarned: ReportFigure<number>;
  pointsRedeemed: ReportFigure<number>;
  pointsExpired: ReportFigure<number>;
  /** Every entry summed, signs kept. Can be negative. */
  pointsNet: ReportFigure<number>;
  /** Customers holding a non-zero balance right now. */
  walletsWithBalance: ReportFigure<number>;

  pointsMovement: ReportFigure<PointsMovementRow[]>;

  currency: string;
  rangeLabel: string;
}

export interface PromotionsMetric {
  id: string;
  label: string;
  definition: string;
  basis: string;
  financial: boolean;
  group: "campaigns" | "redemptions" | "loyalty";
}

export const PROMOTIONS_METRICS: readonly PromotionsMetric[] = [
  {
    id: "liveCampaigns",
    label: "Live campaigns",
    definition: "Campaigns with status Active right now, whatever period is selected.",
    basis: "current",
    financial: false,
    group: "campaigns",
  },
  {
    id: "pausedCampaigns",
    label: "Paused campaigns",
    definition: "Campaigns currently paused. They can be resumed without being recreated.",
    basis: "current",
    financial: false,
    group: "campaigns",
  },
  {
    id: "campaignsInPeriod",
    label: "Campaigns running in period",
    definition:
      "Campaigns whose run dates overlap the selected period, whether or not they are live now.",
    basis: "Campaign start and end dates",
    financial: false,
    group: "campaigns",
  },
  {
    id: "redemptions",
    label: "Redemptions",
    definition:
      "Discounts taken up in the period and not reversed. Counted by when the discount was applied.",
    basis: "Redemption date",
    financial: false,
    group: "redemptions",
  },
  {
    id: "reversals",
    label: "Reversals",
    definition:
      "Redemptions reversed in the period. Excluded from the redemption count and from discount given.",
    basis: "Redemption date",
    financial: false,
    group: "redemptions",
  },
  {
    id: "discountGiven",
    label: "Discount given",
    definition:
      "Total discount applied, reversals excluded. This is money not collected — it is not an expense and not a refund.",
    basis: "Redemption date",
    financial: true,
    group: "redemptions",
  },
  {
    id: "discountReversed",
    label: "Discount reversed",
    definition:
      "Discount on redemptions that were later reversed. Shown so the two figures reconcile against the raw ledger.",
    basis: "Redemption date",
    financial: true,
    group: "redemptions",
  },
  {
    id: "averageDiscount",
    label: "Average discount",
    definition: "Discount given divided by redemptions. Blank when there were no redemptions.",
    basis: "Redemption date",
    financial: true,
    group: "redemptions",
  },
  {
    id: "pointsEarned",
    label: "Points earned",
    definition: "Points added by qualifying purchases in the period.",
    basis: "Ledger entry date",
    financial: false,
    group: "loyalty",
  },
  {
    id: "pointsRedeemed",
    label: "Points redeemed",
    definition: "Points spent against deals in the period, shown as a positive number.",
    basis: "Ledger entry date",
    financial: false,
    group: "loyalty",
  },
  {
    id: "pointsExpired",
    label: "Points expired",
    definition: "Points that aged out in the period, shown as a positive number.",
    basis: "Ledger entry date",
    financial: false,
    group: "loyalty",
  },
  {
    id: "pointsNet",
    label: "Net points movement",
    definition:
      "Every ledger entry in the period summed with its own sign, manual adjustments included. Negative means balances fell.",
    basis: "Ledger entry date",
    financial: false,
    group: "loyalty",
  },
  {
    id: "walletsWithBalance",
    label: "Wallets with a balance",
    definition: "Customers holding points right now, whatever period is selected.",
    basis: "current",
    financial: false,
    group: "loyalty",
  },
];
