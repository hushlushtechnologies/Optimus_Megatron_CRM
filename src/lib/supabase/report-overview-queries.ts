import { createClient } from "@/src/lib/supabase/server";
import {
  figureFailed,
  figureFrom,
  figureOf,
  interpretCounted,
  type ReportFigure,
} from "@/src/lib/supabase/report-aggregate";
import { money, splitCashMovement, sumFils, type Money } from "@/src/lib/utils/report-money";
import { resolveReportRange, type ReportRangeId } from "@/src/lib/utils/report-time";
import type { ReportFilters } from "@/src/lib/utils/report-filters";
import {
  OVERVIEW_METRICS,
  type DateBasis,
  type OverviewData,
  type OverviewMetric,
} from "@/src/lib/types/report-overview";

/* Re-exported so existing server-side importers need no change. */
export { OVERVIEW_METRICS };
export type { DateBasis, OverviewData, OverviewMetric };

/*
|--------------------------------------------------------------------------
| THE OVERVIEW
|--------------------------------------------------------------------------
|
| Eight figures across five domains, each from the module's own authoritative
| records — no reporting tables, no duplicated business logic.
|
| TWO THINGS WORTH KNOWING ABOUT HOW THESE ARE COUNTED
|
| COUNTS ARE EXACT, ALWAYS. A count asks Postgres with `head: true`, so no
| rows cross the wire and no limit applies. "New leads: 12,400" is the real
| number however large the period. The 1,000-row page in the sales report
| exists because summing money needs the rows; counting does not, so it
| doesn't pay the same price. Only the money figures here can be capped, and
| they say when they are.
|
| EVERY METRIC NAMES ITS OWN DATE. A period means different things to
| different events, and the plan is explicit that a selected range must not be
| assumed to mean the same thing for created, completed and paid. So each
| figure carries the column it was filtered on, and the UI shows it. "Test
| drives completed" uses actual_end_at — when the drive actually finished —
| not when it was booked, because a drive booked in October and taken in
| November belongs to November.
|
| WHAT IS DELIBERATELY MISSING
|
| "Active inventory" is not here. Cars carry `status_id` into a
| `vehicle_statuses` lookup table rather than a status string, so which rows
| count as "active" is a question only your database can answer. Guessing
| would mean a card that looks authoritative and is not, which the plan
| forbids. It arrives in Batch 3 with the Inventory report, where the lookup
| is read properly.
*/

/** How many money rows one figure will pull before it reports itself partial. */
const MONEY_PAGE = 1000;

type CountResult = { count: number | null; error: { message?: string } | null };

/** An exact count, or a failure. Never a zero standing in for either. */
function countFigure(result: CountResult, label: string): ReportFigure<number> {
  if (result.error) {
    console.error(`overview count "${label}" failed:`, result.error);
    return figureFailed(result.error.message ?? "query failed");
  }

  /*
   * A null count with no error should not happen — head:true always returns
   * one — but if it does, that is not zero. Saying "0 new leads" when the
   * answer is unknown is the exact failure this reporting layer exists to
   * prevent.
   */
  if (typeof result.count !== "number") {
    return figureFailed("no count returned");
  }

  return figureOf(result.count, true, result.count);
}

/**
 * Every overview figure, in one pass.
 *
 * Filters are accepted and applied where they mean something. `location`
 * narrows deals and test drives; `staff` narrows deals by their own owner.
 * A filter a domain has no column for is ignored rather than approximated —
 * see the overview's short filter list in report-filters.ts for why it is
 * short.
 */
