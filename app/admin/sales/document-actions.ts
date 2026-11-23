"use server";

import { revalidatePath } from "next/cache";
import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import { issueDocumentSchema, voidDocumentSchema } from "@/src/lib/validation/sales-documents";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import {
  checkReceiptEligibility,
  receiptRefusal,
} from "@/src/lib/supabase/payment-receipt-queries";
import type { DocumentActionResult, IssueDocumentResult } from "@/src/lib/types/sales-documents";

interface IssuedRow {
  out_id: string;
  out_number: string;
  out_created: boolean;
}

function refresh(dealId: string | null, reservationId: string | null) {
  if (dealId) revalidatePath(`/admin/sales/${dealId}`);
  if (reservationId) revalidatePath(`/admin/reservations/${reservationId}`);
  revalidatePath("/admin/sales");
}

export async function issueDocumentAction(input: unknown): Promise<IssueDocumentResult> {
  const start = await beginSalesAction("documents");
  if (!start.ok) return { error: start.error };

  const parsed = issueDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." };
  }
  const v = parsed.data;

  /*
   * A receipt may only describe a verified, incoming payment.
   *
   * The queue's Receipt button already checks both, but a button is not a
   * control: this action is reachable by anyone holding the documents
   * permission, whatever the screen happened to render. The schema above
   * checks only that a paymentId was supplied.
   *
   * Issuing one for a Recorded payment would have the dealership confirm
   * in writing that it holds money nobody has checked arrived — the
   * sprint's "treat Recorded as Verified", in the customer's hands.
   * Issuing one for a refund would say the opposite of what happened.
   *
   * issue_sales_document may well enforce this too; it is not in this
   * repository, so that cannot be relied on from here.
   */
  if (v.type === "Receipt" && v.paymentId) {
    const refusal = receiptRefusal(await checkReceiptEligibility(v.paymentId));

    if (refusal) return { error: refusal };
  }

  const { data, error } = await start.supabase.rpc("issue_sales_document", {
    p_type: v.type,
    p_deal_id: v.dealId,
    p_reservation_id: v.reservationId,
    p_payment_id: v.paymentId,
    p_note: v.note,
  });

  if (error) {
    console.error("issueDocumentAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as IssuedRow | undefined;
  if (!row) return { error: "The document could not be created. Please try again." };

  refresh(v.dealId, v.reservationId);
  // A receipt belongs to the deal or reservation its payment is on, so refresh both when we only know the payment.
  if (v.type === "Receipt") {
    revalidatePath("/admin/sales", "layout");
    revalidatePath("/admin/reservations", "layout");
  }

  return { error: null, documentId: row.out_id, documentNumber: row.out_number, created: row.out_created };
}

export async function voidDocumentAction(input: unknown): Promise<DocumentActionResult> {
  // A friendly early refusal. The database checks the same permission again.
  const start = await beginSalesAction("cancel");
  if (!start.ok) return { error: start.error };

  const parsed = voidDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." };
  }

  const { error } = await start.supabase.rpc("void_sales_document", {
    p_id: parsed.data.id,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("voidDocumentAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  revalidatePath("/admin/sales", "layout");
  revalidatePath("/admin/reservations", "layout");
  return { error: null };
}
