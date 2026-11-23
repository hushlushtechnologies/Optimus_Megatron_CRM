import { createClient } from "@/src/lib/supabase/server";
import {
  AGGREGATE_PAGE,
  figureFailed,
  figureFrom,
  figureOf,
  interpretCounted,
  type ReportFigure,
} from "@/src/lib/supabase/report-aggregate";
import { money, sumFils } from "@/src/lib/utils/report-money";
import { resolveReportRange, type ReportRangeId } from "@/src/lib/utils/report-time";
import type { ReportFilters } from "@/src/lib/utils/report-filters";
import type { NamedCount } from "@/src/lib/types/report-customers";
import {
  TEST_DRIVE_ENDED_STATUSES,
  type OperationsReportData,
} from "@/src/lib/types/report-operations";

/*
|--------------------------------------------------------------------------
| THE OPERATIONS REPORT
|--------------------------------------------------------------------------
|
| Three modules in one report, each read from its own list view, each
| attributed by its own date:
|
|   test drives    by created_at     when the drive was booked
|   reservations   by requested_at   when the hold was asked for
|   enquiries      by created_at     when the enquiry arrived
|
| All three are "when it started", which makes the three halves comparable: a
| period's test drives, reservations and enquiries are the work that came in
| during it. Outcome figures — completed, converted — are then asked of those
| same cohorts, so a rate is always a question about one set of records.
|
| That is the same correction made to the sales win rate in Batch 1 and the
| lead win rate in Batch 3. Mixing "raised this period" with "converted this
| period" produces a rate that can exceed 100% and means nothing.
*/

interface TestDriveRow {
  id: string;
  status: string;
  location_name: string | null;
  staff_name: string | null;
}

interface ReservationRow {
  id: string;
  status: string;
  deal_id: string | null;
  deposit_verified: number | string | null;
  location_name: string | null;
}

interface EnquiryRow {
  id: string;
  status: string;
  enquiry_type: string;
  source: string | null;
  priority: string | null;
  assigned_to_name: string | null;
  deal_id: string | null;
}

