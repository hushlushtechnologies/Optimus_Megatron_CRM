import type { ReportFigure } from "@/src/lib/supabase/report-aggregate";
import type { Money } from "@/src/lib/utils/report-money";

/*
|--------------------------------------------------------------------------
| THE INVENTORY REPORT'S SHAPE AND DEFINITIONS
|--------------------------------------------------------------------------
|
| Types and data only, no imports that reach the server — the client
| component renders these definitions, and a module that imports
| supabase/server would drag next/headers into the browser bundle. This bug
| has landed twice already; checks/check-client-server-boundary.py now
| catches it.
|
| TWO THINGS THIS REPORT DELIBERATELY DOES NOT SHOW
|
| GROSS PROFIT AND MARGIN. There is no acquisition cost anywhere in this
| schema — no cost_price, no purchase_price, no date_received. The sprint
| plan says not to fabricate them, so there is no "profit" figure here and
| no "margin" column. Everything below is a count or a LISTED price, which
| is what a car is advertised at and not what it earned.
|
| AN ACCURATE AGEING DATE. Ageing should run from the day a vehicle entered
| stock. That column does not exist either, so it runs from `created_at` —
| the day the record was made — and every ageing figure says so on screen.
| They are usually close and they are not the same thing: a car entered into
| the system a week after it arrived reads as a week younger than it is.
*/

/** A stock bucket, keyed by the availability status slug in the database. */
export interface StatusCount {
  /** The slug from vehicle_statuses: available, reserved, sold, coming-soon. */
  slug: string;
  label: string;
  count: number;
}

export interface InventoryBreakdownRow {
  id: string;
  name: string;
  count: number;
  /** Listed value of the vehicles in this row. Hidden without reports.financial. */
  value: Money;
}

/** How long vehicles have been in stock, in buckets. */
export interface AgeingBucket {
  id: string;
  label: string;
  count: number;
  value: Money;
}

export interface InventoryReportData {
  /** Every non-archived vehicle. */
  total: ReportFigure<number>;
  /** Counts per availability status, from the database's own lookup. */
  byStatus: ReportFigure<StatusCount[]>;
  /** Vehicles not yet published. */
  draft: ReportFigure<number>;

  /** Listed value of everything currently available. Not cash, not profit. */
  availableValue: ReportFigure<Money>;

  byBrand: ReportFigure<InventoryBreakdownRow[]>;
  byCollection: ReportFigure<InventoryBreakdownRow[]>;
  byLocation: ReportFigure<InventoryBreakdownRow[]>;

  /** Ageing of vehicles that are still available. */
  ageing: ReportFigure<AgeingBucket[]>;
  /** Available vehicles older than the slow-moving threshold. */
  slowMoving: ReportFigure<number>;
  /** Vehicles added during the selected period. */
  addedInPeriod: ReportFigure<number>;

  currency: string;
  rangeLabel: string;
}

/** Days in stock at which a vehicle is called slow-moving. */
export const SLOW_MOVING_DAYS = 90;

export interface InventoryMetricDefinition {
  id: string;
  label: string;
  definition: string;
  /** Which date put a record in this period, or what "now" means. */
  basis: string;
  financial: boolean;
}

export const INVENTORY_METRICS: readonly InventoryMetricDefinition[] = [
  {
    id: "total",
    label: "Vehicles in stock",
    definition: "Every vehicle on the books that has not been archived, whatever its status.",
    basis: "current",
    financial: false,
  },
  {
    id: "available",
    label: "Available",
    definition: "Vehicles marked available. Reserved and sold cars are counted separately, never here.",
    basis: "current",
    financial: false,
  },
  {
    id: "reserved",
    label: "Reserved",
    definition: "Vehicles held against a reservation.",
    basis: "current",
    financial: false,
  },
  {
    id: "sold",
    label: "Sold",
    definition: "Vehicles marked sold. Still on the books, not in available stock.",
    basis: "current",
    financial: false,
  },
  {
    id: "availableValue",
    label: "Listed value, available",
    definition:
      "Total advertised price of available vehicles. This is what they are listed at — not cash collected, and not profit.",
    basis: "current",
    financial: true,
  },
  {
    id: "addedInPeriod",
    label: "Added in period",
    definition: "Vehicle records created during the selected period.",
    basis: "record created",
    financial: false,
  },
  {
    id: "slowMoving",
    label: `Slow moving (${SLOW_MOVING_DAYS}+ days)`,
    definition: `Available vehicles whose record was created more than ${SLOW_MOVING_DAYS} days ago.`,
    basis: "record created",
    financial: false,
  },
];

export const AGEING_BUCKETS: readonly { id: string; label: string; minDays: number; maxDays: number | null }[] = [
  { id: "0-30", label: "Under 30 days", minDays: 0, maxDays: 30 },
  { id: "31-60", label: "31 to 60 days", minDays: 31, maxDays: 60 },
  { id: "61-90", label: "61 to 90 days", minDays: 61, maxDays: 90 },
  { id: "90+", label: "Over 90 days", minDays: 91, maxDays: null },
];

/** Said on screen wherever an ageing figure appears. */
export const AGEING_BASIS_NOTE =
  "Ageing runs from the date each vehicle record was created. This schema has no date-received column, so a vehicle entered some days after it arrived will read as newer than it is.";

/** Said once on the report, so nobody looks for a profit column. */
export const NO_COST_DATA_NOTE =
  "Values here are listed prices. This system holds no vehicle acquisition cost, so gross profit and margin cannot be reported.";
