import { createClient } from "@/src/lib/supabase/server";
import {
  AGGREGATE_PAGE,
  figureFrom,
  interpretCounted,
  type ReportFigure,
} from "@/src/lib/supabase/report-aggregate";
import { averageFils, money, sumFils, type Money } from "@/src/lib/utils/report-money";
import {
  bucketPayments,
  dailyTotals,
  methodTotals,
  paymentTotals,
} from "@/src/lib/utils/payment-totals";
import { resolveReportRange, type ReportRangeId } from "@/src/lib/utils/report-time";
import { daysBetweenDubai } from "@/src/lib/utils/report-grouping";
import type { ReportFilters } from "@/src/lib/utils/report-filters";
import type { NamedCount } from "@/src/lib/types/report-customers";
import {
  AWAITING_STATUS,
  SETTLED_STATUS,
  type AgedPaymentRow,
  type DailyTotalRow,
  type MethodTotalRow,
  type PaymentsReportData,
  type RefundRow,
} from "@/src/lib/types/report-payments";

/*
|--------------------------------------------------------------------------
| THE PAYMENTS AND COLLECTIONS REPORT
|--------------------------------------------------------------------------
|
| One pass over sales_payment_list for the period, then every figure derived
| from those rows in memory. The alternative — a query per figure — would
| give eleven chances for two figures that must reconcile to be computed
| from two slightly different sets.
|
| THE DATE COLUMN
|
| paid_on is a calendar DATE, written from getDubaiToday(). Filtering a date
| column with a full ISO timestamp makes Postgres coerce one side to the
| other, and which way it goes depends on the session timezone — a boundary
| error on the most important figure in the module. Sprint 9 Batch 1 fixed
| this in the sales report; the same rule applies here. Date columns get
| date bounds, inclusive at both ends.
|
| WHAT IS COUNTED AS WHAT
|
|   collected   status Verified, direction in
|   refunded    status Verified, direction out      (reported positive)
|   net         collected − refunded
|   awaiting    status Recorded, either direction   (NEVER added to collected)
|   rejected    status Rejected
|   reversed    status Reversed
|
| Every one of those is a filter on the same row set, so they reconcile by
| construction: a row can only be in one status bucket, and the collected
| and refunded halves cannot overlap because direction is one or the other.
*/

interface PaymentRow {
  id: string;
  amount: number | string | null;
  direction: "in" | "out";
  status: string;
  kind: string;
  method: string;
  paid_on: string;
  status_reason: string | null;
  deal_number: string | null;
  customer_name: string | null;
  recorded_by_name: string | null;
  verified_by_name: string | null;
}

/** Rows that settled: the money moved and stayed. */
const isSettled = (row: PaymentRow) => row.status === SETTLED_STATUS;
const isIncoming = (row: PaymentRow) => row.direction === "in";
const isOutgoing = (row: PaymentRow) => row.direction === "out";

