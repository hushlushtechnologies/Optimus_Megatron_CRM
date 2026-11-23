import { createClient } from "@/src/lib/supabase/server";
import {
  AGGREGATE_PAGE,
  figureFailed,
  figureFrom,
  figureOf,
  interpretCounted,
  type ReportFigure,
} from "@/src/lib/supabase/report-aggregate";
import { averageFils, money, sumFils } from "@/src/lib/utils/report-money";
import { resolveReportRange, type ReportRangeId } from "@/src/lib/utils/report-time";
import type { ReportFilters } from "@/src/lib/utils/report-filters";
import { tallyBuyers } from "@/src/lib/utils/report-grouping";
import type {
  CustomerLeadReportData,
  LostReasonRow,
  NamedCount,
} from "@/src/lib/types/report-customers";

/*
|--------------------------------------------------------------------------
| CUSTOMER AND LEAD REPORTS
|--------------------------------------------------------------------------
|
| Two halves that count different things, kept in one report because people
| read them together and in one file because they share a period and a set of
| filters.
|
| THE COUNTING RULE, WHICH IS THE WHOLE POINT
|
| A customer figure counts PEOPLE — distinct customer ids. A lead figure
| counts OPPORTUNITIES — rows. The plan warns specifically against counting
| one customer three times because they have three leads, and the way that
| happens in practice is a report that joins customers to leads and then
| counts the joined rows.
|
| Nothing here joins the two. The customer half reads customer_profiles and
| sales_deals; the lead half reads lead_list. They meet only on the screen.
|
| WHERE DISTINCTNESS IS ACTUALLY ENFORCED
|
| "Buyers" and "repeat buyers" are the figures that could go wrong, because
| they start from deals — and one customer can have several. So the deal rows
| are reduced into a Map keyed by customer id before anything is counted.
| `buyers` is the size of that map; `repeatBuyers` is how many of its entries
| have two or more deals.
|
| That reduction needs the rows, so it is capped and reports its own
| completeness. A partial answer says so rather than understating how many
| customers buy twice.
*/

interface DealRow {
  customer_id: string | null;
  total_due: string | number | null;
}

interface LeadRow {
  id: string;
  stage_name: string | null;
  stage_type: string | null;
  source_name: string | null;
  staff_name: string | null;
  assigned_staff_id: string | null;
  temperature: string | null;
  lost_reason_name: string | null;
  customer_id: string | null;
}

interface CustomerRow {
  id: string;
  lifecycle_status: string | null;
  source: { name: string } | null;
  location: { name: string } | null;
}

