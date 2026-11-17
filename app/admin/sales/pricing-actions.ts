"use server";

import { revalidatePath } from "next/cache";
import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import { approveDiscountSchema, savePricingSchema } from "@/src/lib/validation/sales-pricing";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import { filsToDecimalString, toFils } from "@/src/lib/utils/sales-money";
import type { SavePricingResult, SettingsActionResult } from "@/src/lib/types/sales-pricing";

interface SavedRow {
  out_updated_at: string;
  out_needs_approval: boolean;
}

function refresh(id: string) {
  revalidatePath("/admin/sales");
  revalidatePath(`/admin/sales/${id}`);
}

export async function saveDealPricingAction(input: unknown): Promise<SavePricingResult> {
  const start = await beginSalesAction("edit");
  if (!start.ok) return { error: start.error };

  const parsed = savePricingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." };
  }
  const v = parsed.data;

  const proposed = toFils(v.proposedPrice);
  const ZERO_FILS = BigInt(0);

const discount =
  v.discountAmount === ""
    ? ZERO_FILS
    : toFils(v.discountAmount);
  if (proposed === null || discount === null) return { error: "Please check the amounts and try again." };

  if (v.approveNow && !start.permissions.approveDiscount) {
    return { error: "You don't have permission to approve discounts." };
  }

  const { data, error } = await start.supabase.rpc("save_deal_pricing", {
    p_deal_id: v.id,
    p_expected_updated_at: v.expectedUpdatedAt,
    p_proposed: filsToDecimalString(proposed),
    p_discount: filsToDecimalString(discount),
    p_fee_type_ids: v.feeTypeIds,
    p_note: v.note,
  });

  if (error) {
    console.error("saveDealPricingAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as SavedRow | undefined;
  refresh(v.id);

  // Approving in the same step: the pricing is already saved, so a problem here is a warning.
  if (v.approveNow && row?.out_needs_approval) {
    const approval = await start.supabase.rpc("approve_deal_discount", {
      p_deal_id: v.id,
      p_expected_updated_at: row.out_updated_at,
      p_note: v.note,
    });

    if (approval.error) {
      console.error("saveDealPricingAction approval error:", approval.error);
      return {
        error: null,
        warning: `Pricing saved, but the discount couldn't be approved: ${mapSalesDbError(approval.error)}`,
      };
    }
    refresh(v.id);
  }

  return { error: null };
}

export async function approveDealDiscountAction(input: unknown): Promise<SettingsActionResult> {
  const start = await beginSalesAction("approveDiscount");
  if (!start.ok) return { error: start.error };

  const parsed = approveDiscountSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." };
  }
  const v = parsed.data;

  const { error } = await start.supabase.rpc("approve_deal_discount", {
    p_deal_id: v.id,
    p_expected_updated_at: v.expectedUpdatedAt,
    p_note: v.note,
  });

  if (error) {
    console.error("approveDealDiscountAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  refresh(v.id);
  return { error: null };
}