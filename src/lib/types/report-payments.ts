import type { ReportFigure } from "@/src/lib/supabase/report-aggregate";
import type { Money } from "@/src/lib/utils/report-money";
import type { NamedCount } from "@/src/lib/types/report-customers";

/*
|--------------------------------------------------------------------------
| THE PAYMENTS AND COLLECTIONS REPORT
|--------------------------------------------------------------------------
|
| The most dangerous report in the sprint, because every figure on it looks
| like money in the bank and only some of them are.
|
| FOUR DISTINCTIONS THIS REPORT EXISTS TO KEEP
|
| ONE: COLLECTED IS NOT NET.
|
| The Sprint 6 card labelled "Collected" summed every verified payment with
| its direction applied — so it was net of refunds, under a name that says
| gross. Somebody reconciling a month against a bank statement would find it
| short by exactly the refunds and have no way to see why.
|
| Collected, refunded and net are three figures here. Collected is money in.
| Refunded is money out. Net is the difference, and is labelled as such.
| Never one number wearing another one's name.
|
| TWO: RECORDED IS NOT VERIFIED.
|
| A Recorded payment is one person's claim that money arrived. A Verified
| one has been confirmed by somebody else. Only Verified counts toward what
| a customer has paid — that rule is in the transition map and in
| verifiedNetFils, and it is the rule this report must not quietly break.
|
| So nothing awaiting verification is added to collected. It is reported
| beside it, as its own figure, labelled as a claim rather than a receipt.
| The two are never summed, anywhere on the page or in the export.
|
| THREE: A REFUND IS NOT A NEGATIVE COLLECTION.
|
| direction = "out" is money leaving. It reduces net; it never increases
| collected, and it is never folded into a collection figure to make the
| arithmetic simpler. A month where AED 500,000 came in and AED 100,000 went
| out is not a month where AED 400,000 came in.
|
| FOUR: REJECTED AND REVERSED ARE NOT ZERO.
|
| Both are terminal states, both mean the money is not there, and both are
| reported — as counts, so a month with eleven reversals looks different
| from a quiet one. Dropping them would make the page look healthier than
| the ledger.
*/

/** Statuses that mean money actually moved and stayed. */
export const SETTLED_STATUS = "Verified";

/** A claim awaiting a second pair of eyes. Never counted as collected. */
export const AWAITING_STATUS = "Recorded";

export const COLLECTED_DEFINITION =
  "Verified payments received, before any refunds. This is money in, not money kept.";

export const NET_DEFINITION =
  "Collected less refunded. This is what the dealership kept from the period.";

export const AWAITING_NOTE =
  "Payments awaiting verification are one person's record that money arrived, not a confirmation that it did. They are shown separately and are never added to collected.";

export const RECONCILIATION_NOTE =
  "Nothing on this page is matched against a bank statement automatically — there is no banking or gateway integration. This is a worksheet: it groups verified payments the way a statement does so somebody can tick them off by hand.";

export interface MethodTotalRow {
  id: string;
  method: string;
  /** Verified incoming payments taken by this method. */
  count: number;
  collected: Money;
  /** Verified outgoing payments by this method. */
  refundCount: number;
  refunded: Money;
  net: Money;
}

export interface DailyTotalRow {
  /** The Dubai calendar date, as stored in paid_on. */
  id: string;
  date: string;
  count: number;
  collected: Money;
  refunded: Money;
  net: Money;
}

export interface RefundRow {
  id: string;
  paidOn: string;
  dealNumber: string | null;
  customerName: string | null;
  method: string;
  amount: Money;
  reason: string | null;
  recordedByName: string;
  verifiedByName: string | null;
  status: string;
}

export interface AgedPaymentRow {
  id: string;
  paidOn: string;
  dealNumber: string | null;
  customerName: string | null;
  method: string;
  amount: Money;
  recordedByName: string;
  /** Whole days between paid_on and today, in Dubai. */
  daysWaiting: number;
}

export interface PaymentsReportData {
  /* ---- money in ---- */

