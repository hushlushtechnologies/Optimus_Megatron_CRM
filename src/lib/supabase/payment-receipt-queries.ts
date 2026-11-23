import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { receiptEligibility, type ReceiptCheck } from "@/src/lib/utils/receipt-eligibility";

export { receiptRefusal } from "@/src/lib/utils/receipt-eligibility";
export type { ReceiptCheck };

/*
|--------------------------------------------------------------------------
| MAY A RECEIPT BE ISSUED FOR THIS PAYMENT? (Phase 13)
|--------------------------------------------------------------------------
|
| Receipts already exist: issueDocumentAction calls issue_sales_document,
| which writes a numbered record into the document register. This module
| does not replace any of that. It closes a gap in front of it.
|
| THE GAP
|
| The queue only offers the Receipt button when the payment is Verified and
| incoming — PaymentRowActions checks both. But issueDocumentAction itself
| checks neither. It validates that a paymentId is present and hands it to
| the database.
|
| issue_sales_document is not in this repository, so whether IT checks the
| payment's status cannot be established from the code. If it does not, then
| the only thing standing between a Recorded payment and a printed receipt
| is a conditional render — and a server action is callable by anyone who
| can reach the application with the documents permission, button or no
| button.
|
| A receipt for an unverified payment is the dealership confirming in
| writing that it holds money nobody has checked arrived. That is the
| sprint's "treat Recorded as Verified" in its most expensive form, because
| the artefact ends up in the customer's hands.
|
| So the rule is enforced here, on the server, whatever the database
| function turns out to do. If the database already enforces it, this check
| is redundant and costs one indexed lookup. If it does not, this is the
| control.
*/


/**
 * Read a payment's status and direction and decide whether it may have a
 * receipt.
 *
 * Uses the RLS-respecting client, so a payment this person cannot see
 * reads as missing — the same answer they would get for an id that does
 * not exist, which is the right one.
 */
export async function checkReceiptEligibility(paymentId: string): Promise<ReceiptCheck> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_payment_list")
    .select("status, direction")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) {
    console.error("Receipt eligibility lookup failed:", error);
    return { eligibility: null, error: error.message, missing: false };
  }

  if (!data) return { eligibility: null, error: null, missing: true };

  const row = data as { status: string | null; direction: string | null };

  return {
    eligibility: receiptEligibility({
      status: row.status ?? "",
      direction: row.direction ?? "",
    }),
    error: null,
    missing: false,
  };
}
