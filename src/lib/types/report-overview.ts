import type { ReportFigure } from "@/src/lib/supabase/report-aggregate";
import type { Money } from "@/src/lib/utils/report-money";

/*
|--------------------------------------------------------------------------
| THE OVERVIEW'S SHAPE AND ITS METRIC DEFINITIONS
|--------------------------------------------------------------------------
|
| Its own file, importing only types.
|
| These used to live alongside the query that produces them, which is the
| obvious place for them and the wrong one: report-overview-queries.ts
| imports the server Supabase client, which reaches next/headers, so the
| client component that renders these cards pulled a server module into the
| browser bundle. The build refuses it, and the error points at
| supabase/server rather than at the import that caused it.
|
| Sprint 8 hit exactly this with the offers export menu and fixed it the same
| way. A module holding only types and data cannot cause it, whoever imports
| it.
|
| The metric registry lives here too, not just the types, because the
| definitions are what the client renders in each card's tooltip. Keeping the
| definition beside the metric id means a card cannot be added without one.
*/

/** The date column a figure was filtered on, for the caption under it. */
export type DateBasis =
  | "created"
  | "completed"
  | "paid"
  | "drive finished"
  | "current";

export interface OverviewMetric {
  id: string;
  label: string
  /** What this counts, in one line. */
  definition: string;
  /** Which date put a record in this period. */
  basis: DateBasis;
  /** Hidden without reports.financial. */
  financial: boolean;
}

export const OVERVIEW_METRICS: readonly OverviewMetric[] = [
  {
    id: "dealsCompleted",
    label: "Deals completed",
    definition: "Sales deals that reached Completed, by the date they completed.",
    basis: "completed",
    financial: false,
  },
  {
    id: "completedValue",
    label: "Completed deal value",
    definition: "Total due across those deals. Not cash received.",
    basis: "completed",
    financial: true,
  },
  {
    id: "collected",
    label: "Verified collected",
    definition: "Verified payments in. Refunds are not deducted here.",
    basis: "paid",
    financial: true,
  },
  {
    id: "netCash",
    label: "Net cash movement",
    definition: "Verified payments in, less verified refunds out.",
    basis: "paid",
    financial: true,
  },
  {
    id: "outstanding",
    label: "Outstanding",
    definition: "Balance still owed on Confirmed deals, whenever they started.",
    basis: "current",
    financial: true,
  },
  {
    id: "newLeads",
    label: "New leads",
    definition: "Leads created in the period.",
    basis: "created",
    financial: false,
  },
  {
    id: "newCustomers",
    label: "New customers",
    definition: "Customer records created in the period.",
    basis: "created",
    financial: false,
  },
  {
    id: "testDrivesCompleted",
    label: "Test drives completed",
    definition: "Drives that actually finished in the period.",
    basis: "drive finished",
    financial: false,
  },
  {
    id: "reservationsCreated",
    label: "Reservations taken",
    definition: "Reservation requests raised in the period.",
    basis: "created",
    financial: false,
  },
];

export interface OverviewData {
  dealsCompleted: ReportFigure<number>;
  completedValue: ReportFigure<Money>;
  collected: ReportFigure<Money>;
  netCash: ReportFigure<Money>;
  outstanding: ReportFigure<Money>;
  newLeads: ReportFigure<number>;
  newCustomers: ReportFigure<number>;
  testDrivesCompleted: ReportFigure<number>;
  reservationsCreated: ReportFigure<number>;
  currency: string;
  rangeLabel: string;
}

