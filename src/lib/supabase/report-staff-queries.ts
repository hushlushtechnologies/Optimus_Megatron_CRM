import { createClient } from "@/src/lib/supabase/server";
import {
  AGGREGATE_PAGE,
  completenessOf,
  figureFrom,
  interpretCounted,
  type CountedRows,
  type ReportFigure,
} from "@/src/lib/supabase/report-aggregate";
import { money, sumFils } from "@/src/lib/utils/report-money";
import { resolveReportRange, type ReportRangeId } from "@/src/lib/utils/report-time";
import type { ReportFilters } from "@/src/lib/utils/report-filters";
import type { StaffPerformanceRow, StaffReportData } from "@/src/lib/types/report-staff";

/*
|--------------------------------------------------------------------------
| STAFF PERFORMANCE
|--------------------------------------------------------------------------
|
| Five modules, one row per person, assembled in memory.
|
| Every module is read by its OWN assignment column — see report-staff.ts for
| why that matters and what goes wrong if the customer's relationship manager
| is used instead.
|
| WHY THIS IS FIVE QUERIES AND NOT A JOIN
|
| A join across leads, test drives, reservations, deals and enquiries would
| multiply rows against each other: a salesperson with 3 leads and 4 deals
| would produce 12 rows, and any count taken from them would be wrong in a
| way that looks plausible. Five independent tallies merged on staff id
| cannot do that.
|
| It also means one module failing degrades one set of columns rather than
| emptying the table.
*/

interface StaffAccumulator extends StaffPerformanceRow {
  completedFils: bigint;
}

interface LeadRow {
  assigned_staff_id: string | null;
  staff_name: string | null;
  stage_type: string | null;
}

interface DriveRow {
  assigned_staff_id: string | null;
  staff_name: string | null;
  status: string;
}

interface ReservationRow {
  owner_id: string | null;
  owner_name: string | null;
}

interface DealRow {
  owner_id: string | null;
  owner_name: string | null;
  status: string;
  total_due: string | number | null;
}

interface EnquiryRow {
  assigned_to: string | null;
  assigned_to_name: string | null;
  status: string;
}

