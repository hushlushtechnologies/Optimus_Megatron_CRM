import { createClient } from "@/src/lib/supabase/server";
import { SALES_DEAL_STATUSES, type SalesDealStatus } from "@/src/lib/types/sales";
import {
  AGGREGATE_PAGE,
  completenessMessage,
  completenessOf,
  figureFrom,
  interpretCounted,
  type ReportFigure,
} from "@/src/lib/supabase/report-aggregate";
import { averageFils, money, splitCashMovement, sumFils } from "@/src/lib/utils/report-money";
import {
  dubaiMonthKey,
  formatMonthKey,
  resolveReportRange,
  type ReportRangeId,
} from "@/src/lib/utils/report-time";
import type {
  MonthlyPoint,
  OwnerPerformanceRow,
  ReportDealRow,
  ReportDealsResult,
  ReportRange,
  SalesExportResult,
  SalesExportRow,
  SalesKpis,
  SalesReportData,
  ShowroomPerformanceRow,
  StatusBreakdownRow,
} from "@/src/lib/types/sales-reports";

/*
|--------------------------------------------------------------------------
| SALES REPORT READS
|--------------------------------------------------------------------------
|
| All of this reads sales_deal_list and sales_payment_list — the same views
| the Sales and Payments pages use — so the reports cannot drift from the
| screens they summarise, and row-level security decides what each person
| sees. No new database objects are needed.
|
| SPRINT 9 CORRECTIONS
|
| The Phase 1 audit found seven defects here. Each is fixed below and marked
| in place, because the wrong version of each is a reasonable-looking thing to
| write again.
|
|   1. Win rate divided deals completed in the window by deals created in the
|      window — two different populations — so it exceeded 100% whenever the
|      sales cycle was longer than the window. Replaced with a cohort rate.
|   2. Every aggregate was capped at 5000 with no count, so a large period
|      reported a partial total as a final one. Now counted.
|   3. The payments query's error was not checked, so a failed lookup rendered
|      as "Collected: AED 0".
|   4. Ranges were built in the server's timezone (UTC), putting the first
|      four hours of each Dubai month in the previous month.
|   5. paid_on is a date column and was filtered with an ISO timestamp.
|   6. "Collected" was actually net of refunds.
|   7. Monthly buckets were keyed in server time and labelled in Dubai time,
|      so a bucket could be keyed October and labelled "Nov 26".
|
| Money is accumulated in bigint fils throughout — see report-money.ts for
| why the previous float summing had to go.
*/

const EXPORT_LIMIT = 5000;

/*
 * The table view holds its rows in memory so sorting is instant. 500 is
 * generous for a reporting table and stays well inside a single query; when
 * the period holds more, the table says so and points at the export, which
 * goes to 5000.
 */
const TABLE_LIMIT = 500;

type Numeric = number | string | null;
const nullableNum = (value: Numeric): number | null =>
  value === null || value === undefined ? null : Number(value);

/* =========================================================
   RANGES
========================================================= */

/**
 * The window a range covers, in Dubai business time.
 *
 * DEFECT 4. This used to build boundaries with `new Date(y, m, 1)`, which is
 * midnight in the process's own timezone — UTC in production. Dubai is
 * UTC+04:00, so "this month" began at 04:00 on the first, and every deal
 * completed in those four hours was reported in the previous month.
 *
 * Now delegates to report-time.ts, which is the single place that decides
 * what a period means for reports, filters and exports alike.
 *
 * `to` is now **exclusive**. The old version ended last month one millisecond
 * before midnight, which left a one-millisecond hole between adjacent periods
 * and relied on millisecond precision surviving Postgres. Callers use `.lt()`.
 */
