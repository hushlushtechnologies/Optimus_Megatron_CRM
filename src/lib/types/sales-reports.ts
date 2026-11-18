import type { SalesDealStatus } from "@/src/lib/types/sales";

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
| Money is read as a number at the edge and only ever summed, never
| multiplied or divided into money, so no rounding is introduced.
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
  /** Deals created in the period. */
  created: number;
  /** Deals completed in the period. */
  completed: number;
  cancelled: number;
  /** Still open at the end of the period. */
  open: number;
  /** Total due across deals completed in the period. */
  completedValue: number;
  /** Verified payments in, less refunds out, in the period. */
  collected: number;
  /** Balance still outstanding on confirmed, not yet completed deals. */
  outstanding: number;
  /** Completed divided by created, as a whole percentage. Null when nothing was created. */
  winRate: number | null;
  /** Average value of a completed deal. Null when none completed. */
  averageDealValue: number | null;
  currency: string;
}

export interface StatusBreakdownRow {
  status: SalesDealStatus;
  count: number;
  value: number;
}

export interface OwnerPerformanceRow {
  ownerId: string;
  ownerName: string;
  completed: number;
  open: number;
  value: number;
}

export interface ShowroomPerformanceRow {
  locationId: string;
  locationName: string;
  completed: number;
  value: number;
}

export interface MonthlyPoint {
  month: string;
  completed: number;
  value: number;
}

/** Each section is null when its lookup failed, which is not the same as zero. */
export interface SalesReportData {
  kpis: SalesKpis | null;
  byStatus: StatusBreakdownRow[] | null;
  byOwner: OwnerPerformanceRow[] | null;
  byShowroom: ShowroomPerformanceRow[] | null;
  monthly: MonthlyPoint[] | null;
  range: ReportRange;
  from: string | null;
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
