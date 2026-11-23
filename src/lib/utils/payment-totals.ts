import { money, sumFils, type Money } from "@/src/lib/utils/report-money";
import type { MethodTotalRow, DailyTotalRow } from "@/src/lib/types/report-payments";

/*
|--------------------------------------------------------------------------
| THE PAYMENT ARITHMETIC, ON ITS OWN
|--------------------------------------------------------------------------
|
| Separated from the query for one reason: this is the arithmetic that
| decides what the dealership believes it collected, and arithmetic that
| needs a database connection to run is arithmetic that does not get tested.
|
| Everything here is a pure function of rows the caller already has.
|
| THE BUCKETS ARE DISJOINT BY CONSTRUCTION
|
| Every row lands in exactly one status bucket, because status is one value.
| Within the settled bucket, collected and refunded cannot overlap because
| direction is one value. So the figures reconcile without anyone having to
| remember to keep them in step:
|
|     net = collected − refunded
|     every row ∈ exactly one of {settledIn, settledOut, awaiting,
|                                 rejected, reversed, settledOther}
|
| The tests assert both of those over generated rows, because the way this
| breaks in practice is not a wrong formula — it is a filter that drifts,
| so that a row starts being counted twice or stops being counted at all.
*/

/** The least a row needs for the totals. The queue row and the report row both fit. */
export interface PaymentTotalsRow {
  amount: number | string | null;
  direction: "in" | "out";
  status: string;
  method?: string;
  paid_on?: string;
}

export const VERIFIED = "Verified";
export const RECORDED = "Recorded";
export const REJECTED = "Rejected";
export const REVERSED = "Reversed";

export interface PaymentBuckets<TRow> {
  /** Verified money in. This, and only this, is "collected". */
  settledIn: TRow[];
  /** Verified money out. Refunds. Never added to collected. */
  settledOut: TRow[];
  /** Recorded, either direction. A claim, not a receipt. */
  awaiting: TRow[];
  rejected: TRow[];
  reversed: TRow[];
  /** Any status this code does not know about. Never silently dropped. */
  unknown: TRow[];
}

/**
 * Split rows into the buckets the report reports.
 *
 * The `unknown` bucket exists so that adding a status to the database
 * without adding it here produces rows that are visibly unaccounted for
 * rather than rows that quietly vanish from every total. A payment status
 * nobody has taught this function about should not reduce collections.
 */
export function bucketPayments<TRow extends PaymentTotalsRow>(
  rows: readonly TRow[],
): PaymentBuckets<TRow> {
  const buckets: PaymentBuckets<TRow> = {
    settledIn: [],
    settledOut: [],
    awaiting: [],
    rejected: [],
    reversed: [],
    unknown: [],
  };

  for (const row of rows) {
    switch (row.status) {
      case VERIFIED:
        if (row.direction === "in") buckets.settledIn.push(row);
        else buckets.settledOut.push(row);
        break;
      case RECORDED:
        buckets.awaiting.push(row);
        break;
      case REJECTED:
        buckets.rejected.push(row);
        break;
      case REVERSED:
        buckets.reversed.push(row);
        break;
      default:
        buckets.unknown.push(row);
    }
  }

  return buckets;
}

export interface PaymentTotals {
  /** Verified money in, gross. */
  collected: Money;
  /** Verified money out, as a positive figure. */
  refunded: Money;
  /** collected − refunded. Can be negative in a heavy refund month. */
  net: Money;
  collectedCount: number;
  refundCount: number;
}

export function paymentTotals<TRow extends PaymentTotalsRow>(
  buckets: PaymentBuckets<TRow>,
  currency: string,
): PaymentTotals {
  const collected = sumFils(buckets.settledIn, (row) => row.amount);
  const refunded = sumFils(buckets.settledOut, (row) => row.amount);

  return {
    collected: money(collected, currency),
    refunded: money(refunded, currency),
    /*
     * Net can go negative, and is allowed to. A month that refunded more
     * than it took is a real thing that happens when a big deal unwinds,
     * and clamping it at zero would hide exactly the month somebody needs
     * to ask about.
     */
    net: money(collected - refunded, currency),
    collectedCount: buckets.settledIn.length,
    refundCount: buckets.settledOut.length,
  };
}

/** Collected and refunded per payment method, biggest collection first. */
export function methodTotals<TRow extends PaymentTotalsRow>(
  buckets: PaymentBuckets<TRow>,
  currency: string,
): MethodTotalRow[] {
  const methods = new Map<string, { in: TRow[]; out: TRow[] }>();

  const bucketFor = (method: string) => {
    const existing = methods.get(method);
    if (existing) return existing;
    const created = { in: [] as TRow[], out: [] as TRow[] };
    methods.set(method, created);
    return created;
  };

  for (const row of buckets.settledIn) bucketFor(row.method?.trim() || "Not set").in.push(row);
  for (const row of buckets.settledOut) bucketFor(row.method?.trim() || "Not set").out.push(row);

  return Array.from(methods.entries())
    .map(([method, bucket]) => {
      const collected = sumFils(bucket.in, (row) => row.amount);
      const refunded = sumFils(bucket.out, (row) => row.amount);

      return {
        id: method,
        method,
        count: bucket.in.length,
        collected: money(collected, currency),
        refundCount: bucket.out.length,
        refunded: money(refunded, currency),
        net: money(collected - refunded, currency),
      };
    })
    .sort(
      (a, b) =>
        Number(BigInt(b.collected.fils) - BigInt(a.collected.fils)) ||
        a.method.localeCompare(b.method),
    );
}

/**
 * Collected and refunded per calendar day, most recent first.
 *
 * Grouped on paid_on exactly as stored. The point of this table is to line
 * up against a bank statement, and a statement is organised by the day the
 * money moved — so re-deriving the day from a timestamp here, in any
 * timezone, would be inventing a different day from the one recorded.
 */
export function dailyTotals<TRow extends PaymentTotalsRow>(
  buckets: PaymentBuckets<TRow>,
  currency: string,
): DailyTotalRow[] {
  const days = new Map<string, { in: TRow[]; out: TRow[] }>();

  const bucketFor = (date: string) => {
    const existing = days.get(date);
    if (existing) return existing;
    const created = { in: [] as TRow[], out: [] as TRow[] };
    days.set(date, created);
    return created;
  };

  for (const row of buckets.settledIn) bucketFor(row.paid_on ?? "Not set").in.push(row);
  for (const row of buckets.settledOut) bucketFor(row.paid_on ?? "Not set").out.push(row);

  return Array.from(days.entries())
    .map(([date, bucket]) => {
      const collected = sumFils(bucket.in, (row) => row.amount);
      const refunded = sumFils(bucket.out, (row) => row.amount);

      return {
        id: date,
        date,
        count: bucket.in.length + bucket.out.length,
        collected: money(collected, currency),
        refunded: money(refunded, currency),
        net: money(collected - refunded, currency),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
