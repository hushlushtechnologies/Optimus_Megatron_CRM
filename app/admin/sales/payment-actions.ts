"use server";

import { getPaymentRules } from "@/src/lib/supabase/sales-payment-queries";
import { beginSalesAction, type SalesSupabaseClient } from "@/src/lib/supabase/sales-permissions";
import type { BulkPaymentActionResult, PaymentActionResult } from "@/src/lib/types/sales-payments";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import { filsToDecimalString, toFils } from "@/src/lib/utils/sales-money";
import { getDubaiToday } from "@/src/lib/utils/test-drive-format";
import {
  recordPaymentSchema,
  setPaymentStatusSchema,
  verifyPaymentsSchema,
} from "@/src/lib/validation/sales-payments";
import { revalidatePath } from "next/cache";

function refresh(dealId: string | null, reservationId: string | null) {
  revalidatePath("/admin/sales");
  revalidatePath("/admin/sales/payments");
  revalidatePath("/admin/reservations");
  if (dealId) revalidatePath(`/admin/sales/${dealId}`);
  if (reservationId) revalidatePath(`/admin/reservations/${reservationId}`);
}

export async function recordPaymentAction(input: unknown): Promise<PaymentActionResult> {
  const start = await beginSalesAction("paymentsRecord");
  if (!start.ok) return { error: start.error };

  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the payment and try again." };
  }
  const v = parsed.data;

  if (v.kind === "Refund" && !start.permissions.paymentsReverse) {
    return { error: "Only people who can reverse payments may record refunds." };
  }
  if (v.paidOn > getDubaiToday()) return { error: "The payment date can't be in the future." };

  const fils = toFils(v.amount);
  if (fils === null) return { error: "Please check the amount and try again." };

  const { error } = await start.supabase.from("sales_payments").insert({
    deal_id: v.dealId,
    reservation_id: v.reservationId,
    direction: v.kind === "Refund" ? "out" : "in",
    kind: v.kind,
    amount: filsToDecimalString(fils),
    method: v.method,
    reference: v.reference === "" ? null : v.reference,
    paid_on: v.paidOn,
    notes: v.notes.trim() === "" ? null : v.notes.trim(),
  });

  if (error) {
    console.error("recordPaymentAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  refresh(v.dealId, v.reservationId);
  return { error: null };
}

export async function setPaymentStatusAction(input: unknown): Promise<PaymentActionResult> {
  const parsed = setPaymentStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." };
  }
  const v = parsed.data;

  // A friendly early refusal. The database checks the same permission again.
  const start = await beginSalesAction(v.action === "reverse" ? "paymentsReverse" : "paymentsVerify");
  if (!start.ok) return { error: start.error };

  const newStatus = v.action === "verify" ? "Verified" : v.action === "reject" ? "Rejected" : "Reversed";
  const expected = v.action === "reverse" ? "Verified" : "Recorded";

  /*
   * SPRINT 9 PHASE 1 FINDING: the separate-verifier policy was enforced when
   * verifying several payments at once and NOT when verifying one.
   *
   * verifyPaymentsAction read the rule and added
   * `.neq("recorded_by", userId)`. This function read the permission, checked
   * the expected status, and never consulted the rule at all —
   * getPaymentRules was imported at the top of the file and called only by
   * the bulk path. So a person could verify a payment they had recorded
   * themselves by acting on it one at a time, while the same action in bulk
   * was refused.
   *
   * Separation of duties is the control that makes verification mean
   * anything, so the gap is closed here rather than left to the database.
   *
   * It applies to verification only, matching the bulk behaviour and the
   * policy's name. Rejecting a payment you recorded is fine — you are saying
   * your own entry was wrong — and reversal is already gated behind the
   * stronger paymentsReverse permission.
   *
   * null (the setting could not be read) is treated as "required", the safer
   * answer, exactly as the bulk path treats it.
   */
  const rules = await getPaymentRules();
  const needsOtherVerifier = v.action === "verify" && rules.separateVerifier !== false;

  // Only changes the payment if it is still in the state the screen showed.
  let update = start.supabase
    .from("sales_payments")
    .update({ status: newStatus, status_reason: v.reason.trim() === "" ? null : v.reason.trim() })
    .eq("id", v.id)
    .eq("status", expected);

  if (needsOtherVerifier) update = update.neq("recorded_by", start.userId);

  const { data, error } = await update.select("id, deal_id, reservation_id");

  if (error) {
    console.error("setPaymentStatusAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  const row = (data ?? [])[0] as { deal_id: string | null; reservation_id: string | null } | undefined;

  if (!row) {
    /*
     * Nothing changed, and there are now two reasons why: somebody else got
     * there first, or this person recorded the payment themselves. Saying the
     * wrong one sends them to refresh a page that will look unchanged, so the
     * reason is read back before answering.
     *
     * One extra query, only on the failure path.
     */
    return { error: await explainNoChange(start.supabase, v.id, start.userId, expected, needsOtherVerifier) };
  }

  refresh(row.deal_id, row.reservation_id);
  return { error: null };
}

/**
 * Why an update matched no row.
 *
 * Deliberately specific. "Refresh to see the latest status" is the right
 * message for a race and the wrong one for a policy refusal — the status will
 * not have changed, so the person refreshes, sees the same screen, and tries
 * again.
 */
async function explainNoChange(
  /* SalesSupabaseClient, not a conditional infer on BeginSalesResult — that
     resolves to never, and the error points at the call site rather than the
     type. The permissions module already exports the client type. */
  supabase: SalesSupabaseClient,
  paymentId: string,
  userId: string,
  expectedStatus: string,
  verifierRuleApplied: boolean,
): Promise<string> {
  const { data } = await supabase
    .from("sales_payments")
    .select("status, recorded_by")
    .eq("id", paymentId)
    .maybeSingle();

  const current = data as { status: string; recorded_by: string | null } | null;

  if (!current) {
    return "That payment is no longer there. Refresh the page to see the current list.";
  }

  if (verifierRuleApplied && current.recorded_by === userId && current.status === expectedStatus) {
    return "You recorded this payment, so someone else has to verify it. This showroom requires a separate verifier.";
  }

  return "This payment was just updated by someone else. Refresh the page to see its current state.";
}

/**
 * Verifies several payments in one request.
 *
 * Deliberately the same guards as verifying one at a time, applied in the
 * database rather than in a loop: only payments still sitting at Recorded are
 * touched, and when the showroom requires a separate verifier, anything this
 * person recorded themselves is left alone. The caller is told how many were
 * passed over so the screen can say so.
 */
export async function verifyPaymentsAction(input: unknown): Promise<BulkPaymentActionResult> {
  const start = await beginSalesAction("paymentsVerify");
  if (!start.ok) return { error: start.error, verified: 0, skipped: 0 };

  const parsed = verifyPaymentsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please choose the payments again.",
      verified: 0,
      skipped: 0,
    };
  }

  const ids = [...new Set(parsed.data.ids)];

  // null (the setting couldn't be read) is treated as "yes", the safer answer.
  const rules = await getPaymentRules();
  const needsOther = rules.separateVerifier !== false;

  let query = start.supabase
    .from("sales_payments")
    .update({ status: "Verified", status_reason: null })
    .in("id", ids)
    .eq("status", "Recorded");

  if (needsOther) query = query.neq("recorded_by", start.userId);

  const { data, error } = await query.select("id, deal_id, reservation_id");

  if (error) {
    console.error("verifyPaymentsAction error:", error);
    return { error: mapSalesDbError(error), verified: 0, skipped: 0 };
  }

  const rows = (data ?? []) as { deal_id: string | null; reservation_id: string | null }[];

  /*
   * One revalidation per affected deal, not per payment, so verifying twenty
   * payments on one deal doesn't queue twenty identical refreshes.
   */
  const deals = new Set(rows.map((row) => row.deal_id).filter((id): id is string => id !== null));
  const reservations = new Set(
    rows.map((row) => row.reservation_id).filter((id): id is string => id !== null),
  );

  revalidatePath("/admin/sales");
  revalidatePath("/admin/sales/payments");
  revalidatePath("/admin/reservations");
  for (const id of deals) revalidatePath(`/admin/sales/${id}`);
  for (const id of reservations) revalidatePath(`/admin/reservations/${id}`);

  return { error: null, verified: rows.length, skipped: ids.length - rows.length };
}