  /** Verified, direction in. Gross. */
  collected: ReportFigure<Money>;
  collectedCount: ReportFigure<number>;
  /** Verified, direction out. Shown positive. */
  refunded: ReportFigure<Money>;
  refundCount: ReportFigure<number>;
  /** Collected less refunded. */
  net: ReportFigure<Money>;
  /** Collected divided by the number of incoming payments. */
  averagePayment: ReportFigure<Money | null>;

  /* ---- not yet money ---- */

  awaitingCount: ReportFigure<number>;
  awaitingAmount: ReportFigure<Money>;
  /** The oldest unverified payment, in whole days. */
  oldestAwaitingDays: ReportFigure<number | null>;

  /* ---- did not stick ---- */

  rejectedCount: ReportFigure<number>;
  reversedCount: ReportFigure<number>;
  reversedAmount: ReportFigure<Money>;

  /* ---- breakdowns ---- */

  byMethod: ReportFigure<MethodTotalRow[]>;
  byKind: ReportFigure<NamedCount[]>;
  byDay: ReportFigure<DailyTotalRow[]>;
  refunds: ReportFigure<RefundRow[]>;
  aged: ReportFigure<AgedPaymentRow[]>;

  currency: string;
  rangeLabel: string;
}

export interface PaymentsMetric {
  id: string;
  label: string;
  definition: string;
  basis: string;
  financial: boolean;
  group: "collection" | "awaiting" | "failed";
}

export const PAYMENTS_METRICS: readonly PaymentsMetric[] = [
  {
    id: "collected",
    label: "Collected",
    definition: COLLECTED_DEFINITION,
    basis: "Payment date",
    financial: true,
    group: "collection",
  },
  {
    id: "collectedCount",
    label: "Payments received",
    definition: "Verified incoming payments in the period.",
    basis: "Payment date",
    financial: false,
    group: "collection",
  },
  {
    id: "refunded",
    label: "Refunded",
    definition:
      "Verified payments going out, shown as a positive number. Money returned to customers — never counted as collection.",
    basis: "Payment date",
    financial: true,
    group: "collection",
  },
  {
    id: "refundCount",
    label: "Refunds issued",
    definition: "Verified outgoing payments in the period.",
    basis: "Payment date",
    financial: false,
    group: "collection",
  },
  {
    id: "net",
    label: "Net collected",
    definition: NET_DEFINITION,
    basis: "Payment date",
    financial: true,
    group: "collection",
  },
  {
    id: "averagePayment",
    label: "Average payment",
    definition:
      "Collected divided by the number of incoming payments. Blank when none were received.",
    basis: "Payment date",
    financial: true,
    group: "collection",
  },
  {
    id: "awaitingCount",
    label: "Awaiting verification",
    definition:
      "Payments recorded but not yet confirmed by a second person. Not collected, and not counted as such.",
    basis: "Payment date",
    financial: false,
    group: "awaiting",
  },
  {
    id: "awaitingAmount",
    label: "Value awaiting",
    definition:
      "What those unverified payments claim to be worth. A claim, not a balance — do not add it to collected.",
    basis: "Payment date",
    financial: true,
    group: "awaiting",
  },
  {
    id: "oldestAwaitingDays",
    label: "Oldest unverified",
    definition:
      "Days since the oldest payment still awaiting verification was taken. A verification queue that is not being worked shows up here first.",
    basis: "current",
    financial: false,
    group: "awaiting",
  },
  {
    id: "rejectedCount",
    label: "Rejected",
    definition:
      "Payments refused at verification in the period. The money never arrived or could not be confirmed.",
    basis: "Payment date",
    financial: false,
    group: "failed",
  },
  {
    id: "reversedCount",
    label: "Reversed",
    definition:
      "Payments reversed after having been verified. The record stays; the money is taken back out of the totals.",
    basis: "Payment date",
    financial: false,
    group: "failed",
  },
  {
    id: "reversedAmount",
    label: "Value reversed",
    definition:
      "What those reversed payments were worth. Already excluded from collected and from net.",
    basis: "Payment date",
    financial: true,
    group: "failed",
  },
];
