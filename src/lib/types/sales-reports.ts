import type { SalesDealStatus } from "@/src/lib/types/sales";
import type { SetCompleteness } from "@/src/lib/supabase/report-aggregate";
import type { Money } from "@/src/lib/utils/report-money";

/*
|--------------------------------------------------------------------------
| SALES REPORTS (Sprint 6 Phase 17)
|--------------------------------------------------------------------------
|
| Every figure here is derived from the same views the Sales pages read, so a
| report and the screen it links to can never disagree. Row-level security
| applies, which means two people with different roles can legitimately see
| different totals: each sees their own view of the business.
|
| SPRINT 9: money is no longer read as a number. Every money figure is a
| Money — exact fils as a string, a preformatted display string, and a lossy
| number for chart geometry only. The float summing this file used to do is
| explained in report-money.ts.
|
| A money field being null means its lookup FAILED. It does not mean zero. A
| genuinely empty period returns a Money of zero, which displays as "AED 0.00".
*/

export type ReportRange = "this-month" | "last-month" | "last-90" | "year" | "all";

export const REPORT_RANGES: { id: ReportRange; label: string }[] = [
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "last-90", label: "Last 90 days" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
];

export interface SalesKpis {
  /** Deals created in the period, by created_at. */
  created: number;
  /** Deals completed in the period, by completed_at. */
  completed: number;
  /** Deals created in the period that are now Cancelled. */
  cancelled: number;
  /** Still open right now, whenever they were created. Not period-bound. */
  open: number;

  /** Total due across deals completed in the period. Null if the lookup failed. */
  completedValue: Money | null;

  /**
   * Verified payments IN during the period. **Not** net of refunds.
   *
   * Sprint 6 netted refunds into this figure and called it "Collected", so a
   * month that took AED 2m and refunded AED 2m reported zero. The two are
   * separate metrics by definition and are now separate fields.
   */
  collected: Money | null;
  /** Verified refunds OUT during the period, expressed positive. */
  refunded: Money | null;
  /** collected − refunded. Negative in a heavy refund month. */
  netCash: Money | null;

  /** Balance outstanding on Confirmed deals. Not Reserved or Negotiation. */
  outstanding: Money | null;

  /**
   * Of the deals CREATED in this period, the share that have completed.
   * Always 0–100. Null when nothing was created in the period.
   *
   * Replaces `winRate`, which divided deals completed in the window by deals
   * created in the window — two different populations — and therefore
   * exceeded 100% whenever the sales cycle outlasted the window.
   */
  cohortWinRate: number | null;
  /** The numerator of cohortWinRate, shown so the rate can be checked. */
  cohortCompleted: number;

  /** Average value of a deal completed in the period. Null when none did. */
  averageDealValue: Money | null;

  currency: string;

  /** Which figures were capped or failed. */
  completeness: SetCompleteness;
  /** One sentence for the reader, or null when everything is complete. */
  notice: string | null;
}

export interface StatusBreakdownRow {
  status: SalesDealStatus;
  count: number;
  value: Money;
}

/** Attributed by the deal's own owner, never the customer's relationship manager. */
export interface OwnerPerformanceRow {
  ownerId: string;
  ownerName: string;
  completed: number;
  open: number;
  value: Money;
}

export interface ShowroomPerformanceRow {
  locationId: string;
  locationName: string;
  completed: number;
  value: Money;
}

export interface MonthlyPoint {
  /** "Nov 2026", bucketed and labelled from the same Dubai month. */
  month: string;
  completed: number;
  value: Money;
}

/** Each section is null when its lookup failed, which is not the same as zero. */
export interface SalesReportData {
  kpis: SalesKpis | null;
  byStatus: StatusBreakdownRow[] | null;
  byOwner: OwnerPerformanceRow[] | null;
  byShowroom: ShowroomPerformanceRow[] | null;
  monthly: MonthlyPoint[] | null;
  range: ReportRange;
  /** "November 2026" — for headers and exports. */
  rangeLabel: string;
  from: string | null;
  /** Exclusive end of the window. */
  to: string;
}

/** One row of the deal export. */
export interface SalesExportRow {
  deal_number: string;
  status: string;
  customer_name: string;
  customer_number: string;
  vehicle_title: string;
  stock_id: string;
  brand_name: string | null;
  location_name: string | null;
  owner_name: string | null;
  lead_number: string | null;
  reservation_number: string | null;
  currency: string;
  listed_price: number | null;
  proposed_price: number | null;
  discount_amount: number | null;
  agreed_price: number | null;
  total_due: number | null;
  verified_paid: number | null;
  balance_due: number | null;
  created_at: string;
  updated_at: string;
}

export interface SalesExportResult {
  rows: SalesExportRow[];
  total: number;
  truncated: boolean;
}

/*
|--------------------------------------------------------------------------
| TABLE VIEW
|--------------------------------------------------------------------------
|
| The same figures as the summary view, one row per deal, so a number can be
| traced to the deals behind it. Carries the two fields the export does not
| need but a table does: the id, to link each row, and the completion date.
*/

export interface ReportDealRow extends SalesExportRow {
  id: string;
  /** Null until the deal completes. Sorting puts nulls last. */
  completed_at: string | null;
}

export interface ReportDealsResult {
  rows: ReportDealRow[];
  total: number;
  /** True when the period holds more deals than the table loaded. */
  truncated: boolean;
  failed: boolean;
}

export type ReportView = "summary" | "table";

export function parseReportView(value: string | undefined): ReportView {
  return value === "table" ? "table" : "summary";
}
