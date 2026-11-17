"use server";

import { revalidatePath } from "next/cache";
import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import { recordPaymentSchema, setPaymentStatusSchema } from "@/src/lib/validation/sales-payments";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import { filsToDecimalString, toFils } from "@/src/lib/utils/sales-money";
import { getDubaiToday } from "@/src/lib/utils/test-drive-format";
import type { PaymentActionResult } from "@/src/lib/types/sales-payments";

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
    return { error: "This payment was just updated by someone else. Refresh the page to see its current state." };
  }

  refresh(row.deal_id, row.reservation_id);
  return { error: null };
}