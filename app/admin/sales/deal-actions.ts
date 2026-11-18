"use server";

import { revalidatePath } from "next/cache";
import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import { transitionDealSchema } from "@/src/lib/validation/sales-transition";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import type { SalesDealStatus } from "@/src/lib/types/sales";
import type { CancellationReason, TransitionResult } from "@/src/lib/types/sales-actions";

const PERMISSION_FOR = {
  Negotiation: "edit",
  Reserved: "edit",
  Confirmed: "confirm",
  Cancelled: "cancel",
} as const;

interface TransitionRow {
  out_status: SalesDealStatus;
}

export async function transitionDealAction(input: unknown): Promise<TransitionResult> {
  const parsed = transitionDealSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." };
  }
  const v = parsed.data;

  // A friendly early refusal. The database function checks the same permission again.
  const start = await beginSalesAction(PERMISSION_FOR[v.to]);
  if (!start.ok) return { error: start.error };

  const { data, error } = await start.supabase.rpc("transition_sales_deal", {
    p_deal_id: v.id,
    p_to: v.to,
    p_expected_updated_at: v.expectedUpdatedAt,
    p_reason_id: v.reasonId,
    p_reason: v.reason,
    p_refund_note: v.refundNote,
  });

  if (error) {
    console.error("transitionDealAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as TransitionRow | undefined;

  revalidatePath("/admin/sales");
  revalidatePath(`/admin/sales/${v.id}`);

  return { error: null, newStatus: row?.out_status };
}

/** Loaded fresh when the cancel dialog opens. null means the lookup failed. */
export async function getCancellationReasonsAction(): Promise<CancellationReason[] | null> {
  const start = await beginSalesAction("cancel");
  if (!start.ok) return null;

  const { data, error } = await start.supabase
    .from("sales_cancellation_reasons")
    .select("id, name, requires_detail")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    console.error("getCancellationReasonsAction error:", error);
    return null;
  }
  return (data ?? []) as unknown as CancellationReason[];
}
