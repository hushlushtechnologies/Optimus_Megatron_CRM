import type { PaymentDirection, PaymentKind, PaymentMethod, PaymentStatus } from "@/src/lib/types/sales";

import { toFils } from "@/src/lib/utils/sales-money";

/* =========================================================
   BIGINT CONSTANTS
========================================================= */

const ZERO_FILS = BigInt(0);

/* =========================================================
   PAYMENT OPTIONS
========================================================= */

export const PAYMENT_METHODS: PaymentMethod[] = [
  "Cash",
  "Card",
  "Bank Transfer",
  "Cheque",
  "Finance Company",
  "Other",
];

export const DEAL_PAYMENT_KINDS: PaymentKind[] = ["Deposit", "Instalment", "Balance"];

export const RESERVATION_PAYMENT_KINDS: PaymentKind[] = ["Reservation Deposit"];

/* =========================================================
   REFERENCE HELPERS
========================================================= */

/**
 * Everything except cash needs a reference.
 *
 * The reference is also what helps prevent the
 * same payment from being entered twice.
 */
export function referenceRequired(method: PaymentMethod): boolean {
  return method !== "Cash";
}

export function referenceLabel(method: PaymentMethod): string {
  switch (method) {
    case "Bank Transfer":
      return "Transfer reference";

    case "Cheque":
      return "Cheque number";

    case "Card":
      return "Card approval code";

    case "Finance Company":
      return "Finance reference";

    case "Cash":
      return "Receipt number (optional)";

    default:
      return "Reference";
  }
}

/* =========================================================
   PAYMENT-LIKE TYPE
========================================================= */

/**
 * The fields payment lists and dialogs need.
 *
 * Deal payments, reservation payments and
 * verification queue rows all fit this shape.
 */
export interface PaymentLike {
  id: string;

  kind: PaymentKind;

  direction: PaymentDirection;

  amount: number;

  currency: string;

  method: PaymentMethod;

  reference: string | null;

  paid_on: string;

  status: PaymentStatus;

  status_reason: string | null;

  recorded_by: string | null;

  recorded_by_name: string;

  recorded_at: string;

  verified_by_name: string | null;

  verified_at: string | null;

  reversed_by_name: string | null;

  reversed_at: string | null;
}

/* =========================================================
   SIGNED PAYMENT VALUE
========================================================= */

function signed(payment: PaymentLike): bigint {
  const fils = toFils(payment.amount) ?? ZERO_FILS;

  return payment.direction === "in" ? fils : -fils;
}

/* =========================================================
   VERIFIED NET
========================================================= */

/**
 * Money received less refunds,
 * counting only verified payments.
 */
export function verifiedNetFils(payments: readonly PaymentLike[]): bigint {
  return payments
    .filter((payment) => payment.status === "Verified")
    .reduce((total, payment) => total + signed(payment), ZERO_FILS);
}

/* =========================================================
   ACTIVE NET
========================================================= */

/**
 * Money received less refunds,
 * including payments still awaiting verification.
 *
 * This is the value the database limits.
 */
export function activeNetFils(payments: readonly PaymentLike[]): bigint {
  return payments
    .filter((payment) => payment.status === "Recorded" || payment.status === "Verified")
    .reduce((total, payment) => total + signed(payment), ZERO_FILS);
}

/* =========================================================
   REFUNDABLE AMOUNT
========================================================= */

/**
 * The most that can currently be refunded:
 *
 * verified money received
 * minus refunds already verified
 * or still awaiting verification.
 */
export function refundableFils(payments: readonly PaymentLike[]): bigint {
  const total = payments.reduce((sum, payment) => {
    const fils = toFils(payment.amount) ?? ZERO_FILS;

    if (payment.direction === "in" && payment.status === "Verified") {
      return sum + fils;
    }

    if (payment.direction === "out" && (payment.status === "Verified" || payment.status === "Recorded")) {
      return sum - fils;
    }

    return sum;
  }, ZERO_FILS);

  return total > ZERO_FILS ? total : ZERO_FILS;
}