export function resolveRange(range: ReportRange): {
  from: Date | null;
  /** Exclusive. Filter with `.lt()`, not `.lte()`. */
  to: Date;
  /** For date columns such as `paid_on`. Inclusive both ends. */
  fromDate: string | null;
  toDate: string;
} {
  const resolved = resolveReportRange(range as ReportRangeId);

  return {
    from: resolved.fromIso ? new Date(resolved.fromIso) : null,
    to: new Date(resolved.toIso),
    fromDate: resolved.fromDate,
    toDate: resolved.toDate,
  };
}

export function parseReportRange(value: string | undefined): ReportRange {
  const allowed: ReportRange[] = ["this-month", "last-month", "last-90", "year", "all"];
  return allowed.includes(value as ReportRange) ? (value as ReportRange) : "this-month";
}

/* =========================================================
   SHARED ROW SHAPE
========================================================= */

const AGGREGATE_COLUMNS = [
  "id",
  "status",
  "owner_id",
  "owner_name",
  "location_id",
  "location_name",
  "currency",
  "total_due",
  "balance_due",
  "created_at",
].join(", ");

interface AggregateRow {
  id: string;
  status: SalesDealStatus;
  owner_id: string | null;
  owner_name: string | null;
  location_id: string | null;
  location_name: string | null;
  currency: string | null;
  total_due: Numeric;
  balance_due: Numeric;
  created_at: string;
}

/* =========================================================
   REPORT
========================================================= */

/**
 * Every figure the reports page shows, in one pass.
 *
 * Deals are attributed to the period by **completion** where the figure is
 * about money earned, and by **creation** where it is about work started.
 * That distinction is the one thing to keep in mind when reading the numbers:
 * a deal created in March and completed in May counts as created in March and
 * completed in May, never both in one month.
 */
