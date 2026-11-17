"use server";

import { revalidatePath } from "next/cache";
import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import {
  completeDeliverySchema,
  deliveryTemplateSchema,
  planDeliverySchema,
  prepareDeliverySchema,
  setDeliveryItemSchema,
} from "@/src/lib/validation/sales-delivery";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import { dubaiLocalToDate } from "@/src/lib/utils/test-drive-slots";
import type { DeliveryActionResult } from "@/src/lib/types/sales-delivery";

function refresh(dealId: string | null) {
  revalidatePath("/admin/sales");
  if (dealId) revalidatePath(`/admin/sales/${dealId}`);
  else revalidatePath("/admin/sales", "layout");
}

export async function prepareDeliveryAction(input: unknown): Promise<DeliveryActionResult> {
  const start = await beginSalesAction("complete");
  if (!start.ok) return { error: start.error };

  const parsed = prepareDeliverySchema.safeParse(input);
  if (!parsed.success) return { error: "Please refresh the page and try again." };

  const { error } = await start.supabase.rpc("prepare_delivery", { p_deal_id: parsed.data.dealId });
  if (error) {
    console.error("prepareDeliveryAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  refresh(parsed.data.dealId);
  return { error: null };
}

export async function saveDeliveryPlanAction(input: unknown): Promise<DeliveryActionResult> {
  const start = await beginSalesAction("complete");
  if (!start.ok) return { error: start.error };

  const parsed = planDeliverySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the plan and try again." };
  }
  const v = parsed.data;

  const { error } = await start.supabase.rpc("save_delivery_plan", {
    p_deal_id: v.dealId,
    p_expected_updated_at: v.expectedUpdatedAt,
    p_planned_at: dubaiLocalToDate(v.date, v.time).toISOString(),
    p_mode: v.mode,
    p_location_id: v.mode === "showroom" ? v.locationId : null,
    p_address: v.mode === "address" ? v.address : null,
    p_staff_id: v.staffId,
    p_notes: v.notes,
  });

  if (error) {
    console.error("saveDeliveryPlanAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  refresh(v.dealId);
  return { error: null };
}

export async function setDeliveryItemAction(input: unknown): Promise<DeliveryActionResult> {
  const parsed = setDeliveryItemSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." };
  }
  const v = parsed.data;

  // A friendly early refusal. The database checks the same permission again.
  const start = await beginSalesAction(v.action === "waive" || v.action === "unwaive" ? "confirm" : "complete");
  if (!start.ok) return { error: start.error };

  const { error } = await start.supabase.rpc("set_delivery_item", {
    p_item_id: v.itemId,
    p_action: v.action,
    p_expected_state: v.expectedState,
    p_note: v.note,
  });

  if (error) {
    console.error("setDeliveryItemAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  refresh(null);
  return { error: null };
}

export async function completeDeliveryAction(input: unknown): Promise<DeliveryActionResult> {
  const start = await beginSalesAction("complete");
  if (!start.ok) return { error: start.error };

  const parsed = completeDeliverySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." };
  }
  const v = parsed.data;

  const { error } = await start.supabase.rpc("complete_delivery", {
    p_deal_id: v.dealId,
    p_expected_updated_at: v.expectedUpdatedAt,
    p_delivered_at: dubaiLocalToDate(v.date, v.time).toISOString(),
    p_notes: v.notes,
  });

  if (error) {
    console.error("completeDeliveryAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  refresh(v.dealId);
  revalidatePath("/admin/inventory", "layout");
  return { error: null };
}

export async function saveDeliveryTemplateAction(input: unknown): Promise<DeliveryActionResult> {
  const start = await beginSalesAction("settings");
  if (!start.ok) return { error: start.error };

  const parsed = deliveryTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the check and try again." };
  }
  const v = parsed.data;

  if (v.id) {
    const { data, error } = await start.supabase
      .from("sales_delivery_checklist_templates")
      .update({ label: v.label, is_required: v.isRequired, is_active: v.isActive })
      .eq("id", v.id)
      .select("id");

    if (error) {
      console.error("saveDeliveryTemplateAction update error:", error);
      return { error: mapSalesDbError(error) };
    }
    if (!data || data.length === 0) return { error: "That check could not be found." };
  } else {
    const { data: last } = await start.supabase
      .from("sales_delivery_checklist_templates")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await start.supabase.from("sales_delivery_checklist_templates").insert({
      label: v.label,
      is_required: v.isRequired,
      is_active: v.isActive,
      sort_order: Number((last as { sort_order: number } | null)?.sort_order ?? 0) + 10,
    });

    if (error) {
      console.error("saveDeliveryTemplateAction insert error:", error);
      return { error: mapSalesDbError(error) };
    }
  }

  revalidatePath("/admin/sales/settings");
  return { error: null };
}