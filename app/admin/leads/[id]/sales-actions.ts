"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import { getLinkableDealsForLead } from "@/src/lib/supabase/lead-sales-queries";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import type { LinkableDealOption, LinkDealResult } from "@/src/lib/types/lead-sales";

/*
|--------------------------------------------------------------------------
| LINK AN EXISTING DEAL TO A LEAD (Phase 15, Feature 2)
|--------------------------------------------------------------------------
|
| Linking is done by the database function link_deal_to_lead, which checks
| the customer match, refuses to move a deal that already belongs to another
| lead, re-checks the permission, and writes the audit entries — all in one
| transaction. This action is the friendly front door, not the only guard.
*/

const linkSchema = z.object({
  leadId: z.string().uuid(),
  dealId: z.string().uuid(),
});

/** The customer's unlinked deals, for the Link dialog. null means the lookup failed. */
export async function getLinkableDealsAction(
  leadId: string,
  customerId: string,
): Promise<LinkableDealOption[] | null> {
  const start = await beginSalesAction("edit");
  if (!start.ok) return null;

  return getLinkableDealsForLead(leadId, customerId);
}

export async function linkDealToLeadAction(input: unknown): Promise<LinkDealResult> {
  const start = await beginSalesAction("edit");
  if (!start.ok) return { error: start.error };

  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a deal to link." };

  const { leadId, dealId } = parsed.data;

  const { data, error } = await start.supabase.rpc("link_deal_to_lead", {
    p_deal_id: dealId,
    p_lead_id: leadId,
  });

  if (error) {
    console.error("linkDealToLeadAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as { out_deal_number: string } | undefined;

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath(`/admin/sales/${dealId}`);
  revalidatePath("/admin/sales");

  return { error: null, dealNumber: row?.out_deal_number };
}

/** Detaches a deal from a lead. The deal itself is untouched. */
export async function unlinkDealFromLeadAction(input: unknown): Promise<LinkDealResult> {
  const start = await beginSalesAction("edit");
  if (!start.ok) return { error: start.error };

  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a deal to unlink." };

  const { leadId, dealId } = parsed.data;

  const { data, error } = await start.supabase.rpc("unlink_deal_from_lead", {
    p_deal_id: dealId,
    p_lead_id: leadId,
  });

  if (error) {
    console.error("unlinkDealFromLeadAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as { out_deal_number: string } | undefined;

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath(`/admin/sales/${dealId}`);
  revalidatePath("/admin/sales");

  return { error: null, dealNumber: row?.out_deal_number };
}