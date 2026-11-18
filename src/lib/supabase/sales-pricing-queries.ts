import { createClient } from "@/src/lib/supabase/server";
import type { DealFee, FeeMode, FeeType, PricingExtras } from "@/src/lib/types/sales-pricing";

interface FeeRow {
  id: string;
  fee_type_id: string | null;
  name: string;
  calc_mode: FeeMode;
  rate: number | string;
  amount: number | string;
}

interface FeeTypeRow {
  id: string;
  name: string;
  calc_mode: FeeMode;
  value: number | string;
  is_active: boolean;
  sort_order: number;
}

export function toFeeType(row: FeeTypeRow): FeeType {
  return {
    id: row.id,
    name: row.name,
    calc_mode: row.calc_mode,
    value: Number(row.value),
    is_active: row.is_active,
    sort_order: Number(row.sort_order),
  };
}

/** The fees on this deal, the fee types the editor can offer, and whether fees are switched on. */
export async function getDealPricingExtras(dealId: string): Promise<PricingExtras> {
  const supabase = await createClient();

  const [fees, types, settings] = await Promise.all([
    supabase
      .from("sales_deal_fees")
      .select("id, fee_type_id, name, calc_mode, rate, amount")
      .eq("deal_id", dealId)
      .order("created_at")
      .order("name"),
    supabase
      .from("sales_fee_types")
      .select("id, name, calc_mode, value, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase.from("sales_settings").select("fees_enabled").maybeSingle(),
  ]);

  [fees.error, types.error, settings.error].forEach((error) => {
    if (error) console.error("getDealPricingExtras error:", error);
  });

  return {
    fees: fees.error
      ? null
      : ((fees.data ?? []) as unknown as FeeRow[]).map((row): DealFee => ({
          id: row.id,
          fee_type_id: row.fee_type_id,
          name: row.name,
          calc_mode: row.calc_mode,
          rate: Number(row.rate),
          amount: Number(row.amount),
        })),
    feeTypes: types.error ? null : ((types.data ?? []) as unknown as FeeTypeRow[]).map(toFeeType),
    feesEnabled:
      settings.error || !settings.data
        ? null
        : Boolean((settings.data as { fees_enabled: boolean }).fees_enabled),
  };
}
