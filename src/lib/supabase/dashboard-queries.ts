import { formatDistanceToNow } from "date-fns";

import { createClient } from "@/src/lib/supabase/server";
import { getInventoryMetrics } from "@/src/lib/supabase/inventory-queries";
import { formatDay, formatTime } from "@/src/lib/utils/test-drive-format";
import type {
  ActivityEntry,
  ConversionCounts,
  DashboardAlert,
  DashboardData,
  DashboardKpi,
  FastestSellingCar,
  InventoryStatusSlice,
  LeadSourceCount,
  RevenuePoint,
  TopExecutive,
  UpcomingTestDrive,
} from "@/src/lib/types/dashboard";

/*
|--------------------------------------------------------------------------
| DASHBOARD DATA
|--------------------------------------------------------------------------
|
| Everything the ten dashboard widgets show, read from the same views and
| tables the rest of the app uses, so the dashboard can never disagree with
| the page a person clicks through to.
|
| Row-level security applies to every query here, which means two people
| with different roles can legitimately see different totals. That is the
| intended behaviour: the dashboard shows each person their own view of the
| business, not an unfiltered one.
|
| Revenue means verified money in, less verified refunds out. Recorded but
| unverified payments are deliberately excluded, matching the rule the rest
| of the sales module follows.
*/

const CONVERSION_WINDOW_DAYS = 90;
const ACTIVITY_LIMIT = 5;
const UPCOMING_LIMIT = 3;
const FASTEST_SELLING_LIMIT = 4;

