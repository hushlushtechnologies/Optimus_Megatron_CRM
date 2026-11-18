import type { PaymentDirection, PaymentKind, PaymentMethod, PaymentStatus } from "@/src/lib/types/sales";

/**
 * How many payments one page of the verification queue holds.
 *
 * It lives here, in a module with no server imports, because the queue's
 * client component needs it for pagination. Importing it from
 * sales-payment-queries.ts pulled next/headers into the client bundle.
 */

export type PaymentQueueTab = "awaiting" | "verified" | "closed" | "all";
export type PaymentStatusAction = "verify" | "reject" | "reverse";

export interface PaymentRules {
  /** null when the setting couldn't be loaded. Treated as "yes", the safer answer. */
  separateVerifier: boolean | null;
}

/** One row of public.sales_payment_list. Names are already resolved. */
export interface PaymentQueueRow {
  id: string;
  deal_id: string | null;
  deal_number: string | null;
  reservation_id: string | null;
  reservation_number: string | null;
  direction: PaymentDirection;
  kind: PaymentKind;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  paid_on: string;
  status: PaymentStatus;
  status_reason: string | null;
  notes: string | null;
  recorded_by: string | null;
  recorded_by_name: string;
  recorded_at: string;
  verified_by_name: string | null;
  verified_at: string | null;
  reversed_by_name: string | null;
  reversed_at: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_number: string | null;
  vehicle_title: string | null;
  stock_id: string | null;
}

export interface PaymentSummary {
  awaitingCount: number;
  awaitingAmount: number;
  verifiedMonth: number;
  refundsAwaiting: number;
  closed30d: number;
}

export interface PaymentActionResult {
  error: string | null;
}

/**
 * The outcome of verifying several payments at once.
 *
 * skipped is as important as verified: a payment is passed over when someone
 * else has already acted on it, or when the person recording it is the person
 * verifying it. Reporting it means nobody is left wondering where a row went.
 */
export interface BulkPaymentActionResult {
  error: string | null;
  verified: number;
  skipped: number;
}
