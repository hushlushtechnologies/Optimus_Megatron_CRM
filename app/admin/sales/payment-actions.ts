"use server";

import { getPaymentRules } from "@/src/lib/supabase/sales-payment-queries";
import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
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

  // Only changes the payment if it is still in the state the screen showed.
  const { data, error } = await start.supabase
    .from("sales_payments")
    .update({ status: newStatus, status_reason: v.reason.trim() === "" ? null : v.reason.trim() })
    .eq("id", v.id)
    .eq("status", expected)
    .select("id, deal_id, reservation_id");

  if (error) {
    console.error("setPaymentStatusAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  const row = (data ?? [])[0] as { deal_id: string | null; reservation_id: string | null } | undefined;
  if (!row) {
    return {
      error: "This payment was just updated by someone else. Refresh the page to see its current state.",
    };
  }

  refresh(row.deal_id, row.reservation_id);
  return { error: null };
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
