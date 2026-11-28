import "server-only";

import { createClient } from "@/src/lib/supabase/server";

/*
| Every handover of a reservation, newest first.
|
| Reads reservation_staff_assignment_history, which sql/20 added and which is
| written by a trigger — so a change made in the SQL editor shows up here just
| like one made from the dialog.
|
| Returns null rather than an empty list when the read fails, so the panel can
| tell "never handed over" from "couldn't be read". They are different facts
| and an empty timeline implies the first one.
*/

export interface ReservationHandover {
  id: string;
  previousOwnerName: string | null;
  newOwnerName: string | null;
  assignedByName: string;
  assignedAt: string;
  reason: string | null;
}

export async function getReservationHandovers(reservationId: string): Promise<ReservationHandover[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reservation_staff_assignment_history")
    .select("id, previous_staff_id, new_staff_id, assigned_by, reason, assigned_at")
    .eq("reservation_id", reservationId)
    .order("assigned_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("getReservationHandovers error:", error);
    return null;
  }

  const rows = (data ?? []) as unknown as {
    id: string;
    previous_staff_id: string | null;
    new_staff_id: string | null;
    assigned_by: string | null;
    reason: string | null;
    assigned_at: string;
  }[];

  const ids = new Set<string>();
  for (const row of rows) {
    for (const id of [row.previous_staff_id, row.new_staff_id, row.assigned_by]) {
      if (id) ids.add(id);
    }
  }

  const names = new Map<string, string>();
  if (ids.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, staff_code")
      .in("id", [...ids]);

    for (const profile of profiles ?? []) {
      const p = profile as { id: string; full_name: string | null; staff_code: string | null };
      names.set(p.id, p.full_name?.trim() || p.staff_code || "Unnamed account");
    }
  }

  return rows.map((row) => ({
    id: row.id,
    previousOwnerName: row.previous_staff_id ? (names.get(row.previous_staff_id) ?? "A former colleague") : null,
    newOwnerName: row.new_staff_id ? (names.get(row.new_staff_id) ?? "A former colleague") : null,
    // "System" when nothing identified the actor — a trigger firing under a
    // service-role connection has no auth.uid().
    assignedByName: row.assigned_by ? (names.get(row.assigned_by) ?? "Unknown") : "System",
    assignedAt: row.assigned_at,
    reason: row.reason,
  }));
}

export interface AssignableStaff {
  id: string;
  name: string;
  department: string | null;
  staffCode: string | null;
}

/**
 * Active staff who may own a reservation.
 *
 * Read on the server and passed down, rather than fetched when the dialog
 * opens. Fetching on open meant calling setState from inside an effect, which
 * React 19's lint rules refuse — and rightly: the loading state it needed was
 * only there because the data was being asked for too late.
 *
 * Returns an empty list rather than throwing. An empty picker is a real answer
 * here: it means nobody holds reservations.request, which the dialog says.
 */
export async function getAssignableReservationOwners(): Promise<AssignableStaff[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("list_assignable_staff", {
    p_permission: "reservations.request",
  });

  if (error) {
    console.error("getAssignableReservationOwners error:", error);
    return [];
  }

  const rows = (data ?? []) as unknown as {
    id: string;
    full_name: string;
    department: string | null;
    staff_code: string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    name: row.full_name,
    department: row.department,
    staffCode: row.staff_code,
  }));
}