export async function getStaffReport(
  range: ReportRangeId,
  filters: ReportFilters,
  options: { customFrom?: string; customTo?: string } = {},
): Promise<StaffReportData> {
  const supabase = await createClient();

  const resolved = resolveReportRange(range, {
    customFrom: options.customFrom,
    customTo: options.customTo,
  });

  const { fromIso, toIso } = resolved;

  const { data: settings } = await supabase.from("sales_settings").select("currency").maybeSingle();
  const currency = (settings?.currency as string | undefined) ?? "AED";

  const since = <T extends { gte: (c: string, v: string) => T }>(query: T, column: string): T =>
    fromIso ? query.gte(column, fromIso) : query;

  /* ---- leads, by their own assigned staff ---- */

  let leadsQuery = supabase
    .from("lead_list")
    .select("assigned_staff_id, staff_name, stage_type", { count: "exact" })
    .is("archived_at", null)
    .lt("created_at", toIso)
    .limit(AGGREGATE_PAGE);
  leadsQuery = since(leadsQuery, "created_at");

  /* ---- test drives, by their own assigned staff ---- */

  let drivesQuery = supabase
    .from("test_drive_list")
    .select("assigned_staff_id, staff_name, status", { count: "exact" })
    .is("archived_at", null)
    .lt("created_at", toIso)
    .limit(AGGREGATE_PAGE);
  drivesQuery = since(drivesQuery, "created_at");

  /* ---- reservations, by their owner ---- */

  let reservationsQuery = supabase
    .from("vehicle_reservation_list")
    .select("owner_id, owner_name", { count: "exact" })
    .lt("requested_at", toIso)
    .limit(AGGREGATE_PAGE);
  reservationsQuery = since(reservationsQuery, "requested_at");

  /* ---- deals, by the DEAL's owner ---- */

  let dealsQuery = supabase
    .from("sales_deal_list")
    .select("owner_id, owner_name, status, total_due", { count: "exact" })
    .lt("created_at", toIso)
    .limit(AGGREGATE_PAGE);
  dealsQuery = since(dealsQuery, "created_at");

  /* ---- enquiries, by their assignee ---- */

  let enquiriesQuery = supabase
    .from("enquiry_list")
    .select("assigned_to, assigned_to_name, status", { count: "exact" })
    .is("archived_at", null)
    .lt("created_at", toIso)
    .limit(AGGREGATE_PAGE);
  enquiriesQuery = since(enquiriesQuery, "created_at");

  /* A showroom filter narrows every module that has a location. */
  if (filters.location) {
    leadsQuery = leadsQuery.eq("location_id", filters.location);
    drivesQuery = drivesQuery.eq("location_id", filters.location);
    reservationsQuery = reservationsQuery.eq("location_id", filters.location);
    dealsQuery = dealsQuery.eq("location_id", filters.location);
    enquiriesQuery = enquiriesQuery.eq("location_id", filters.location);
  }

  const [leadsRes, drivesRes, reservationsRes, dealsRes, enquiriesRes] = await Promise.all([
    leadsQuery,
    drivesQuery,
    reservationsQuery,
    dealsQuery,
    enquiriesQuery,
  ]);

  const leads = interpretCounted<LeadRow>(leadsRes, AGGREGATE_PAGE, "staff leads");
  const drives = interpretCounted<DriveRow>(drivesRes, AGGREGATE_PAGE, "staff test drives");
  const reservations = interpretCounted<ReservationRow>(
    reservationsRes,
    AGGREGATE_PAGE,
    "staff reservations",
  );
  const deals = interpretCounted<DealRow>(dealsRes, AGGREGATE_PAGE, "staff deals");
  const enquiries = interpretCounted<EnquiryRow>(enquiriesRes, AGGREGATE_PAGE, "staff enquiries");

  /* ---- merge ---- */

  const staff = new Map<string, StaffAccumulator>();

  const ensure = (id: string | null, name: string | null): StaffAccumulator | null => {
    /*
     * Unassigned work is skipped rather than collected under one row. A
     * single "Unassigned" row would sit at the top of the table looking like
     * the most productive member of staff, which is both wrong and faintly
     * insulting to everybody below it. Unassigned volume is a real thing
     * worth reporting, and it belongs in the operations report as a gap
     * rather than here as a person.
     */
    if (!id) return null;

    const existing = staff.get(id);
    if (existing) {
      /* A later module may carry a name where an earlier one had none. */
      if (existing.staffName === "Unnamed staff" && name?.trim()) {
        existing.staffName = name.trim();
      }
      return existing;
    }

    const created: StaffAccumulator = {
      staffId: id,
      staffName: name?.trim() || "Unnamed staff",
      leadsAssigned: 0,
      leadsWon: 0,
      testDrivesAssigned: 0,
      testDrivesCompleted: 0,
      reservationsOwned: 0,
      dealsOwned: 0,
      dealsCompleted: 0,
      completedValue: money(0n, currency),
      enquiriesHandled: 0,
      enquiriesCompleted: 0,
      completedFils: 0n,
    };

    staff.set(id, created);
    return created;
  };

  for (const row of leads.rows) {
    const entry = ensure(row.assigned_staff_id, row.staff_name);
    if (!entry) continue;
    entry.leadsAssigned += 1;
    if (row.stage_type === "won") entry.leadsWon += 1;
  }

  for (const row of drives.rows) {
    const entry = ensure(row.assigned_staff_id, row.staff_name);
    if (!entry) continue;
    entry.testDrivesAssigned += 1;
    if (row.status === "Completed") entry.testDrivesCompleted += 1;
  }

  for (const row of reservations.rows) {
    const entry = ensure(row.owner_id, row.owner_name);
    if (!entry) continue;
    entry.reservationsOwned += 1;
  }

  for (const row of deals.rows) {
    const entry = ensure(row.owner_id, row.owner_name);
    if (!entry) continue;
    entry.dealsOwned += 1;

    if (row.status === "Completed") {
      entry.dealsCompleted += 1;
      entry.completedFils += sumFils([row], (deal) => deal.total_due);
    }
  }

  for (const row of enquiries.rows) {
    const entry = ensure(row.assigned_to, row.assigned_to_name);
    if (!entry) continue;
    entry.enquiriesHandled += 1;
    if (row.status === "Completed") entry.enquiriesCompleted += 1;
  }

  const rows: StaffPerformanceRow[] = Array.from(staff.values())
    .map((entry) => ({
      ...entry,
      completedValue: money(entry.completedFils, currency),
    }))
    .sort((a, b) => b.dealsOwned - a.dealsOwned || a.staffName.localeCompare(b.staffName));

  /*
   * The table is as complete as its least complete source. A person's lead
   * count and deal count sitting in one row invites comparison, and a row
   * where one came from a capped fetch and the other did not would be a
   * comparison of two different things.
   */
  const sources: Record<string, ReportFigure<unknown>> = {
    leads: figureFrom(leads, (r) => r.length),
    drives: figureFrom(drives, (r) => r.length),
    reservations: figureFrom(reservations, (r) => r.length),
    deals: figureFrom(deals, (r) => r.length),
    enquiries: figureFrom(enquiries, (r) => r.length),
  };

  const state = completenessOf(sources);

  const combined: CountedRows<StaffPerformanceRow> = {
    rows,
    total: null,
    complete: state.allComplete,
    error: state.failed.length === 5 ? "every source failed" : null,
  };

  return {
    rows: figureFrom(combined, (assembled) => assembled),
    staffCount: figureFrom(combined, (assembled) => assembled.length),
    currency,
    rangeLabel: resolved.label,
  };
}
