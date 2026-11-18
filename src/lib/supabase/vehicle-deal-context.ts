import type { SalesSupabaseClient } from "@/src/lib/supabase/sales-permissions";
import type { VehicleDealContext } from "@/src/lib/types/sales-deal-form";

interface ContextRow {
  holder_status: "Reserved" | "Confirmed" | "Completed" | null;
  holder_deal_number: string | null;
  open_deals: number | string | null;
  reservation_number: string | null;
  reservation_expires_at: string | null;
  customer_open_deal_number: string | null;
  lead_deal_number: string | null;
  listed_price: number | string | null;
}

/** What the database says about a vehicle: counts and numbers only, never names or amounts of other deals. */
export async function fetchVehicleDealContext(
  supabase: SalesSupabaseClient,
  carId: string,
  customerId: string | null,
  leadId: string | null,
): Promise<VehicleDealContext | null> {
  const { data, error } = await supabase.rpc("get_vehicle_deal_context", {
    p_car_id: carId,
    p_customer_id: customerId,
    p_lead_id: leadId,
  });

  if (error) {
    console.error("get_vehicle_deal_context error:", error);
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as ContextRow | undefined;
  if (!row) return null;

  return {
    holderStatus: row.holder_status,
    holderDealNumber: row.holder_deal_number,
    openDeals: Number(row.open_deals ?? 0),
    reservationNumber: row.reservation_number,
    reservationExpiresAt: row.reservation_expires_at,
    customerOpenDealNumber: row.customer_open_deal_number,
    leadDealNumber: row.lead_deal_number,
    listedPrice:
      row.listed_price === null || row.listed_price === undefined ? null : Number(row.listed_price),
  };
}
