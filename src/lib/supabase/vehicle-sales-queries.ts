import { createClient } from "@/src/lib/supabase/server";
import { RESERVATION_COLUMNS } from "@/src/lib/supabase/reservation-queries";
import { SALES_LIST_COLUMNS } from "@/src/lib/supabase/sales-list-queries";
import { fetchVehicleDealContext } from "@/src/lib/supabase/vehicle-deal-context";
import type { ReservationListRow } from "@/src/lib/types/reservations";
import type { VehicleDealContext } from "@/src/lib/types/sales-deal-form";
import type { SalesListRow } from "@/src/lib/types/sales-list";

export interface VehicleSalesData {
  /** What currently holds the vehicle. null when that check failed. */
  context: VehicleDealContext | null;
  /** null means the list failed to load, which is different from "none". */
  deals: SalesListRow[] | null;
  reservations: ReservationListRow[] | null;
}

/**
 * The deals and reservations on one vehicle, as the signed-in person is allowed to see them.
 * The views apply the same access rules as the Sales and Reservations pages. A Sales Executive
 * sees only their own deals here, but the "right now" summary shows who holds the vehicle.
 */
export async function getVehicleSales(carId: string): Promise<VehicleSalesData> {
  const supabase = await createClient();

  const [context, deals, reservations] = await Promise.all([
    fetchVehicleDealContext(supabase, carId, null, null),
    supabase
      .from("sales_deal_list")
      .select(SALES_LIST_COLUMNS)
      .eq("car_id", carId)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("vehicle_reservation_list")
      .select(RESERVATION_COLUMNS)
      .eq("car_id", carId)
      .order("requested_at", { ascending: false })
      .limit(25),
  ]);

  if (deals.error) console.error("getVehicleSales deals error:", deals.error);
  if (reservations.error) console.error("getVehicleSales reservations error:", reservations.error);

  return {
    context,
    deals: deals.error ? null : ((deals.data ?? []) as unknown as SalesListRow[]),
    reservations: reservations.error ? null : ((reservations.data ?? []) as unknown as ReservationListRow[]),
  };
}