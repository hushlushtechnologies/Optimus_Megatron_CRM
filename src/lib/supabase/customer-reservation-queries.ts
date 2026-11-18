import { createClient } from "@/src/lib/supabase/server";
import { RESERVATION_COLUMNS } from "@/src/lib/supabase/reservation-queries";
import type { ReservationListRow } from "@/src/lib/types/reservations";

/** Null means the lookup failed, which is different from "this customer has none". */
export type CustomerReservationLoad = ReservationListRow[] | null;

/**
 * Every reservation belonging to one customer, newest request first.
 *
 * Reads the same vehicle_reservation_list view as the Reservations page, so
 * the row-level policies decide what the signed-in person may see and the
 * figures can never disagree between the two screens.
 */
export async function getReservationsForCustomer(customerId: string): Promise<CustomerReservationLoad> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vehicle_reservation_list")
    .select(RESERVATION_COLUMNS)
    .eq("customer_id", customerId)
    .order("requested_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("getReservationsForCustomer error:", error);
    return null;
  }

  return (data ?? []) as unknown as ReservationListRow[];
}