export async function getReportOverview(
  range: ReportRangeId,
  filters: ReportFilters,
  options: { customFrom?: string; customTo?: string } = {},
): Promise<OverviewData> {
  const supabase = await createClient();

  const resolved = resolveReportRange(range, {
    customFrom: options.customFrom,
    customTo: options.customTo,
  });

  const { fromIso, toIso, fromDate, toDate } = resolved;

  /* ---- counts: head:true, so these are exact at any size ---- */

  let completedCount = supabase
    .from("sales_deals")
    .select("id", { count: "exact", head: true })
    .eq("status", "Completed")
    .not("completed_at", "is", null)
    .lt("completed_at", toIso);

  if (fromIso) completedCount = completedCount.gte("completed_at", fromIso);

  let leadsCount = supabase
    .from("lead_list")
    .select("id", { count: "exact", head: true })
    .lt("created_at", toIso);

  if (fromIso) leadsCount = leadsCount.gte("created_at", fromIso);

  let customersCount = supabase
    .from("customer_profiles")
    .select("id", { count: "exact", head: true })
    .lt("created_at", toIso);

  if (fromIso) customersCount = customersCount.gte("created_at", fromIso);

  /*
   * Test drives are attributed by actual_end_at — when the drive finished —
   * not by when it was booked. A drive booked in October and taken in
   * November is a November drive.
   */
  let drivesCount = supabase
    .from("test_drive_list")
    .select("id", { count: "exact", head: true })
    .eq("status", "Completed")
    .not("actual_end_at", "is", null)
    .lt("actual_end_at", toIso);

  if (fromIso) drivesCount = drivesCount.gte("actual_end_at", fromIso);

  let reservationsCount = supabase
    .from("vehicle_reservation_list")
    .select("id", { count: "exact", head: true })
    .lt("created_at", toIso);

  if (fromIso) reservationsCount = reservationsCount.gte("created_at", fromIso);

  /* ---- money: needs the rows, so these can be partial ---- */

  let completedValueQuery = supabase
    .from("sales_deal_list")
    .select("total_due, currency", { count: "exact" })
    .eq("status", "Completed")
    .lt("completed_at", toIso)
    .limit(MONEY_PAGE);

  if (fromIso) completedValueQuery = completedValueQuery.gte("completed_at", fromIso);

  const outstandingQuery = supabase
    .from("sales_deal_list")
    .select("balance_due, currency", { count: "exact" })
    .eq("status", "Confirmed")
    .limit(MONEY_PAGE);

  /* paid_on is a date column, so it takes date bounds. */
  let paymentsQuery = supabase
    .from("sales_payment_list")
    .select("amount, direction", { count: "exact" })
    .eq("status", "Verified")
    .lte("paid_on", toDate)
    .limit(MONEY_PAGE * 2);

  if (fromDate) paymentsQuery = paymentsQuery.gte("paid_on", fromDate);

  /* ---- filters, where the domain has the column ---- */

  if (filters.location) {
    completedCount = completedCount.eq("location_id", filters.location);
    completedValueQuery = completedValueQuery.eq("location_id", filters.location);
    drivesCount = drivesCount.eq("location_id", filters.location);
  }

  if (filters.staff) {
    /* The deal's own owner, never the customer's relationship manager. */
    completedCount = completedCount.eq("owner_id", filters.staff);
    completedValueQuery = completedValueQuery.eq("owner_id", filters.staff);
  }

  const [
    completedRes,
    leadsRes,
    customersRes,
    drivesRes,
    reservationsRes,
    completedValueRes,
    outstandingRes,
    paymentsRes,
    settingsRes,
  ] = await Promise.all([
    completedCount,
    leadsCount,
    customersCount,
    drivesCount,
    reservationsCount,
    completedValueQuery,
    outstandingQuery,
    paymentsQuery,
    supabase.from("sales_settings").select("currency").maybeSingle(),
  ]);

  const currency = (settingsRes.data?.currency as string | undefined) ?? "AED";

  /* ---- money figures ---- */

  const valueCounted = interpretCounted<{ total_due: string | number | null }>(
    completedValueRes,
    MONEY_PAGE,
    "completed deal value",
  );

  const outstandingCounted = interpretCounted<{ balance_due: string | number | null }>(
    outstandingRes,
    MONEY_PAGE,
    "outstanding",
  );

  const paymentsCounted = interpretCounted<{
    amount: string | number | null;
    direction: string | null;
  }>(paymentsRes, MONEY_PAGE * 2, "verified payments");

  const movement = paymentsCounted.error
    ? null
    : splitCashMovement(paymentsCounted.rows, (row) => row, currency);

  return {
    dealsCompleted: countFigure(completedRes, "deals completed"),
    completedValue: figureFrom(valueCounted, (rows) =>
      money(sumFils(rows, (row) => row.total_due), currency),
    ),
    collected: movement
      ? figureFrom(paymentsCounted, () => movement.in)
      : figureFailed(paymentsCounted.error ?? "unavailable"),
    netCash: movement
      ? figureFrom(paymentsCounted, () => movement.net)
      : figureFailed(paymentsCounted.error ?? "unavailable"),
    outstanding: figureFrom(outstandingCounted, (rows) =>
      money(sumFils(rows, (row) => row.balance_due), currency),
    ),
    newLeads: countFigure(leadsRes, "new leads"),
    newCustomers: countFigure(customersRes, "new customers"),
    testDrivesCompleted: countFigure(drivesRes, "test drives completed"),
    reservationsCreated: countFigure(reservationsRes, "reservations created"),
    currency,
    rangeLabel: resolved.label,
  };
}
