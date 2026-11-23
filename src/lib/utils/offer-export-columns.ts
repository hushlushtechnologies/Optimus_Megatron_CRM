import type { ExportColumn } from "@/src/lib/utils/export-columns";
import type {
  AssignmentExportRow,
  CampaignExportRow,
  LoyaltyExportRow,
  OfferExportDataset,
  RedemptionExportRow,
} from "@/src/lib/supabase/offer-export-queries";

/*
|--------------------------------------------------------------------------
| WHAT EACH EXPORT HOLDS
|--------------------------------------------------------------------------
|
| One column list per dataset, shared by the Excel and the PDF generator.
|
| The enquiry Excel generator's own comment explains why this is one list
| rather than two: in the lead export the headers and the widths are two
| literal arrays that have to be edited together, and getting them out of
| order shifts every heading one column along. Here the headers, the widths
| and the value extraction are one object per column, so a column cannot be
| half-added.
|
| `kind` tells the generators how to present a value, not what it is:
|
|   text     as written
|   date     the day, in Dubai
|   time     the day and the minute, in Dubai
|   money    right-aligned, two decimals, no currency symbol — the heading
|            carries the currency so a column of figures stays a column of
|            figures somebody can sum
|   number   right-aligned, thousands separated
*/

/* =========================================================
   CAMPAIGNS
========================================================= */

export const CAMPAIGN_EXPORT_COLUMNS: ExportColumn<CampaignExportRow>[] = [
  { header: "Reference", width: 14, kind: "text", value: (r) => r.reference },
  { header: "Campaign", width: 32, kind: "text", value: (r) => r.name },
  { header: "Type", width: 18, kind: "text", value: (r) => r.promotionType },
  { header: "Status", width: 12, kind: "text", value: (r) => r.status },
  { header: "Discount", width: 14, kind: "text", value: (r) => r.discount },
  { header: "Starts", width: 13, kind: "date", value: (r) => r.startsAt },
  { header: "Ends", width: 13, kind: "date", value: (r) => r.endsAt },
  { header: "Priority", width: 9, kind: "number", value: (r) => r.priority },
  { header: "Redemptions", width: 13, kind: "number", value: (r) => r.redemptionCount },
  { header: "Limit", width: 9, kind: "number", value: (r) => r.maxRedemptions },
  { header: "Discounts Given (AED)", width: 21, kind: "money", value: (r) => r.discountGiven },
  { header: "Min Purchase (AED)", width: 18, kind: "money", value: (r) => r.minPurchase },
  { header: "Max Discount (AED)", width: 18, kind: "money", value: (r) => r.maxDiscount },
  { header: "Stacking", width: 16, kind: "text", value: (r) => r.stackingPolicy },
  { header: "Created", width: 13, kind: "date", value: (r) => r.createdAt },
];

/* =========================================================
   REDEMPTIONS
========================================================= */

export const REDEMPTION_EXPORT_COLUMNS: ExportColumn<RedemptionExportRow>[] = [
  { header: "Redeemed", width: 18, kind: "time", value: (r) => r.redeemedAt },
  { header: "Campaign", width: 30, kind: "text", value: (r) => r.campaign },
  { header: "Reference", width: 14, kind: "text", value: (r) => r.campaignReference },
  { header: "Customer", width: 26, kind: "text", value: (r) => r.customer },
  { header: "Vehicle", width: 30, kind: "text", value: (r) => r.vehicle },
  { header: "Code", width: 14, kind: "text", value: (r) => r.code },
  { header: "Discount (AED)", width: 16, kind: "money", value: (r) => r.discount },
  { header: "Reversed", width: 18, kind: "time", value: (r) => r.reversedAt },
  { header: "Reversal Reason", width: 28, kind: "text", value: (r) => r.reversalReason },
];

/* =========================================================
   PERSONALISED OFFERS
========================================================= */

export const ASSIGNMENT_EXPORT_COLUMNS: ExportColumn<AssignmentExportRow>[] = [
  { header: "Assigned", width: 13, kind: "date", value: (r) => r.assignedAt },
  { header: "Campaign", width: 30, kind: "text", value: (r) => r.campaign },
  { header: "Customer", width: 26, kind: "text", value: (r) => r.customer },
  { header: "Vehicle", width: 30, kind: "text", value: (r) => r.vehicle },
  { header: "Valid From", width: 13, kind: "date", value: (r) => r.validFrom },
  { header: "Valid To", width: 13, kind: "date", value: (r) => r.validTo },
  { header: "Override (AED)", width: 16, kind: "money", value: (r) => r.discountOverride },
  { header: "Status", width: 13, kind: "text", value: (r) => r.status },
  { header: "Used", width: 8, kind: "text", value: (r) => r.used },
];

/* =========================================================
   LOYALTY TRANSACTIONS
========================================================= */

export const LOYALTY_EXPORT_COLUMNS: ExportColumn<LoyaltyExportRow>[] = [
  { header: "Date", width: 18, kind: "time", value: (r) => r.createdAt },
  { header: "Customer", width: 26, kind: "text", value: (r) => r.customer },
  { header: "Entry", width: 16, kind: "text", value: (r) => r.entryType },
  { header: "Points", width: 11, kind: "number", value: (r) => r.points },
  { header: "Source", width: 18, kind: "text", value: (r) => r.source },
  { header: "Reason", width: 32, kind: "text", value: (r) => r.reason },
  { header: "Expires", width: 13, kind: "date", value: (r) => r.expiresAt },
  { header: "By", width: 22, kind: "text", value: (r) => r.actor },
];

/* =========================================================
   TITLES
========================================================= */

export const DATASET_TITLES: Record<OfferExportDataset, string> = {
  campaigns: "Campaigns",
  redemptions: "Redemption History",
  assignments: "Personalised Offers",
  loyalty: "Loyalty Transactions",
};

/*

/*
 * The generic half moved to export-columns.ts in Sprint 9 so the report
 * exports could share it. Re-exported here so nothing that imported it from
 * this file had to change.
 */
export {
  formatCell,
  formatCellDate,
  formatCellMoney,
  formatCellNumber,
  formatCellTime,
} from "@/src/lib/utils/export-columns";
export type { ColumnKind, ExportColumn } from "@/src/lib/utils/export-columns";