/* =========================================================
   DATES
========================================================= */

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** "Jan", "Feb" … as the revenue chart's X axis expects. */
const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Asia/Dubai" });

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The last 12 months, oldest first, each with its label and bucket key. */
function lastTwelveMonths(): { key: string; label: string }[] {
  const thisMonth = startOfMonth(new Date());

  return Array.from({ length: 12 }, (_, index) => {
    const month = addMonths(thisMonth, index - 11);
    return { key: monthKey(month), label: monthLabel.format(month) };
  });
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

/* =========================================================
   TYPES FOR RAW ROWS
========================================================= */

type Numeric = number | string | null;
const num = (value: Numeric): number => (value === null || value === undefined ? 0 : Number(value));

interface PaymentRow {
  amount: Numeric;
  paid_on: string;
  direction: string;
}

interface CompletedDealRow {
  id: string;
  car_id: string | null;
  owner_id: string | null;
  completed_at: string;
}

/* =========================================================
   REVENUE
========================================================= */

/**
 * Verified payments of the last 12 months, bucketed by month.
 *
 * Money in counts positive and refunds out count negative, so a refunded
 * deposit never inflates a month twice.
 */
async function getRevenueByMonth(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ byMonth: Map<string, number>; failed: boolean }> {
  const windowStart = addMonths(startOfMonth(new Date()), -11);

  const { data, error } = await supabase
    .from("sales_payment_list")
    .select("amount, paid_on, direction")
    .eq("status", "Verified")
    .gte("paid_on", windowStart.toISOString())
    .range(0, 9999);

  if (error) {
    console.error("getRevenueByMonth error:", error);
    return { byMonth: new Map(), failed: true };
  }

  const byMonth = new Map<string, number>();

  ((data ?? []) as unknown as PaymentRow[]).forEach((row) => {
    const key = monthKey(new Date(row.paid_on));
    const signed = row.direction === "out" ? -num(row.amount) : num(row.amount);
    byMonth.set(key, (byMonth.get(key) ?? 0) + signed);
  });

  return { byMonth, failed: false };
}

/* =========================================================
   INVENTORY BREAKDOWN
========================================================= */

/** Fallback colours for availability statuses that have no colour set in the database. */
const STATUS_FALLBACK_COLOR: Record<string, string> = {
  available: "#d4af37",
  reserved: "#60a5fa",
  sold: "#34d399",
  "coming-soon": "#94a3b8",
};

async function getInventoryBreakdown(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<InventoryStatusSlice[]> {
  const { data: statuses, error } = await supabase
    .from("vehicle_statuses")
    .select("id, name, slug, color_hex")
    .eq("category", "availability")
    .eq("is_active", true)
    .order("sort_order");

  if (error || !statuses) {
    console.error("getInventoryBreakdown error:", error);
    return [];
  }

  const rows = statuses as unknown as {
    id: string;
    name: string;
    slug: string;
    color_hex: string | null;
  }[];

  const counts = await Promise.all(
    rows.map((status) =>
      supabase
        .from("cars")
        .select("*", { count: "exact", head: true })
        .is("archived_at", null)
        .eq("availability_status_id", status.id),
    ),
  );

  return rows
    .map((status, index) => ({
      name: status.name,
      value: counts[index].count ?? 0,
      color: status.color_hex ?? STATUS_FALLBACK_COLOR[status.slug] ?? "#94a3b8",
    }))
    .filter((slice) => slice.value > 0);
}

/* =========================================================
   COMPLETED DEALS — fastest selling and top executive
========================================================= */

async function getCompletedDealInsights(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ fastestSelling: FastestSellingCar[]; topExecutive: TopExecutive | null }> {
  const monthStart = startOfMonth(new Date());

  const { data: dealRows, error: dealError } = await supabase
    .from("sales_deals")
    .select("id, car_id, owner_id, completed_at")
    .eq("status", "Completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(200);

  if (dealError || !dealRows || dealRows.length === 0) {
    if (dealError) console.error("getCompletedDealInsights error:", dealError);
    return { fastestSelling: [], topExecutive: null };
  }

  const deals = dealRows as unknown as CompletedDealRow[];

  const carIds = Array.from(new Set(deals.map((deal) => deal.car_id).filter((id): id is string => !!id)));
  const monthDealIds = deals
    .filter((deal) => new Date(deal.completed_at) >= monthStart)
    .map((deal) => deal.id);

  const [carsResult, monthResult] = await Promise.all([
    carIds.length > 0
      ? supabase
          .from("cars")
          .select("id, display_title, created_at, location:locations(name)")
          .in("id", carIds)
      : Promise.resolve({ data: [], error: null }),
    monthDealIds.length > 0
      ? supabase
          .from("sales_deal_list")
          .select("id, owner_id, owner_name, location_name, total_due")
          .in("id", monthDealIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (carsResult.error) console.error("getCompletedDealInsights cars error:", carsResult.error);
  if (monthResult.error) console.error("getCompletedDealInsights month error:", monthResult.error);

  /* ---- Fastest selling: listed to sold, shortest first ---- */

  const cars = new Map(
    ((carsResult.data ?? []) as unknown as {
      id: string;
      display_title: string;
      created_at: string;
      location: { name: string } | { name: string }[] | null;
    }[]).map((car) => [car.id, car]),
  );

  const fastestSelling = deals
    .map((deal) => {
      const car = deal.car_id ? cars.get(deal.car_id) : undefined;
      if (!car) return null;

      const listedAt = new Date(car.created_at).getTime();
      const soldAt = new Date(deal.completed_at).getTime();
      const days = Math.max(0, Math.round((soldAt - listedAt) / 86_400_000));

      const location = Array.isArray(car.location) ? car.location[0] : car.location;

      return {
        id: deal.id,
        name: car.display_title,
        location: location?.name ?? "Unassigned",
        daysToSell: days,
      } satisfies FastestSellingCar;
    })
    .filter((entry): entry is FastestSellingCar => entry !== null)
    .sort((a, b) => a.daysToSell - b.daysToSell)
    .slice(0, FASTEST_SELLING_LIMIT);

  /* ---- Top executive: most value closed this month ---- */

  const byOwner = new Map<string, { name: string; location: string; deals: number; revenue: number }>();

  ((monthResult.data ?? []) as unknown as {
    id: string;
    owner_id: string | null;
    owner_name: string | null;
    location_name: string | null;
    total_due: Numeric;
  }[]).forEach((row) => {
    if (!row.owner_id) return;

    const current = byOwner.get(row.owner_id) ?? {
      name: row.owner_name?.trim() || "Unnamed staff",
      location: row.location_name ?? "Unassigned",
      deals: 0,
      revenue: 0,
    };

    current.deals += 1;
    current.revenue += num(row.total_due);
    byOwner.set(row.owner_id, current);
  });

  const best = Array.from(byOwner.values()).sort(
    (a, b) => b.revenue - a.revenue || b.deals - a.deals,
  )[0];

  return {
    fastestSelling,
    topExecutive: best
      ? { name: best.name, location: best.location, dealsClosed: best.deals, revenue: best.revenue }
      : null,
  };
}

/* =========================================================
   ACTIVITY
========================================================= */

/** "deal_status_changed" becomes "Deal status changed". */
function humaniseActivityType(type: string): string {
  const words = type.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function getRecentActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ActivityEntry[]> {
  const [salesResult, leadResult] = await Promise.all([
    supabase
      .from("sales_activity")
      .select("id, activity_type, description, changed_at")
      .order("changed_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
    supabase
      .from("lead_activities")
      .select("id, activity_type, description, changed_at")
      .order("changed_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
  ]);

  if (salesResult.error) console.error("getRecentActivity sales error:", salesResult.error);
  if (leadResult.error) console.error("getRecentActivity lead error:", leadResult.error);

  type Row = { id: string; activity_type: string; description: string | null; changed_at: string };

  const merged = [
    ...((salesResult.data ?? []) as unknown as Row[]).map((row) => ({ row, prefix: "deal" })),
    ...((leadResult.data ?? []) as unknown as Row[]).map((row) => ({ row, prefix: "lead" })),
  ];

  return merged
    .sort((a, b) => Date.parse(b.row.changed_at) - Date.parse(a.row.changed_at))
    .slice(0, ACTIVITY_LIMIT)
    .map(({ row, prefix }) => ({
      id: `${prefix}-${row.id}`,
      label: humaniseActivityType(row.activity_type),
      detail: row.description ?? "",
      time: formatDistanceToNow(new Date(row.changed_at), { addSuffix: true }),
    }));
}

/* =========================================================
   UPCOMING TEST DRIVES
========================================================= */

/** "Today, 4:30 PM" / "Tomorrow, 11:00 AM" / "20 Nov, 2:00 PM" — the chip reads the first word. */
function scheduleLabel(iso: string): string {
  const when = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  const time = formatTime(when);

  if (sameDay(when, today)) return `Today, ${time}`;
  if (sameDay(when, tomorrow)) return `Tomorrow, ${time}`;
  return `${formatDay(when)}, ${time}`;
}

async function getUpcomingTestDrives(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<UpcomingTestDrive[]> {
  const { data, error } = await supabase
    .from("test_drive_list")
    .select("id, customer_name, vehicle_title, scheduled_start")
    .is("archived_at", null)
    .in("status", ["Pending", "Approved", "Rescheduled"])
    .gte("scheduled_start", new Date().toISOString())
    .order("scheduled_start", { ascending: true })
    .limit(UPCOMING_LIMIT);

  if (error) {
    console.error("getUpcomingTestDrives error:", error);
    return [];
  }

  return ((data ?? []) as unknown as {
    id: string;
    customer_name: string | null;
    vehicle_title: string | null;
    scheduled_start: string;
  }[]).map((row) => ({
    id: row.id,
    customer: row.customer_name ?? "Unknown customer",
    car: row.vehicle_title ?? "Vehicle removed",
    time: scheduleLabel(row.scheduled_start),
  }));
}

/* =========================================================
   LEAD SOURCES
========================================================= */

async function getLeadSources(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<LeadSourceCount[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("source:customer_sources(name)")
    .is("archived_at", null)
    .gte("created_at", daysAgo(CONVERSION_WINDOW_DAYS).toISOString())
    .range(0, 4999);

  if (error) {
    console.error("getLeadSources error:", error);
    return [];
  }

  const counts = new Map<string, number>();

  ((data ?? []) as unknown as { source: { name: string } | { name: string }[] | null }[]).forEach((row) => {
    const source = Array.isArray(row.source) ? row.source[0] : row.source;
    const name = source?.name ?? "Unknown source";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

/* =========================================================
   ALERTS
========================================================= */

async function getAlerts(supabase: Awaited<ReturnType<typeof createClient>>): Promise<DashboardAlert[]> {
  const now = new Date();
  const in48Hours = new Date(now.getTime() + 48 * 3_600_000);

  const { data: openStages } = await supabase
    .from("lead_stages")
    .select("id")
    .eq("stage_type", "open");

  const openStageIds = (openStages ?? []).map((stage) => stage.id as string);

  const [unassignedLeads, unverifiedPayments, expiringHolds, overdueFollowUps, pendingDrives] =
    await Promise.all([
      openStageIds.length > 0
        ? supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .is("archived_at", null)
            .is("assigned_staff_id", null)
            .in("stage_id", openStageIds)
        : Promise.resolve({ count: 0 }),
      supabase
        .from("sales_payment_list")
        .select("*", { count: "exact", head: true })
        .eq("status", "Recorded"),
      supabase
        .from("vehicle_reservation_list")
        .select("*", { count: "exact", head: true })
        .eq("status", "Confirmed")
        .gte("expires_at", now.toISOString())
        .lte("expires_at", in48Hours.toISOString()),
      supabase
        .from("lead_follow_ups")
        .select("*", { count: "exact", head: true })
        .eq("status", "Scheduled")
        .lt("scheduled_at", now.toISOString()),
      supabase
        .from("test_drive_list")
        .select("*", { count: "exact", head: true })
        .is("archived_at", null)
        .eq("status", "Pending"),
    ]);

  const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

  interface AlertCandidate {
    id: string;
    count: number;
    message: (count: number) => string;
  }

  const candidates: AlertCandidate[] = [
    {
      id: "unassigned-leads",
      count: unassignedLeads.count ?? 0,
      message: (count: number) =>
        `${count} open ${plural(count, "lead has", "leads have")} no owner assigned`,
    },
    {
      id: "unverified-payments",
      count: unverifiedPayments.count ?? 0,
      message: (count: number) =>
        `${count} ${plural(count, "payment is", "payments are")} waiting to be verified`,
    },
    {
      id: "expiring-holds",
      count: expiringHolds.count ?? 0,
      message: (count: number) =>
        `${count} ${plural(count, "reservation expires", "reservations expire")} within 48 hours`,
    },
    {
      id: "overdue-follow-ups",
      count: overdueFollowUps.count ?? 0,
      message: (count: number) => `${count} follow-${plural(count, "up is", "ups are")} overdue`,
    },
    {
      id: "pending-test-drives",
      count: pendingDrives.count ?? 0,
      message: (count: number) =>
        `${count} test ${plural(count, "drive is", "drives are")} waiting for approval`,
    },
  ];

  // Only conditions that are actually true become alerts.
  return candidates
    .filter((candidate) => candidate.count > 0)
    .map(
      (candidate): DashboardAlert => ({
        id: candidate.id,
        message: candidate.message(candidate.count),
      }),
    );
}

/* =========================================================
   CONVERSION
========================================================= */

async function getConversion(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ConversionCounts> {
  const windowStart = daysAgo(CONVERSION_WINDOW_DAYS).toISOString();

  const [leads, testDrives, reservations, sold] = await Promise.all([
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .is("archived_at", null)
      .gte("created_at", windowStart),
    supabase
      .from("test_drive_list")
      .select("*", { count: "exact", head: true })
      .is("archived_at", null)
      .gte("created_at", windowStart),
    supabase
      .from("vehicle_reservation_list")
      .select("*", { count: "exact", head: true })
      .gte("requested_at", windowStart),
    supabase
      .from("sales_deals")
      .select("*", { count: "exact", head: true })
      .eq("status", "Completed")
      .gte("completed_at", windowStart),
  ]);

  return {
    leads: leads.count ?? 0,
    testDrives: testDrives.count ?? 0,
    reservations: reservations.count ?? 0,
    sold: sold.count ?? 0,
  };
}

/* =========================================================
   KPI SUPPORT
========================================================= */

/** Monthly counts over the last 12 months for a table with a timestamp column. */
async function monthlyCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  column: string,
  months: { key: string; label: string }[],
): Promise<Map<string, number>> {
  const windowStart = addMonths(startOfMonth(new Date()), -11);

  const { data, error } = await supabase
    .from(table)
    .select(column)
    .gte(column, windowStart.toISOString())
    .range(0, 9999);

  const counts = new Map<string, number>(months.map((month) => [month.key, 0]));

  if (error) {
    console.error(`monthlyCounts ${table}.${column} error:`, error);
    return counts;
  }

  ((data ?? []) as unknown as Record<string, string>[]).forEach((row) => {
    const value = row[column];
    if (!value) return;

    const key = monthKey(new Date(value));
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return counts;
}

/* =========================================================
   PUBLIC
========================================================= */

/**
 * Everything the dashboard shows, in one pass.
 *
 * Each section fails independently: a section that cannot load returns empty
 * rather than taking the whole page down, and the widget shows its own empty
 * state. Nothing here is ever invented.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const months = lastTwelveMonths();

  const [
    revenue,
    inventory,
    inventoryStatus,
    completedInsights,
    conversion,
    recentActivity,
    upcomingTestDrives,
    leadSources,
    alerts,
    customersByMonth,
    testDrivesByMonth,
    totalCustomers,
    pendingDrives,
    pendingReservations,
  ] = await Promise.all([
    getRevenueByMonth(supabase),
    getInventoryMetrics(),
    getInventoryBreakdown(supabase),
    getCompletedDealInsights(supabase),
    getConversion(supabase),
    getRecentActivity(supabase),
    getUpcomingTestDrives(supabase),
    getLeadSources(supabase),
    getAlerts(supabase),
    monthlyCounts(supabase, "customer_profiles", "created_at", months),
    monthlyCounts(supabase, "test_drive_list", "created_at", months),
    supabase.from("customer_profiles").select("*", { count: "exact", head: true }).is("archived_at", null),
    supabase
      .from("test_drive_list")
      .select("*", { count: "exact", head: true })
      .is("archived_at", null)
      .eq("status", "Pending"),
    supabase
      .from("vehicle_reservation_list")
      .select("*", { count: "exact", head: true })
      .eq("status", "Requested"),
  ]);

  /* ---- Revenue ---- */

  const revenueSeries = months.map((month) => revenue.byMonth.get(month.key) ?? 0);
  const thisMonthRevenue = revenueSeries[revenueSeries.length - 1] ?? 0;
  const lastMonthRevenue = revenueSeries[revenueSeries.length - 2] ?? 0;

  const revenueTrend: RevenuePoint[] = months.map((month, index) => ({
    month: month.label,
    // The chart's axis and tooltip are labelled "AED · Millions".
    revenue: Number((revenueSeries[index] / 1_000_000).toFixed(2)),
  }));

  /* ---- Customers ---- */

  const customerSeries = months.map((month) => customersByMonth.get(month.key) ?? 0);
  const customersThisMonth = customerSeries[customerSeries.length - 1] ?? 0;
  const customersLastMonth = customerSeries[customerSeries.length - 2] ?? 0;

  /* ---- Pending work ---- */

  const driveSeries = months.map((month) => testDrivesByMonth.get(month.key) ?? 0);
  const pendingTotal = (pendingDrives.count ?? 0) + (pendingReservations.count ?? 0);

  const kpis: DashboardKpi[] = [
    {
      id: "revenue",
      label: "Revenue (This Month)",
      value: Math.round(thisMonthRevenue),
      prefix: "AED ",
      change: percentChange(thisMonthRevenue, lastMonthRevenue),
      trend: revenueSeries,
    },
    {
      id: "available-cars",
      label: "Available Cars",
      value: inventory.available,
      change: Number(inventory.totalChange.toFixed(1)),
      trend: inventory.totalTrend,
    },
    {
      id: "customers",
      label: "Total Customers",
      value: totalCustomers.count ?? 0,
      change: percentChange(customersThisMonth, customersLastMonth),
      trend: customerSeries,
    },
    {
      id: "pending",
      label: "Pending Test Drives / Reservations",
      value: pendingTotal,
      change: percentChange(
        driveSeries[driveSeries.length - 1] ?? 0,
        driveSeries[driveSeries.length - 2] ?? 0,
      ),
      trend: driveSeries,
    },
  ];

  return {
    kpis,
    alerts,
    revenueTrend,
    inventoryStatus,
    fastestSelling: completedInsights.fastestSelling,
    topExecutive: completedInsights.topExecutive,
    conversion,
    recentActivity,
    upcomingTestDrives,
    leadSources,
  };
}