export async function getSalesReport(range: ReportRange): Promise<SalesReportData> {
  const supabase = await createClient();
  const { from, to, fromDate, toDate } = resolveRange(range);
  const resolved = resolveReportRange(range as ReportRangeId);

  const emptyResult: SalesReportData = {
    kpis: null,
    byStatus: null,
    byOwner: null,
    byShowroom: null,
    monthly: null,
    range,
    rangeLabel: resolved.label,
    from: from?.toISOString() ?? null,
    to: to.toISOString(),
  };

  /*
   * DEFECT 2. Every query below asks for `count: "exact"` and is read through
   * interpretCounted, so a figure computed from a capped result knows it was
   * capped. The old code capped at 5000 and asked for no count, which made a
   * partial total indistinguishable from a complete one.
   *
   * The page is also smaller now — 1000 rather than 5000 — because the point
   * is no longer to squeeze the whole period into one query. Past this many
   * rows the figures say they are partial and the person narrows the period;
   * a database-side aggregate replaces this when Phase 4 adds the breakdowns
   * that need it.
   */

  /* ---- Deals completed inside the window ---- */

  let completedQuery = supabase
    .from("sales_deals")
    .select("id, completed_at", { count: "exact" })
    .eq("status", "Completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(AGGREGATE_PAGE);

  if (from) completedQuery = completedQuery.gte("completed_at", from.toISOString());
  /* Exclusive end — see resolveRange. */
  completedQuery = completedQuery.lt("completed_at", to.toISOString());

  /* ---- Deals created inside the window ---- */

  let createdQuery = supabase
    .from("sales_deal_list")
    .select(AGGREGATE_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(AGGREGATE_PAGE);

  if (from) createdQuery = createdQuery.gte("created_at", from.toISOString());
  createdQuery = createdQuery.lt("created_at", to.toISOString());

  /* ---- Everything still open, whenever it was created ---- */

  const openQuery = supabase
    .from("sales_deal_list")
    .select(AGGREGATE_COLUMNS, { count: "exact" })
    .in("status", ["Draft", "Negotiation", "Reserved", "Confirmed"])
    .limit(AGGREGATE_PAGE);

  /* ---- Verified money movement inside the window ---- */

  /*
   * DEFECT 5. `paid_on` is a calendar date, written from getDubaiToday().
   * Filtering it with a full ISO timestamp made Postgres coerce one side to
   * the other, and which way it went depended on the session timezone — a
   * boundary error on the most important figure in the module. Date columns
   * get date bounds, inclusive at both ends.
   */
  let paymentsQuery = supabase
    .from("sales_payment_list")
    .select("amount, direction, paid_on", { count: "exact" })
    .eq("status", "Verified")
    .limit(AGGREGATE_PAGE * 2);

  if (fromDate) paymentsQuery = paymentsQuery.gte("paid_on", fromDate);
  paymentsQuery = paymentsQuery.lte("paid_on", toDate);

  const [completedResult, createdResult, openResult, paymentsResult, settingsResult] = await Promise.all([
    completedQuery,
    createdQuery,
    openQuery,
    paymentsQuery,
    supabase.from("sales_settings").select("currency").maybeSingle(),
  ]);

  const completedCounted = interpretCounted<{ id: string; completed_at: string }>(
    completedResult,
    AGGREGATE_PAGE,
    "deals completed",
  );
  const createdCounted = interpretCounted<AggregateRow>(createdResult, AGGREGATE_PAGE, "deals created");
  const openCounted = interpretCounted<AggregateRow>(openResult, AGGREGATE_PAGE, "deals open");

  /*
   * DEFECT 3. paymentsResult was left out of the old error check, so a failed
   * payments lookup left `data` null, reduced to 0, and displayed
   * "Collected: AED 0" beside three correct deal counts. It is now a counted
   * result like the others, and its failure reaches the page as null.
   */
  const paymentsCounted = interpretCounted<{ amount: Numeric; direction: string }>(
    paymentsResult,
    AGGREGATE_PAGE * 2,
    "verified payments",
  );

  /* The three deal queries are the spine of the report; without them there is
     no report. Payments failing degrades the money cards only. */
  if (completedCounted.error || createdCounted.error || openCounted.error) {
    return emptyResult;
  }

  const completedIds = new Map(completedCounted.rows.map((row) => [row.id, row.completed_at]));
  const createdRows = createdCounted.rows;
  const openRows = openCounted.rows;

  /* ---- Completed deals need their value, which lives on the view ---- */

  const completedRows: AggregateRow[] = [];
  let completedValuesFailed: string | null = null;

  if (completedIds.size > 0) {
    const ids = Array.from(completedIds.keys());
    const { data, error } = await supabase.from("sales_deal_list").select(AGGREGATE_COLUMNS).in("id", ids);

    if (error) {
      console.error("getSalesReport completed values error:", error);
      completedValuesFailed = error.message;
    } else {
      completedRows.push(...((data ?? []) as unknown as AggregateRow[]));
    }
  }

  const currency =
    (settingsResult.data?.currency as string | undefined) ??
    completedRows[0]?.currency ??
    createdRows[0]?.currency ??
    "AED";

  /* ---- Money, in exact fils ---- */

  const completedValueFils = sumFils(completedRows, (row) => row.total_due);

  /*
   * DEFECT 6. The old figure netted refunds into one number and called it
   * "Collected". The sprint plan lists "Verified Payments Collected" and
   * "Net Verified Cash Movement" as separate metrics and forbids combining
   * concepts into an ambiguous total — a month that took AED 2m and refunded
   * AED 2m reported "Collected: 0", which is true of the net and false of the
   * collection. All three figures are returned and each is labelled.
   */
  const movement = splitCashMovement(paymentsCounted.rows, (row) => row, currency);

  /*
   * Outstanding counts Confirmed deals only — money owed on deals that are
   * committed. Reserved and Negotiation deals are not firm sales yet. That is
   * the business definition you confirmed; the card now says so rather than
   * leaving the reader to guess.
   */
  const outstandingFils = sumFils(
    openRows.filter((row) => row.status === "Confirmed"),
    (row) => row.balance_due,
  );

  const cancelledInRange = createdRows.filter((row) => row.status === "Cancelled").length;

  /*
   * DEFECT 1. THE WIN RATE.
   *
   * It used to be `completed in window / created in window`. Those are two
   * different sets of deals: with any sales cycle longer than the window,
   * deals complete in a month they were not created in. On an ordinary month
   * for a two-month cycle the old formula returns 150% — a rate cannot exceed
   * 100%, and the figure was on a card labelled "Win rate".
   *
   * The replacement is a cohort rate: of the deals CREATED in this period,
   * what share have completed? Same denominator, same population, always
   * 0–100%. It answers a real question — "how are this month's opportunities
   * doing?" — and it moves as those deals close, which is the point of it.
   *
   * The two raw counts are still reported separately and unchanged, so
   * nothing is lost: "9 completed this month" and "33% of this month's deals
   * have closed" are both true and now both visible.
   */
  const cohortCompleted = createdRows.filter((row) => row.status === "Completed").length;

  const cohortWinRate =
    createdRows.length === 0 ? null : Math.round((cohortCompleted / createdRows.length) * 100);

  const averageFilsValue = averageFils(completedValueFils, completedRows.length);

  const figures: Record<string, ReportFigure<unknown>> = {
    created: figureFrom(createdCounted, (rows) => rows.length),
    completed: figureFrom(completedCounted, (rows) => rows.length),
    open: figureFrom(openCounted, (rows) => rows.length),
    collected: figureFrom(paymentsCounted, () => movement.in),
  };

  if (completedValuesFailed) {
    figures.completedValue = { value: null, complete: false, total: null, error: completedValuesFailed };
  }

  const completeness = completenessOf(figures);

  const kpis: SalesKpis = {
    created: createdRows.length,
    completed: completedRows.length,
    cancelled: cancelledInRange,
    open: openRows.length,
    completedValue: completedValuesFailed ? null : money(completedValueFils, currency),
    /** Verified money in. Not net of refunds. */
    collected: paymentsCounted.error ? null : movement.in,
    refunded: paymentsCounted.error ? null : movement.out,
    netCash: paymentsCounted.error ? null : movement.net,
    outstanding: money(outstandingFils, currency),
    cohortWinRate,
    cohortCompleted,
    averageDealValue: averageFilsValue === null ? null : money(averageFilsValue, currency),
    currency,
    completeness,
    notice: completenessMessage(completeness, AGGREGATE_PAGE),
  };

  /* ---- By status: everything created in the window ---- */

  const statusCounts = new Map<SalesDealStatus, { count: number; fils: bigint }>();
  createdRows.forEach((row) => {
    const current = statusCounts.get(row.status) ?? { count: 0, fils: 0n };
    current.count += 1;
    current.fils += sumFils([row], (r) => r.total_due);
    statusCounts.set(row.status, current);
  });

  const byStatus: StatusBreakdownRow[] = SALES_DEAL_STATUSES.map((status) => ({
    status,
    count: statusCounts.get(status)?.count ?? 0,
    value: money(statusCounts.get(status)?.fils ?? 0n, currency),
  })).filter((row) => row.count > 0);

  /* ---- By owner: completed in the window, plus what they hold open now ---- */

  /*
   * Attribution is the deal's own owner_id, never the customer's relationship
   * manager. The sprint plan is explicit about this — one customer can buy
   * several cars with a different salesperson on each — and sales_deal_list
   * already carries the per-deal owner, so the right behaviour is also the
   * simpler one.
   */
  interface OwnerAccumulator {
    ownerId: string;
    ownerName: string;
    completed: number;
    open: number;
    fils: bigint;
  }

  const owners = new Map<string, OwnerAccumulator>();

  const ensureOwner = (id: string, name: string | null): OwnerAccumulator => {
    const existing = owners.get(id);
    if (existing) return existing;

    const created: OwnerAccumulator = {
      ownerId: id,
      ownerName: name?.trim() || "Unnamed staff",
      completed: 0,
      open: 0,
      fils: 0n,
    };
    owners.set(id, created);
    return created;
  };

  completedRows.forEach((row) => {
    if (!row.owner_id) return;
    const owner = ensureOwner(row.owner_id, row.owner_name);
    owner.completed += 1;
    owner.fils += sumFils([row], (r) => r.total_due);
  });

  openRows.forEach((row) => {
    if (!row.owner_id) return;
    ensureOwner(row.owner_id, row.owner_name).open += 1;
  });

  const byOwner: OwnerPerformanceRow[] = Array.from(owners.values())
    .sort((a, b) => (b.fils === a.fils ? b.completed - a.completed : b.fils > a.fils ? 1 : -1))
    .map((owner) => ({
      ownerId: owner.ownerId,
      ownerName: owner.ownerName,
      completed: owner.completed,
      open: owner.open,
      value: money(owner.fils, currency),
    }));

  /* ---- By showroom: completed in the window ---- */

  const showrooms = new Map<
    string,
    { locationId: string; locationName: string; completed: number; fils: bigint }
  >();

  completedRows.forEach((row) => {
    if (!row.location_id) return;

    const current = showrooms.get(row.location_id) ?? {
      locationId: row.location_id,
      locationName: row.location_name ?? "Unassigned",
      completed: 0,
      fils: 0n,
    };

    current.completed += 1;
    current.fils += sumFils([row], (r) => r.total_due);
    showrooms.set(row.location_id, current);
  });

  const byShowroom: ShowroomPerformanceRow[] = Array.from(showrooms.values())
    .sort((a, b) => (b.fils === a.fils ? 0 : b.fils > a.fils ? 1 : -1))
    .map((room) => ({
      locationId: room.locationId,
      locationName: room.locationName,
      completed: room.completed,
      value: money(room.fils, currency),
    }));

  /* ---- Monthly: completions by the month they completed in ---- */

  /*
   * DEFECT 7. The key used to be built from `date.getFullYear()` and
   * `date.getMonth()` — the server's timezone — while the label was formatted
   * with `timeZone: "Asia/Dubai"`. So a deal completed at 01:00 Dubai on 1
   * November was keyed "2026-10" and labelled "Nov 26": two deals in the same
   * Dubai month could land in different buckets, and a bucket could sort as
   * October while claiming to be November.
   *
   * dubaiMonthKey does both from the same Dubai parts, so the key and the
   * label cannot disagree.
   */
  const monthBuckets = new Map<string, { completed: number; fils: bigint }>();

  completedRows.forEach((row) => {
    const completedAt = completedIds.get(row.id);
    if (!completedAt) return;

    const key = dubaiMonthKey(completedAt);
    if (!key) return;

    const current = monthBuckets.get(key) ?? { completed: 0, fils: 0n };
    current.completed += 1;
    current.fils += sumFils([row], (r) => r.total_due);
    monthBuckets.set(key, current);
  });

  const monthly: MonthlyPoint[] = Array.from(monthBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, point]) => ({
      month: formatMonthKey(key),
      completed: point.completed,
      value: money(point.fils, currency),
    }));

  return {
    kpis,
    byStatus,
    byOwner,
    byShowroom,
    monthly,
    range,
    rangeLabel: resolved.label,
    from: from?.toISOString() ?? null,
    to: to.toISOString(),
  };
}

