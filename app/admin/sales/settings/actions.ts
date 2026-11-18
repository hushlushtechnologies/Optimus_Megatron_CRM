"use server";

import { revalidatePath } from "next/cache";
import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import { feeTypeSchema, salesSettingsSchema } from "@/src/lib/validation/sales-pricing";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import { filsToDecimalString, toFils } from "@/src/lib/utils/sales-money";
import type { SettingsActionResult } from "@/src/lib/types/sales-pricing";

function refresh() {
  revalidatePath("/admin/sales/settings");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/reservations");
}

export async function updateSalesSettingsAction(input: unknown): Promise<SettingsActionResult> {
  const start = await beginSalesAction("settings");
  if (!start.ok) return { error: start.error };

  const parsed = salesSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the settings and try again." };
  }
  const v = parsed.data;

  let depositValue = "0";
  if (v.depositMode === "fixed") {
    const fils = toFils(v.depositValue);
    if (fils === null) return { error: "Please check the deposit amount." };
    depositValue = filsToDecimalString(fils);
  } else if (v.depositMode === "percent") {
    depositValue = v.depositValue;
  }

  const { data, error } = await start.supabase
    .from("sales_settings")
    .update({
      discount_auto_approve_percent: v.discountAutoApprovePercent,
      fees_enabled: v.feesEnabled,
      reservation_default_days: v.reservationDefaultDays,
      reservation_max_days: v.reservationMaxDays,
      reservation_deposit_mode: v.depositMode,
      reservation_deposit_value: depositValue,
      confirm_min_deposit_percent: v.confirmMinDepositPercent,
      payments_require_separate_verifier: v.separateVerifier,
      updated_by: start.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");

  if (error) {
    console.error("updateSalesSettingsAction error:", error);
    return { error: mapSalesDbError(error) };
  }
  if (!data || data.length === 0) {
    return { error: "The settings could not be saved. You may not have permission to change them." };
  }

  refresh();
  return { error: null };
}

export async function saveFeeTypeAction(input: unknown): Promise<SettingsActionResult> {
  const start = await beginSalesAction("settings");
  if (!start.ok) return { error: start.error };

  const parsed = feeTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the fee and try again." };
  }
  const v = parsed.data;

  let value = v.value;
  if (v.calcMode === "fixed") {
    const fils = toFils(v.value);
    if (fils === null) return { error: "Please check the fee amount." };
    value = filsToDecimalString(fils);
  }

  if (v.id) {
    const { data, error } = await start.supabase
      .from("sales_fee_types")
      .update({ name: v.name, calc_mode: v.calcMode, value, is_active: v.isActive })
      .eq("id", v.id)
      .select("id");

    if (error) {
      console.error("saveFeeTypeAction update error:", error);
      return { error: mapSalesDbError(error) };
    }
    if (!data || data.length === 0) return { error: "That fee could not be found." };
  } else {
    const { data: last } = await start.supabase
      .from("sales_fee_types")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await start.supabase.from("sales_fee_types").insert({
      name: v.name,
      calc_mode: v.calcMode,
      value,
      is_active: v.isActive,
      sort_order: Number((last as { sort_order: number } | null)?.sort_order ?? 0) + 10,
    });

    if (error) {
      console.error("saveFeeTypeAction insert error:", error);
      return { error: mapSalesDbError(error) };
    }
  }

  refresh();
  return { error: null };
}
