"use server";

import { revalidatePath } from "next/cache";
import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import { feeTypeSchema } from "@/src/lib/validation/sales-pricing";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import { filsToDecimalString, toFils } from "@/src/lib/utils/sales-money";
import type { SettingsActionResult } from "@/src/lib/types/sales-pricing";

/*
|------------------------------------------------------------------------------
| updateSalesSettingsAction was here, and has been removed on purpose.
|------------------------------------------------------------------------------
|
| It wrote all eight editable sales_settings columns in one UPDATE, which was
| right while one form held all eight fields. Sprint 10 splits that form across
| three pages, and an all-columns write from a page that shows two of them
| sends the other six as they were when the page loaded — so saving a hold
| length could put the discount threshold back without a trace.
|
| Replaced by three field-scoped actions in
| app/admin/settings/operations/settings-actions.ts, each writing only its own
| page's columns. The matching schema (salesSettingsSchema) is gone from
| validation/sales-pricing.ts for the same reason: a schema that demands every
| field is an invitation to write every field.
|
| saveFeeTypeAction below is untouched. It always wrote one fee row at a time,
| which is why fees were never part of this problem.
|
|------------------------------------------------------------------------------
*/

function refresh() {
  revalidatePath("/admin/settings/operations/sales");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/reservations");
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
