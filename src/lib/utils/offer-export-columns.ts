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

export type ColumnKind = "text" | "date" | "time" | "money" | "number";

export interface ExportColumn<TRow> {
  header: string;
  width: number;
  kind: ColumnKind;
  value: (row: TRow) => string | number | null;
}

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
|--------------------------------------------------------------------------
| FORMATTING
|--------------------------------------------------------------------------
|
| Dubai is UTC+04:00 all year with no daylight saving, so a timestamp can be
| rendered in local time without a zone database — but the zone is named
| explicitly anyway, because the server's own clock is UTC and a file that
| says 02:00 for a redemption taken at 06:00 is a file somebody will
| reconcile wrongly.
*/

const DUBAI = "Asia/Dubai";

export function formatCellDate(iso: string | null): string {
  if (!iso) return "—";

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: DUBAI,
  }).format(parsed);
}

export function formatCellTime(iso: string | null): string {
  if (!iso) return "—";

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: DUBAI,
  }).format(parsed);
}

/**
 * A money value for a cell.
 *
 * Arrives as an exact decimal string from the fils in the database and is
 * handed on unchanged. Deliberately not parsed to a number on the way
 * through: AED 1,234,567.89 is beyond the range where a float still
 * represents every hundredth exactly, and this column gets summed.
 */
export function formatCellMoney(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";

  return String(value);
}

export function formatCellNumber(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString("en-US") : String(value);
}

/** One cell, as text, for whichever generator is asking. */
export function formatCell(kind: ColumnKind, value: string | number | null): string {
  switch (kind) {
    case "date":
      return formatCellDate(value === null ? null : String(value));
    case "time":
      return formatCellTime(value === null ? null : String(value));
    case "money":
      return formatCellMoney(value);
    case "number":
      return formatCellNumber(value);
    default:
      return value === null || value === undefined || value === "" ? "—" : String(value);
  }
}