/* =========================================================
   EXPORT
========================================================= */

const EXPORT_COLUMNS = [
  "deal_number",
  "status",
  "customer_name",
  "customer_number",
  "vehicle_title",
  "stock_id",
  "brand_name",
  "location_name",
  "owner_name",
  "lead_number",
  "reservation_number",
  "currency",
  "listed_price",
  "proposed_price",
  "discount_amount",
  "agreed_price",
  "total_due",
  "verified_paid",
  "balance_due",
  "created_at",
  "updated_at",
].join(", ");

/**
 * Deal rows for the Excel and PDF exports, newest first.
 *
 * Capped at EXPORT_LIMIT. When the cap bites, `truncated` says so, and the
 * route passes that to the browser so the person is told rather than handed a
 * silently short file.
 */
export async function getSalesExportRows(range: ReportRange): Promise<SalesExportResult> {
  const supabase = await createClient();
  const { from, to } = resolveRange(range);

  let query = supabase
    .from("sales_deal_list")
    .select(EXPORT_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(EXPORT_LIMIT);

  if (from) query = query.gte("created_at", from.toISOString());
  /* Exclusive end: resolveRange returns the start of the next period. */
  query = query.lt("created_at", to.toISOString());

  const { data, error, count } = await query;

  if (error) {
    console.error("getSalesExportRows error:", error);
    return { rows: [], total: 0, truncated: false };
  }

  const rows = ((data ?? []) as unknown as Record<string, Numeric | string>[]).map(
    (row) =>
      ({
        ...row,
        listed_price: nullableNum(row.listed_price as Numeric),
        proposed_price: nullableNum(row.proposed_price as Numeric),
        discount_amount: nullableNum(row.discount_amount as Numeric),
        agreed_price: nullableNum(row.agreed_price as Numeric),
        total_due: nullableNum(row.total_due as Numeric),
        verified_paid: nullableNum(row.verified_paid as Numeric),
        balance_due: nullableNum(row.balance_due as Numeric),
      }) as unknown as SalesExportRow,
  );

  const total = count ?? rows.length;

  return { rows, total, truncated: total > rows.length };
}

/* =========================================================
   TABLE VIEW
========================================================= */

/**
 * One row per deal for the report's table view, newest first.
 *
 * completed_at lives on the sales_deals table rather than the reporting view,
 * so it is read separately and merged by id. That keeps sales_deal_list
 * exactly as earlier phases built it.
 */
export async function getSalesReportDeals(range: ReportRange): Promise<ReportDealsResult> {
  const supabase = await createClient();
  const { from, to } = resolveRange(range);

  let query = supabase
    .from("sales_deal_list")
    .select(`id, ${EXPORT_COLUMNS}`, { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(TABLE_LIMIT);

  if (from) query = query.gte("created_at", from.toISOString());
  /* Exclusive end: resolveRange returns the start of the next period. */
  query = query.lt("created_at", to.toISOString());

  const { data, error, count } = await query;

  if (error) {
    console.error("getSalesReportDeals error:", error);
    return { rows: [], total: 0, truncated: false, failed: true };
  }

  const base = (data ?? []) as unknown as (Record<string, Numeric | string> & { id: string })[];

  /* ---- Completion dates, for the deals on this page only ---- */

  const completedAt = new Map<string, string>();

  if (base.length > 0) {
    const { data: completions, error: completionError } = await supabase
      .from("sales_deals")
      .select("id, completed_at")
      .in(
        "id",
        base.map((row) => row.id),
      )
      .not("completed_at", "is", null);

    if (completionError) {
      // The table is still useful without the completion column.
      console.error("getSalesReportDeals completions error:", completionError);
    } else {
      ((completions ?? []) as unknown as { id: string; completed_at: string }[]).forEach((row) =>
        completedAt.set(row.id, row.completed_at),
      );
    }
  }

  const rows = base.map(
    (row) =>
      ({
        ...row,
        listed_price: nullableNum(row.listed_price as Numeric),
        proposed_price: nullableNum(row.proposed_price as Numeric),
        discount_amount: nullableNum(row.discount_amount as Numeric),
        agreed_price: nullableNum(row.agreed_price as Numeric),
        total_due: nullableNum(row.total_due as Numeric),
        verified_paid: nullableNum(row.verified_paid as Numeric),
        balance_due: nullableNum(row.balance_due as Numeric),
        completed_at: completedAt.get(row.id) ?? null,
      }) as unknown as ReportDealRow,
  );

  const total = count ?? rows.length;

  return { rows, total, truncated: total > rows.length, failed: false };
}