export async function getPaymentsReport(
  range: ReportRangeId,
  filters: ReportFilters,
  options: { customFrom?: string; customTo?: string } = {},
): Promise<PaymentsReportData> {
  const supabase = await createClient();

  const resolved = resolveReportRange(range, {
    customFrom: options.customFrom,
    customTo: options.customTo,
  });

  const { fromDate, toDate, label: rangeLabel } = resolved;

  const { data: settings } = await supabase.from("sales_settings").select("currency").maybeSingle();
  const currency = (settings?.currency as string | undefined) ?? "AED";

  let query = supabase
    .from("sales_payment_list")
    .select(
      "id, amount, direction, status, kind, method, paid_on, status_reason, deal_number, customer_name, recorded_by_name, verified_by_name",
      { count: "exact" },
    )
    /* Date bounds on a date column, inclusive both ends. */
    .lte("paid_on", toDate)
    .order("paid_on", { ascending: false })
    .limit(AGGREGATE_PAGE * 2);

  if (fromDate) query = query.gte("paid_on", fromDate);
  if (filters.paymentMethod) query = query.eq("method", filters.paymentMethod);
  if (filters.status) query = query.eq("status", filters.status);

  const result = await query;

  const counted = interpretCounted<PaymentRow>(result, AGGREGATE_PAGE * 2, "payments");

  /* ---- the buckets, and the totals derived from them ---- */

  const buckets = bucketPayments(counted.rows);
  const totals = paymentTotals(buckets, currency);

  const { settledIn, awaiting, rejected, reversed } = buckets;

  const totalOf = (rows: PaymentRow[]): Money =>
    money(
      sumFils(rows, (row) => row.amount),
      currency,
    );

  /*
   * A status this code has not been taught about is logged rather than
   * silently dropped. It cannot be shown on the page — there is no label
   * for it — but a payment that vanishes from every total is the kind of
   * thing that should leave a trace somewhere.
   */
  if (buckets.unknown.length > 0) {
    console.warn(
      `Payments report: ${buckets.unknown.length} payment(s) in an unrecognised status:`,
      Array.from(new Set(buckets.unknown.map((row) => row.status))),
    );
  }

  /* ---- breakdowns ---- */

  const byMethod = figureFrom(counted, () => methodTotals(buckets, currency));

  const byKind = figureFrom<PaymentRow, NamedCount[]>(counted, () => {
    const groups = new Map<string, number>();

    for (const row of settledIn) {
      const name = row.kind?.trim() || "Not set";
      groups.set(name, (groups.get(name) ?? 0) + 1);
    }

    return Array.from(groups.entries())
      .map(([name, count]) => ({ id: name, name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  });

  /*
   * The daily worksheet. Grouped by paid_on exactly as stored, because the
   * point of this table is to line up against a bank statement, and a
   * statement is organised by the day the money moved.
   */
  /*
   * The daily worksheet, for reconciling by hand against a statement.
   */
  const byDay = figureFrom(counted, () => dailyTotals(buckets, currency));

  /*
   * Refunds listed individually rather than only totalled. A refund is an
   * exception, and the question anybody asks about the total is "which
   * ones" — a figure with no list behind it sends somebody to the database.
   */
  const refunds = figureFrom<PaymentRow, RefundRow[]>(counted, () =>
    counted.rows
      .filter((row) => isOutgoing(row) && row.status !== "Rejected")
      .map((row) => ({
        id: row.id,
        paidOn: row.paid_on,
        dealNumber: row.deal_number,
        customerName: row.customer_name,
        method: row.method,
        amount: money(sumFils([row], (one) => one.amount), currency),
        reason: row.status_reason,
        recordedByName: row.recorded_by_name ?? "Unknown",
        verifiedByName: row.verified_by_name,
        status: row.status,
      }))
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
  );

  /*
   * Unverified payments, oldest first. This is the one table on the report
   * that is about the process rather than the money: a payment sitting
   * unverified for three weeks is either a control that is not being worked
   * or money that never actually arrived, and both need somebody to look.
   */
  const aged = figureFrom<PaymentRow, AgedPaymentRow[]>(counted, () =>
    awaiting
      .filter(isIncoming)
      .map((row) => ({
        id: row.id,
        paidOn: row.paid_on,
        dealNumber: row.deal_number,
        customerName: row.customer_name,
        method: row.method,
        amount: money(sumFils([row], (one) => one.amount), currency),
        recordedByName: row.recorded_by_name ?? "Unknown",
        daysWaiting: daysBetweenDubai(row.paid_on),
      }))
      .sort((a, b) => b.daysWaiting - a.daysWaiting || a.paidOn.localeCompare(b.paidOn)),
  );

  const oldestAwaitingDays = figureFrom<PaymentRow, number | null>(counted, () => {
    const incoming = awaiting.filter(isIncoming);
    if (incoming.length === 0) return null;

    return Math.max(...incoming.map((row) => daysBetweenDubai(row.paid_on)));
  });

  return {
    collected: figureFrom(counted, () => totals.collected),
    collectedCount: figureFrom(counted, () => totals.collectedCount),
    refunded: figureFrom(counted, () => totals.refunded),
    refundCount: figureFrom(counted, () => totals.refundCount),
    net: figureFrom(counted, () => totals.net),

    averagePayment: figureFrom<PaymentRow, Money | null>(counted, () => {
      const average = averageFils(BigInt(totals.collected.fils), totals.collectedCount);
      return average === null ? null : money(average, currency);
    }),

    awaitingCount: figureFrom(counted, () => awaiting.length),
    awaitingAmount: figureFrom(counted, () => totalOf(awaiting)),
    oldestAwaitingDays,

    rejectedCount: figureFrom(counted, () => rejected.length),
    reversedCount: figureFrom(counted, () => reversed.length),
    reversedAmount: figureFrom(counted, () => totalOf(reversed)),

    byMethod,
    byKind,
    byDay,
    refunds,
    aged,

    currency,
    rangeLabel,
  };
}

export type { ReportFilters };
