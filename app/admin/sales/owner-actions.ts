"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import { reassignDealSchema } from "@/src/lib/validation/sales-owner";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import type { OwnerActionResult, OwnerCandidate, OwnerCandidatesResult } from "@/src/lib/types/sales-owner";

interface CandidateRow {
  out_id: string;
  out_name: string;
  out_open_deals: number | string;
  out_awaiting_delivery: number | string;
  out_is_current: boolean;
}

/** Loaded fresh when the hand-over dialog opens. */
export async function getOwnerCandidatesAction(dealId: string): Promise<OwnerCandidatesResult> {
  if (!z.string().uuid().safeParse(dealId).success) return { status: "error" };

  const start = await beginSalesAction("assign");
  if (!start.ok) return { status: "error" };

  const { data, error } = await start.supabase.rpc("list_deal_owner_candidates", { p_deal_id: dealId });
  if (error) {
    console.error("getOwnerCandidatesAction error:", error);
    return { status: "error" };
  }

  const candidates: OwnerCandidate[] = ((data ?? []) as unknown as CandidateRow[]).map((row) => ({
    id: row.out_id,
    name: row.out_name,
    openDeals: Number(row.out_open_deals),
    awaitingDelivery: Number(row.out_awaiting_delivery),
    isCurrent: row.out_is_current,
  }));

  return { status: "ok", candidates };
}

export async function reassignDealAction(input: unknown): Promise<OwnerActionResult> {
  const parsed = reassignDealSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." };
  }
  const v = parsed.data;

  // A friendly early refusal. The database decides who may take or hand over a deal.
  const start = await beginSalesAction("view");
  if (!start.ok) return { error: start.error };

  const { error } = await start.supabase.rpc("reassign_sales_deal", {
    p_deal_id: v.id,
    p_expected_updated_at: v.expectedUpdatedAt,
    p_new_owner: v.newOwnerId,
    p_reason: v.reason,
  });

  if (error) {
    console.error("reassignDealAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  revalidatePath("/admin/sales");
  revalidatePath(`/admin/sales/${v.id}`);
  return { error: null };
}