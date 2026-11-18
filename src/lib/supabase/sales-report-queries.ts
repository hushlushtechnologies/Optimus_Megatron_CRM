import { createClient } from "@/src/lib/supabase/server";
import { SALES_DEAL_STATUSES, type SalesDealStatus } from "@/src/lib/types/sales";
import type {
  MonthlyPoint,
  OwnerPerformanceRow,
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
| sees. No new database objects are needed for Phase 17.
*/

const EXPORT_LIMIT = 5000;
const AGGREGATE_LIMIT = 5000;

type Numeric = number | string | null;
const num = (value: Numeric): number => (value === null || value === undefined ? 0 : Number(value));
const nullableNum = (value: Numeric): number | null =>
  value === null || value === undefined ? null : Number(value);

/* =========================================================
   RANGES
========================================================= */

/** The window a range covers. `from` null means "everything". */
export function resolveRange(range: ReportRange): { from: Date | null; to: Date } {
  const now = new Date();
  const to = now;

  switch (range) {
    case "this-month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to };
    case "last-month":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        // The last instant of last month, so "last month" never includes today.
        to: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, -1),
      };
    case "last-90": {
      const from = new Date(now);
      from.setDate(from.getDate() - 90);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    }
    case "year":
      return { from: new Date(now.getFullYear(), 0, 1), to };
    case "all":
    default:
      return { from: null, to };
  }
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
  const { from, to } = resolveRange(range);

  const emptyResult: SalesReportData = {
    kpis: null,
    byStatus: null,
    byOwner: null,
    byShowroom: null,
    monthly: null,
    range,
    from: from?.toISOString() ?? null,
    to: to.toISOString(),
  };

  /* ---- Deals completed inside the window, by id ---- */

  let completedQuery = supabase
    .from("sales_deals")
    .select("id, completed_at")
    .eq("status", "Completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(AGGREGATE_LIMIT);

  if (from) completedQuery = completedQuery.gte("completed_at", from.toISOString());
  completedQuery = completedQuery.lte("completed_at", to.toISOString());

  /* ---- Deals created inside the window ---- */

  let createdQuery = supabase
    .from("sales_deal_list")
    .select(AGGREGATE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(AGGREGATE_LIMIT);

  if (from) createdQuery = createdQuery.gte("created_at", from.toISOString());
  createdQuery = createdQuery.lte("created_at", to.toISOString());

  /* ---- Everything still open, whenever it was created ---- */

  const openQuery = supabase
    .from("sales_deal_list")
    .select(AGGREGATE_COLUMNS)
    .in("status", ["Draft", "Negotiation", "Reserved", "Confirmed"])
    .limit(AGGREGATE_LIMIT);

  /* ---- Verified money movement inside the window ---- */

  let paymentsQuery = supabase
    .from("sales_payment_list")
    .select("amount, direction, paid_on")
    .eq("status", "Verified")
    .limit(AGGREGATE_LIMIT * 2);

  if (from) paymentsQuery = paymentsQuery.gte("paid_on", from.toISOString());
  paymentsQuery = paymentsQuery.lte("paid_on", to.toISOString());

  const [completedResult, createdResult, openResult, paymentsResult, settingsResult] = await Promise.all([
    completedQuery,
    createdQuery,
    openQuery,
    paymentsQuery,
    supabase.from("sales_settings").select("currency").maybeSingle(),
  ]);

  if (completedResult.error || createdResult.error || openResult.error) {
    console.error(
      "getSalesReport error:",
      completedResult.error ?? createdResult.error ?? openResult.error,
    );
    return emptyResult;
  }

  const completedIds = new Map(
    ((completedResult.data ?? []) as unknown as { id: string; completed_at: string }[]).map((row) => [
      row.id,
      row.completed_at,
    ]),
  );

  const createdRows = (createdResult.data ?? []) as unknown as AggregateRow[];
  const openRows = (openResult.data ?? []) as unknown as AggregateRow[];

  /* ---- Completed deals need their value, which lives on the view ---- */

  const completedRows: AggregateRow[] = [];

  if (completedIds.size > 0) {
    const ids = Array.from(completedIds.keys());
    const { data, error } = await supabase
      .from("sales_deal_list")
      .select(AGGREGATE_COLUMNS)
      .in("id", ids);

    if (error) {
      console.error("getSalesReport completed values error:", error);
      return emptyResult;
    }

    completedRows.push(...((data ?? []) as unknown as AggregateRow[]));
  }

  const currency =
    (settingsResult.data?.currency as string | undefined) ??
    completedRows[0]?.currency ??
    createdRows[0]?.currency ??
    "AED";

  /* ---- Money ---- */

  const completedValue = completedRows.reduce((sum, row) => sum + num(row.total_due), 0);

  const collected = ((paymentsResult.data ?? []) as unknown as {
    amount: Numeric;
    direction: string;
  }[]).reduce(
    (sum, row) => sum + (row.direction === "out" ? -num(row.amount) : num(row.amount)),
    0,
  );

  const outstanding = openRows
    .filter((row) => row.status === "Confirmed")
    .reduce((sum, row) => sum + num(row.balance_due), 0);

  const cancelledInRange = createdRows.filter((row) => row.status === "Cancelled").length;

  const kpis: SalesKpis = {
    created: createdRows.length,
    completed: completedRows.length,
    cancelled: cancelledInRange,
    open: openRows.length,
    completedValue,
    collected,
    outstanding,
    winRate:
      createdRows.length === 0
        ? null
        : Math.round((completedRows.length / createdRows.length) * 100),
    averageDealValue: completedRows.length === 0 ? null : completedValue / completedRows.length,
    currency,
  };

  /* ---- By status: everything created in the window ---- */

  const statusCounts = new Map<SalesDealStatus, { count: number; value: number }>();
  createdRows.forEach((row) => {
    const current = statusCounts.get(row.status) ?? { count: 0, value: 0 };
    current.count += 1;
    current.value += num(row.total_due);
    statusCounts.set(row.status, current);
  });

  const byStatus: StatusBreakdownRow[] = SALES_DEAL_STATUSES.map((status) => ({
    status,
    count: statusCounts.get(status)?.count ?? 0,
    value: statusCounts.get(status)?.value ?? 0,
  })).filter((row) => row.count > 0);

  /* ---- By owner: completed in the window, plus what they hold open now ---- */

  const owners = new Map<string, OwnerPerformanceRow>();

  const ensureOwner = (id: string, name: string | null): OwnerPerformanceRow => {
    const existing = owners.get(id);
    if (existing) return existing;

    const created: OwnerPerformanceRow = {
      ownerId: id,
      ownerName: name?.trim() || "Unnamed staff",
      completed: 0,
      open: 0,
      value: 0,
    };
    owners.set(id, created);
    return created;
  };

  completedRows.forEach((row) => {
    if (!row.owner_id) return;
    const owner = ensureOwner(row.owner_id, row.owner_name);
    owner.completed += 1;
    owner.value += num(row.total_due);
  });

  openRows.forEach((row) => {
    if (!row.owner_id) return;
    ensureOwner(row.owner_id, row.owner_name).open += 1;
  });

  const byOwner = Array.from(owners.values()).sort(
    (a, b) => b.value - a.value || b.completed - a.completed,
  );

  /* ---- By showroom: completed in the window ---- */

  const showrooms = new Map<string, ShowroomPerformanceRow>();

  completedRows.forEach((row) => {
    if (!row.location_id) return;

    const current = showrooms.get(row.location_id) ?? {
      locationId: row.location_id,
      locationName: row.location_name ?? "Unassigned",
      completed: 0,
      value: 0,
    };

    current.completed += 1;
    current.value += num(row.total_due);
    showrooms.set(row.location_id, current);
  });

  const byShowroom = Array.from(showrooms.values()).sort((a, b) => b.value - a.value);

  /* ---- Monthly: completions by the month they completed in ---- */

  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Dubai",
  });

  const monthBuckets = new Map<string, MonthlyPoint>();

  completedRows.forEach((row) => {
    const completedAt = completedIds.get(row.id);
    if (!completedAt) return;

    const date = new Date(completedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const current = monthBuckets.get(key) ?? { month: monthLabel.format(date), completed: 0, value: 0 };
    current.completed += 1;
    current.value += num(row.total_due);
    monthBuckets.set(key, current);
  });

  const monthly = Array.from(monthBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, point]) => point);

  return {
    kpis,
    byStatus,
    byOwner,
    byShowroom,
    monthly,
    range,
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
  query = query.lte("created_at", to.toISOString());

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