/** Group rows by a name, biggest first. */
function tally(rows: { name: string | null }[]): NamedCount[] {
  const groups = new Map<string, number>();

  for (const row of rows) {
    /* An unset value is still a record. Dropping it would make the breakdown
       disagree with the headline count, which is how somebody loses an hour. */
    const name = row.name?.trim() || "Not set";
    groups.set(name, (groups.get(name) ?? 0) + 1);
  }

  return Array.from(groups.entries())
    .map(([name, count]) => ({ id: name, name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getCustomerLeadReport(
  range: ReportRangeId,
  filters: ReportFilters,
  options: { customFrom?: string; customTo?: string } = {},
): Promise<CustomerLeadReportData> {
  const supabase = await createClient();

  const resolved = resolveReportRange(range, {
    customFrom: options.customFrom,
    customTo: options.customTo,
  });

  const { fromIso, toIso } = resolved;

  const { data: settings } = await supabase.from("sales_settings").select("currency").maybeSingle();
  const currency = (settings?.currency as string | undefined) ?? "AED";

  /* =========================================================
     CUSTOMERS — people
  ========================================================= */

  const customerBase = () =>
    supabase
      .from("customer_profiles")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null);

  let totalCustomersQuery = customerBase();
  if (filters.location) totalCustomersQuery = totalCustomersQuery.eq("location_id", filters.location);
  if (filters.customerSource) totalCustomersQuery = totalCustomersQuery.eq("source_id", filters.customerSource);

  let newCustomersQuery = customerBase().lt("created_at", toIso);
  if (fromIso) newCustomersQuery = newCustomersQuery.gte("created_at", fromIso);
  if (filters.location) newCustomersQuery = newCustomersQuery.eq("location_id", filters.location);
  if (filters.customerSource) newCustomersQuery = newCustomersQuery.eq("source_id", filters.customerSource);

  let activeCustomersQuery = customerBase().eq("lifecycle_status", "Active");
  if (filters.location) activeCustomersQuery = activeCustomersQuery.eq("location_id", filters.location);

  /* Rows for the customer breakdowns. */
  let customerRowsQuery = supabase
    .from("customer_profiles")
    .select("id, lifecycle_status, source:customer_sources(name), location:locations(name)", {
      count: "exact",
    })
    .is("archived_at", null)
    .limit(AGGREGATE_PAGE);

  if (filters.location) customerRowsQuery = customerRowsQuery.eq("location_id", filters.location);
  if (filters.customerSource) customerRowsQuery = customerRowsQuery.eq("source_id", filters.customerSource);

  /*
   * Completed deals, for buyers and repeat buyers.
   *
   * All time, not period-bound: "a repeat buyer" is somebody who has bought
   * twice, not somebody who bought twice this month. Narrowing it to the
   * period would report almost nobody as a repeat buyer in any given month
   * and look broken.
   */
  const dealsQuery = supabase
    .from("sales_deal_list")
    .select("customer_id, total_due", { count: "exact" })
    .eq("status", "Completed")
    .not("customer_id", "is", null)
    .limit(AGGREGATE_PAGE * 2);

  /* =========================================================
     LEADS — opportunities
  ========================================================= */

  const leadBase = () =>
    supabase.from("lead_list").select("id", { count: "exact", head: true }).is("archived_at", null);

  let totalLeadsQuery = leadBase();
  if (filters.staff) totalLeadsQuery = totalLeadsQuery.eq("assigned_staff_id", filters.staff);

  let newLeadsQuery = leadBase().lt("created_at", toIso);
  if (fromIso) newLeadsQuery = newLeadsQuery.gte("created_at", fromIso);
  if (filters.staff) newLeadsQuery = newLeadsQuery.eq("assigned_staff_id", filters.staff);

  /*
   * Lead rows for the breakdowns AND for the cohort win rate.
   *
   * Scoped to leads CREATED in the period, so the win rate asks one question
   * of one population — the same correction made to the sales report's win
   * rate in Batch 1, for the same reason.
   */
  let leadRowsQuery = supabase
    .from("lead_list")
    .select(
      "id, stage_name, stage_type, source_name, staff_name, assigned_staff_id, temperature, lost_reason_name, customer_id",
      { count: "exact" },
    )
    .is("archived_at", null)
    .lt("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(AGGREGATE_PAGE);

  if (fromIso) leadRowsQuery = leadRowsQuery.gte("created_at", fromIso);
  if (filters.staff) leadRowsQuery = leadRowsQuery.eq("assigned_staff_id", filters.staff);
  if (filters.leadSource) leadRowsQuery = leadRowsQuery.eq("source_name", filters.leadSource);

  /*
   * Follow-ups scheduled to fall in the period, and how many were completed.
   *
   * Attributed by scheduled_at — when it was due — not by when it was
   * created or closed. "Follow-ups completed" is a question about whether
   * the team kept up with the work the period asked of them.
   */
  let followUpsDueQuery = supabase
    .from("lead_follow_ups")
    .select("id", { count: "exact", head: true })
    .lt("scheduled_at", toIso);

  if (fromIso) followUpsDueQuery = followUpsDueQuery.gte("scheduled_at", fromIso);

  let followUpsDoneQuery = supabase
    .from("lead_follow_ups")
    .select("id", { count: "exact", head: true })
    .eq("status", "Completed")
    .lt("scheduled_at", toIso);

  if (fromIso) followUpsDoneQuery = followUpsDoneQuery.gte("scheduled_at", fromIso);

  /* =========================================================
     RUN
  ========================================================= */

  const [
    totalCustomersRes,
    newCustomersRes,
    activeCustomersRes,
    customerRowsRes,
    dealsRes,
    totalLeadsRes,
    newLeadsRes,
    leadRowsRes,
    followUpsDueRes,
    followUpsDoneRes,
  ] = await Promise.all([
    totalCustomersQuery,
    newCustomersQuery,
    activeCustomersQuery,
    customerRowsQuery,
    dealsQuery,
    totalLeadsQuery,
    newLeadsQuery,
    leadRowsQuery,
    followUpsDueQuery,
    followUpsDoneQuery,
  ]);

  const countOf = (
    result: { count: number | null; error: { message?: string } | null },
    label: string,
  ): ReportFigure<number> => {
    if (result.error) {
      console.error(`customer/lead count "${label}" failed:`, result.error);
      return figureFailed(result.error.message ?? "query failed");
    }
    if (typeof result.count !== "number") return figureFailed("no count returned");
    return figureOf(result.count, true, result.count);
  };

  /* ---- customer breakdowns ---- */

  const customerRows = interpretCounted<CustomerRow>(
    customerRowsRes,
    AGGREGATE_PAGE,
    "customer rows",
  );

  /* ---- buyers and repeat buyers, counted distinctly ---- */

  const deals = interpretCounted<DealRow>(dealsRes, AGGREGATE_PAGE * 2, "completed deals");

  /*
   * The reduction that makes these counts people rather than deals. Keyed by
   * customer id, so three deals for one customer produce one entry.
   */
  /* buyerTally, not tally: there is already a local tally() for the
     breakdowns, and shadowing it makes every later call a type error. */
  const buyerTally = tallyBuyers(deals.rows);

  const buyerCount = buyerTally.buyers;
  const repeatCount = buyerTally.repeatBuyers;

  /* Value is summed over the deal rows, not the customer map: the average is
     total deal value per BUYER, so the numerator counts every deal and the
     denominator counts people. */
  const totalBuyerFils = sumFils(
    deals.rows.filter((row) => row.customer_id !== null),
    (row) => row.total_due,
  );

  const averagePerBuyer = averageFils(totalBuyerFils, buyerCount);

  /* ---- lead breakdowns ---- */

  const leads = interpretCounted<LeadRow>(leadRowsRes, AGGREGATE_PAGE, "lead rows");

  const wonInCohort = leads.rows.filter((row) => row.stage_type === "won").length;
  const lostInCohort = leads.rows.filter((row) => row.stage_type === "lost").length;

  const lostRows = leads.rows.filter((row) => row.stage_type === "lost");

  const lostReasons: LostReasonRow[] = tally(
    lostRows.map((row) => ({ name: row.lost_reason_name })),
  ).map((row) => ({
    ...row,
    share: lostRows.length === 0 ? 0 : Math.round((row.count / lostRows.length) * 100),
  }));

  const dueCount = followUpsDueRes.count ?? 0;
  const doneCount = followUpsDoneRes.count ?? 0;

  return {
    totalCustomers: countOf(totalCustomersRes, "total customers"),
    newCustomers: countOf(newCustomersRes, "new customers"),
    activeCustomers: countOf(activeCustomersRes, "active customers"),

    buyers: figureFrom(deals, () => buyerCount),
    repeatBuyers: figureFrom(deals, () => repeatCount),
    averageCustomerValue: figureFrom(deals, () =>
      averagePerBuyer === null ? null : money(averagePerBuyer, currency),
    ),

    customersBySource: figureFrom(customerRows, (rows) =>
      tally(rows.map((row) => ({ name: row.source?.name ?? null }))),
    ),
    customersByLocation: figureFrom(customerRows, (rows) =>
      tally(rows.map((row) => ({ name: row.location?.name ?? null }))),
    ),
    customersByLifecycle: figureFrom(customerRows, (rows) =>
      tally(rows.map((row) => ({ name: row.lifecycle_status }))),
    ),

    totalLeads: countOf(totalLeadsRes, "total leads"),
    newLeads: countOf(newLeadsRes, "new leads"),
    wonLeads: figureFrom(leads, () => wonInCohort),
    lostLeads: figureFrom(leads, () => lostInCohort),

    leadWinRate: figureFrom(leads, (rows) =>
      rows.length === 0 ? null : Math.round((wonInCohort / rows.length) * 100),
    ),

    leadsByStage: figureFrom(leads, (rows) => tally(rows.map((row) => ({ name: row.stage_name })))),
    leadsBySource: figureFrom(leads, (rows) => tally(rows.map((row) => ({ name: row.source_name })))),
    leadsByStaff: figureFrom(leads, (rows) => tally(rows.map((row) => ({ name: row.staff_name })))),
    leadsByTemperature: figureFrom(leads, (rows) =>
      tally(rows.map((row) => ({ name: row.temperature }))),
    ),
    lostReasons: figureFrom(leads, () => lostReasons),

    followUpsDue: countOf(followUpsDueRes, "follow-ups due"),
    followUpCompletion:
      followUpsDueRes.error || followUpsDoneRes.error
        ? figureFailed("follow-up counts unavailable")
        : figureOf(dueCount === 0 ? null : Math.round((doneCount / dueCount) * 100)),

    currency,
    rangeLabel: resolved.label,
  };
}
