import { dubaiParts } from "@/src/lib/utils/report-time";

/*
|--------------------------------------------------------------------------
| THE ARITHMETIC IN THE REPORTS, PULLED OUT WHERE IT CAN BE TESTED
|--------------------------------------------------------------------------
|
| Two calculations in Batch 3 can be quietly wrong, and neither is visible to
| a type checker:
|
|   how old a vehicle is       an off-by-one here moves cars between ageing
|                              buckets, and the report still looks fine
|
|   how many people bought     the plan's explicit warning: do not count one
|                              customer three times because they have three
|                              deals
|
| Both lived inside query functions that need a database to run, which is the
| same as not being tested. They are pure functions here, and
| test/report-grouping-test.mts holds them to their rules.
*/

/*
|--------------------------------------------------------------------------
| AGE
|--------------------------------------------------------------------------
*/

/**
 * Whole days between two instants, counted in Dubai calendar days.
 *
 * Deliberately not `(now - then) / 86400000`. A vehicle entered at 23:00 on
 * Monday is one day old on Tuesday morning; the millisecond version says
 * zero for another twenty-three hours, which puts a day-old car and a
 * minute-old car in the same bucket and shifts every boundary by up to a day.
 *
 * Counting calendar days in Dubai also keeps this consistent with every
 * other date in the reporting layer, which is Dubai-based for the reasons in
 * report-time.ts.
 */
export function daysBetweenDubai(from: string | Date, to: Date = new Date()): number {
  const start = typeof from === "string" ? new Date(from) : from;
  if (Number.isNaN(start.getTime())) return 0;

  const a = dubaiParts(start);
  const b = dubaiParts(to);

  const startDay = Date.UTC(a.year, a.month - 1, a.day);
  const endDay = Date.UTC(b.year, b.month - 1, b.day);

  /* Never negative: a record dated in the future is zero days old, not
     minus three, which would land it in no bucket at all. */
  return Math.max(0, Math.round((endDay - startDay) / 86_400_000));
}

export interface AgeBucketSpec {
  id: string;
  label: string;
  minDays: number;
  /** null means open-ended. */
  maxDays: number | null;
}

/**
 * Put each item in exactly one age bucket.
 *
 * "Exactly one" is the property worth having. Buckets written as 0–30, 30–60
 * put a thirty-day-old car in both, and the breakdown then totals more than
 * the headline count — which reads as a data problem rather than an
 * arithmetic one and takes a while to find.
 */
export function bucketByAge<T>(
  items: readonly T[],
  getDate: (item: T) => string,
  buckets: readonly AgeBucketSpec[],
  now: Date = new Date(),
): Map<string, T[]> {
  const result = new Map<string, T[]>(buckets.map((bucket) => [bucket.id, []]));

  for (const item of items) {
    const age = daysBetweenDubai(getDate(item), now);

    const bucket = buckets.find(
      (candidate) => age >= candidate.minDays && (candidate.maxDays === null || age <= candidate.maxDays),
    );

    if (bucket) result.get(bucket.id)!.push(item);
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| PEOPLE, NOT ROWS
|--------------------------------------------------------------------------
*/

export interface BuyerTally {
  /** Distinct customers with at least one qualifying deal. */
  buyers: number;
  /** Distinct customers with two or more. */
  repeatBuyers: number;
  /** Deals per customer, for anything else that needs it. */
  byCustomer: Map<string, number>;
}

/**
 * Count people from a list of deals.
 *
 * This is the function the sprint plan's warning is about: "do not
 * accidentally count one customer three times as three customers because
 * they have three active leads". The same mistake is available with deals,
 * and the way it happens is counting rows instead of reducing them first.
 *
 * Rows with no customer are skipped rather than grouped under a shared
 * "unknown" key — one `null` bucket would otherwise appear as a single
 * extremely prolific repeat buyer.
 */
export function tallyBuyers(
  deals: readonly { customer_id: string | null }[],
): BuyerTally {
  const byCustomer = new Map<string, number>();

  for (const deal of deals) {
    if (!deal.customer_id) continue;
    byCustomer.set(deal.customer_id, (byCustomer.get(deal.customer_id) ?? 0) + 1);
  }

  let repeatBuyers = 0;
  for (const count of byCustomer.values()) {
    if (count >= 2) repeatBuyers += 1;
  }

  return { buyers: byCustomer.size, repeatBuyers, byCustomer };
}
