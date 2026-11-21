"use server";

import { revalidatePath } from "next/cache";
import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import { transitionDealSchema } from "@/src/lib/validation/sales-transition";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import { settleLoyaltyForTransition } from "@/src/lib/supabase/loyalty-settlement";
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

  /*
   * Sprint 8: the deal has moved, so the loyalty programme may owe the
   * customer points — or need to take them back.
   *
   * Deliberately after the transition has committed and deliberately unable
   * to fail it. A sale that completed must stay completed even if the points
   * could not be credited, exactly as a notification must never break the
   * action that triggered it. settleLoyaltyForTransition swallows its own
   * errors for that reason; the worst case is a missing credit, which
   * rebuild_loyalty_wallet() and a re-run of the same transition can both
   * repair, rather than a sale stuck half-finished.
   */
  await settleLoyaltyForTransition({
    supabase: start.supabase,
    dealId: v.id,
    toStatus: row?.out_status ?? v.to,
    actorId: start.userId,
    reason: v.reason ?? null,
  });

  revalidatePath("/admin/sales");
  revalidatePath(`/admin/sales/${v.id}`);
  revalidatePath("/admin/customers");

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
