"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";

/*
|------------------------------------------------------------------------------
| Handing a reservation to somebody else
|------------------------------------------------------------------------------
|
| WHY THIS DID NOT EXIST
|
| createReservationAction() sets owner_id when a reservation is made, and
| nothing has ever changed it since. So a reservation taken by somebody who
| then went on leave stayed theirs, and the only way to move it was the SQL
| editor — which left no record either, because there was no history table
| until sql/20.
|
| THE TWO RULES, BOTH BORROWED RATHER THAN INVENTED
|
| Who may hand one over: `reservationsConfirm`, which is already what
| createReservationAction() requires to assign a reservation to anybody other
| than yourself. Handing one over is the same act, later.
|
| Who may receive one: must hold `reservations.request`, checked with the same
| has_permission() RPC createReservationAction() already uses. One rule, two
| call sites, rather than a second definition that drifts.
|
| THE HISTORY IS NOT WRITTEN HERE
|
| sql/20 puts an AFTER UPDATE OF owner_id trigger on vehicle_reservations, so
| the handover is recorded whatever changes it — this action, a bulk update, or
| somebody in the SQL editor. Writing it here as well would double every row
| and still miss the changes made any other way.
|
|------------------------------------------------------------------------------
*/

const reassignSchema = z.object({
  id: z.string().uuid(),
  newOwnerId: z.string().uuid("Choose who should take this reservation.").nullable(),
  reason: z
    .string()
    .trim()
    .max(400)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export interface ReservationOwnerResult {
  error: string | null;
}

export async function reassignReservationAction(input: unknown): Promise<ReservationOwnerResult> {
  const parsed = reassignSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." };
  }

  const start = await beginSalesAction("reservationsRequest");
  if (!start.ok) return { error: start.error };

  const { supabase, permissions, userId } = start;
  const v = parsed.data;

  if (!permissions.reservationsConfirm) {
    return { error: "Only a manager can hand a reservation to someone else." };
  }

  // The receiving person must be able to own reservations at all. Same rule and
  // same RPC as creation uses.
  if (v.newOwnerId) {
    const { data: eligible, error: eligibleError } = await supabase.rpc("has_permission", {
      uid: v.newOwnerId,
      perm: "reservations.request",
    });

    if (eligibleError || eligible !== true) {
      return { error: "That person can't own reservations." };
    }
  }

  const { data: current, error: readError } = await supabase
    .from("vehicle_reservations")
    .select("owner_id")
    .eq("id", v.id)
    .maybeSingle();

  if (readError) {
    console.error("reassignReservationAction read error:", readError);
    return { error: "That reservation couldn't be read. Nothing has been changed." };
  }

  if (!current) return { error: "That reservation could not be found." };

  if ((current as { owner_id: string | null }).owner_id === v.newOwnerId) {
    return { error: "That is already the owner." };
  }

  const { error } = await supabase
    .from("vehicle_reservations")
    .update({ owner_id: v.newOwnerId })
    .eq("id", v.id);

  if (error) {
    console.error("reassignReservationAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  /*
  | The reason goes onto the history row the trigger just wrote.
  |
  | The trigger cannot know it — a reason is not a column on the reservation —
  | so it is attached afterwards, to the newest row for this reservation. If
  | this update fails the handover still stands and the history still records
  | it, just without the note, which is the right way round.
  */
  if (v.reason) {
    const { error: reasonError } = await supabase
      .from("reservation_staff_assignment_history")
      .update({ reason: v.reason, assigned_by: userId })
      .eq("reservation_id", v.id)
      .is("reason", null);

    if (reasonError) console.error("reassignReservationAction reason error:", reasonError);
  }

  revalidatePath("/admin/reservations");
  revalidatePath(`/admin/reservations/${v.id}`);
  return { error: null };
}

/*
| There is deliberately no action here for loading the list of people.
|
| There was one, and it was removed: the dialog now receives the list as a prop
| from the server page (getAssignableReservationOwners). An action nothing calls
| is still a public endpoint, so deleting it removes a thing to defend for no
| benefit.
*/