/** Group rows by a name, biggest first. Shared shape with the other reports. */
function tally(values: (string | null)[]): NamedCount[] {
  const groups = new Map<string, number>();

  for (const value of values) {
    const name = value?.trim() || "Not set";
    groups.set(name, (groups.get(name) ?? 0) + 1);
  }

  return Array.from(groups.entries())
    .map(([name, count]) => ({ id: name, name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** A whole-number percentage, or null when the denominator is empty. */
function rate(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

export async function getOperationsReport(
  range: ReportRangeId,
  filters: ReportFilters,
  options: { customFrom?: string; customTo?: string } = {},
): Promise<OperationsReportData> {
  const supabase = await createClient();

  const resolved = resolveReportRange(range, {
    customFrom: options.customFrom,
    customTo: options.customTo,
  });

  const { fromIso, toIso } = resolved;

  const { data: settings } = await supabase.from("sales_settings").select("currency").maybeSingle();
  const currency = (settings?.currency as string | undefined) ?? "AED";

  /* ---- test drives, by when they were booked ---- */

  let drivesQuery = supabase
    .from("test_drive_list")
    .select("id, status, location_name, staff_name", { count: "exact" })
    .is("archived_at", null)
    .lt("created_at", toIso)
    .limit(AGGREGATE_PAGE);

  if (fromIso) drivesQuery = drivesQuery.gte("created_at", fromIso);
  if (filters.location) drivesQuery = drivesQuery.eq("location_id", filters.location);
  if (filters.staff) drivesQuery = drivesQuery.eq("assigned_staff_id", filters.staff);
  if (filters.status) drivesQuery = drivesQuery.eq("status", filters.status);

  /* ---- reservations, by when they were requested ---- */

  let reservationsQuery = supabase
    .from("vehicle_reservation_list")
    .select("id, status, deal_id, deposit_verified, location_name", { count: "exact" })
    .lt("requested_at", toIso)
    .limit(AGGREGATE_PAGE);

  if (fromIso) reservationsQuery = reservationsQuery.gte("requested_at", fromIso);
  if (filters.location) reservationsQuery = reservationsQuery.eq("location_id", filters.location);
  if (filters.staff) reservationsQuery = reservationsQuery.eq("owner_id", filters.staff);

  /*
   * Active holds are a right-now figure, not a period one: a hold raised
   * last month that is still live is still holding a car off the floor. So
   * this one query deliberately ignores the period, and the metric
   * definition says so.
   */
  let activeHoldsQuery = supabase
    .from("vehicle_reservation_list")
    .select("id", { count: "exact", head: true })
    .eq("is_live", true);

  if (filters.location) activeHoldsQuery = activeHoldsQuery.eq("location_id", filters.location);

  /* ---- enquiries, by when they arrived ---- */

  let enquiriesQuery = supabase
    .from("enquiry_list")
    .select("id, status, enquiry_type, source, priority, assigned_to_name, deal_id", {
      count: "exact",
    })
    .is("archived_at", null)
    .lt("created_at", toIso)
    .limit(AGGREGATE_PAGE);

  if (fromIso) enquiriesQuery = enquiriesQuery.gte("created_at", fromIso);
  if (filters.location) enquiriesQuery = enquiriesQuery.eq("location_id", filters.location);
  if (filters.staff) enquiriesQuery = enquiriesQuery.eq("assigned_to", filters.staff);
  if (filters.status) enquiriesQuery = enquiriesQuery.eq("status", filters.status);

  const [drivesRes, reservationsRes, activeHoldsRes, enquiriesRes] = await Promise.all([
    drivesQuery,
    reservationsQuery,
    activeHoldsQuery,
    enquiriesQuery,
  ]);

  /* ---- test drives ---- */

  const drives = interpretCounted<TestDriveRow>(drivesRes, AGGREGATE_PAGE, "test drives");

  const completedDrives = drives.rows.filter((row) => row.status === "Completed").length;

  /*
   * The denominator is drives that have had their chance, not every drive
   * booked. A drive booked yesterday and still Approved has not failed to
   * happen; counting it against the rate makes recent periods look bad and
   * makes the figure drift upward on its own as those drives resolve.
   */
  const endedDrives = drives.rows.filter((row) =>
    (TEST_DRIVE_ENDED_STATUSES as readonly string[]).includes(row.status),
  ).length;

  /* ---- reservations ---- */

  const reservations = interpretCounted<ReservationRow>(
    reservationsRes,
    AGGREGATE_PAGE,
    "reservations",
  );

  const convertedReservations = reservations.rows.filter((row) => row.deal_id !== null).length;

  /* ---- enquiries ---- */

  const enquiries = interpretCounted<EnquiryRow>(enquiriesRes, AGGREGATE_PAGE, "enquiries");

  const completedEnquiries = enquiries.rows.filter((row) => row.status === "Completed").length;
  const convertedEnquiries = enquiries.rows.filter((row) => row.deal_id !== null).length;

  const holdsFigure: ReportFigure<number> = activeHoldsRes.error
    ? figureFailed(activeHoldsRes.error.message ?? "query failed")
    : figureOf(activeHoldsRes.count ?? 0, true, activeHoldsRes.count ?? 0);

  return {
    /* test drives */
    testDrivesByStatus: figureFrom(drives, (rows) => tally(rows.map((row) => row.status))),
    testDrivesTotal: figureFrom(drives, (rows) => rows.length),
    testDrivesCompleted: figureFrom(drives, () => completedDrives),
    testDriveCompletionRate: figureFrom(drives, () => rate(completedDrives, endedDrives)),
    testDrivesByShowroom: figureFrom(drives, (rows) => tally(rows.map((row) => row.location_name))),
    testDrivesByStaff: figureFrom(drives, (rows) => tally(rows.map((row) => row.staff_name))),

    /* reservations */
    reservationsByStatus: figureFrom(reservations, (rows) => tally(rows.map((row) => row.status))),
    reservationsTotal: figureFrom(reservations, (rows) => rows.length),
    activeHolds: holdsFigure,
    reservationsConverted: figureFrom(reservations, () => convertedReservations),
    reservationConversionRate: figureFrom(reservations, (rows) =>
      rate(convertedReservations, rows.length),
    ),
    depositsVerified: figureFrom(reservations, (rows) =>
      money(sumFils(rows, (row) => row.deposit_verified), currency),
    ),
    reservationsByShowroom: figureFrom(reservations, (rows) =>
      tally(rows.map((row) => row.location_name)),
    ),

    /* enquiries */
    enquiriesTotal: figureFrom(enquiries, (rows) => rows.length),
    enquiriesByType: figureFrom(enquiries, (rows) => tally(rows.map((row) => row.enquiry_type))),
    enquiriesByStatus: figureFrom(enquiries, (rows) => tally(rows.map((row) => row.status))),
    enquiriesBySource: figureFrom(enquiries, (rows) => tally(rows.map((row) => row.source))),
    enquiriesByPriority: figureFrom(enquiries, (rows) => tally(rows.map((row) => row.priority))),
    enquiriesByStaff: figureFrom(enquiries, (rows) =>
      tally(rows.map((row) => row.assigned_to_name)),
    ),
    enquiriesCompleted: figureFrom(enquiries, () => completedEnquiries),
    enquiriesConverted: figureFrom(enquiries, () => convertedEnquiries),

    currency,
    rangeLabel: resolved.label,
  };
}
