import {
  bucketPayments,
  dailyTotals,
  methodTotals,
  paymentTotals,
  type PaymentTotalsRow,
} from "../src/lib/utils/payment-totals.ts";

/*
 * The arithmetic behind "what did we collect this month".
 *
 * Four ways this goes wrong, and none of them produces an error — each
 * produces a confident, wrong number that somebody reconciles against a
 * bank statement and cannot explain:
 *
 *   1. A refund counted as a collection. direction is the only thing
 *      separating money arriving from money leaving. Lose that distinction
 *      and a month that refunded AED 100,000 reports AED 100,000 more
 *      collected than it took — the error is double the refund, and it
 *      points the wrong way.
 *
 *   2. Recorded counted as Verified. A Recorded payment is one person
 *      saying money arrived; a Verified one has been confirmed by someone
 *      else. The whole separation-of-duties control rests on the two never
 *      being summed, and summing them is a single character's difference in
 *      a filter.
 *
 *   3. A status nobody taught the code about. Add a status to the database
 *      and every row in it silently disappears from every total. The page
 *      stays green. That is why there is an `unknown` bucket rather than a
 *      default that drops.
 *
 *   4. Float money. These amounts arrive as decimal strings and are summed
 *      as bigint fils. Parse them to Number on the way through and
 *      "5000.00" becomes 5000, and a long column of them drifts.
 *
 * The invariants below are asserted over a generated set rather than a
 * hand-picked one, because the way bucketing breaks in practice is a filter
 * that drifts on rows nobody wrote a case for.
 */

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail?: string): void {
  checks += 1;

  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }

  failures += 1;
  console.error(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
}

interface Row extends PaymentTotalsRow {
  id: string;
}

const STATUSES = ["Verified", "Recorded", "Rejected", "Reversed"];
const METHODS = ["Cash", "Card", "Bank Transfer", "Cheque"];

/** A spread of rows across every status, direction, method and day. */
function generate(): Row[] {
  const rows: Row[] = [];
  let n = 0;

  for (const status of STATUSES) {
    for (const direction of ["in", "out"] as const) {
      for (const method of METHODS) {
        for (const day of ["2026-11-01", "2026-11-15", "2026-11-30"]) {
          n += 1;
          rows.push({
            id: `p${n}`,
            /* Deliberately a decimal string with cents, as the column holds. */
            amount: `${(n * 125).toFixed(2)}`,
            direction,
            status,
            method,
            paid_on: day,
          });
        }
      }
    }
  }

  /*
   * Rows with no method, which the generated spread above never produces.
   *
   * These are the rows the method table silently loses if the "Not set"
   * fallback is removed — and losing them makes the breakdown stop summing
   * to the headline, with no error anywhere. A payment taken with the
   * method left blank is a data-entry reality, not a hypothetical.
   */
  rows.push(
    { id: "nm1", amount: "777.00", direction: "in", status: "Verified", method: "", paid_on: "2026-11-15" },
    { id: "nm2", amount: "333.00", direction: "out", status: "Verified", method: undefined, paid_on: "2026-11-15" },
  );

  return rows;
}

const rows = generate();

/*
|--------------------------------------------------------------------------
| 1. EVERY ROW LANDS IN EXACTLY ONE BUCKET
|--------------------------------------------------------------------------
*/

console.log("\nbucketing");

{
  const buckets = bucketPayments(rows);

  const all = [
    ...buckets.settledIn,
    ...buckets.settledOut,
    ...buckets.awaiting,
    ...buckets.rejected,
    ...buckets.reversed,
    ...buckets.unknown,
  ];

  check(
    "no row is lost",
    all.length === rows.length,
    `${all.length} bucketed of ${rows.length}`,
  );

  check(
    "no row is counted twice",
    new Set(all.map((row) => row.id)).size === all.length,
    `${new Set(all.map((row) => row.id)).size} distinct of ${all.length}`,
  );

  check(
    "collected holds only verified incoming",
    buckets.settledIn.every((row) => row.status === "Verified" && row.direction === "in"),
  );

  check(
    "refunded holds only verified outgoing",
    buckets.settledOut.every((row) => row.status === "Verified" && row.direction === "out"),
  );

  /* The control the whole module rests on. */
  check(
    "nothing Recorded reaches the collected bucket",
    buckets.settledIn.every((row) => row.status !== "Recorded"),
  );

  check(
    "awaiting holds only Recorded",
    buckets.awaiting.every((row) => row.status === "Recorded"),
  );

  check("no unknown statuses in a known set", buckets.unknown.length === 0);
}

/*
|--------------------------------------------------------------------------
| 2. AN UNKNOWN STATUS IS VISIBLE, NOT DROPPED
|--------------------------------------------------------------------------
*/

console.log("\nunknown statuses");

{
  const withNew: Row[] = [
    ...rows,
    { id: "x1", amount: "9999.00", direction: "in", status: "Disputed", method: "Card", paid_on: "2026-11-10" },
    { id: "x2", amount: "8888.00", direction: "in", status: "Held", method: "Card", paid_on: "2026-11-10" },
  ];

  const buckets = bucketPayments(withNew);

  check(
    "a status the code does not know about is kept, not dropped",
    buckets.unknown.length === 2,
    `${buckets.unknown.length} in the unknown bucket`,
  );

  check(
    "an unknown status does not inflate collected",
    buckets.settledIn.every((row) => row.status === "Verified"),
  );

  const totals = paymentTotals(buckets, "AED");
  const baseline = paymentTotals(bucketPayments(rows), "AED");

  check(
    "an unknown status changes no money figure",
    totals.collected.fils === baseline.collected.fils &&
      totals.refunded.fils === baseline.refunded.fils,
    `${totals.collected.fils} vs ${baseline.collected.fils}`,
  );
}

/*
|--------------------------------------------------------------------------
| 3. COLLECTED, REFUNDED AND NET RECONCILE
|--------------------------------------------------------------------------
*/

console.log("\nreconciliation");

{
  const buckets = bucketPayments(rows);
  const totals = paymentTotals(buckets, "AED");

  check(
    "net is exactly collected minus refunded",
    BigInt(totals.net.fils) === BigInt(totals.collected.fils) - BigInt(totals.refunded.fils),
    `${totals.net.fils} vs ${BigInt(totals.collected.fils) - BigInt(totals.refunded.fils)}`,
  );

  /* The headline error: a refund treated as a collection. */
  check(
    "collected excludes refunds entirely",
    BigInt(totals.collected.fils) > 0n &&
      BigInt(totals.refunded.fils) > 0n &&
      BigInt(totals.collected.fils) !== BigInt(totals.net.fils),
    `collected ${totals.collected.fils}, refunded ${totals.refunded.fils}, net ${totals.net.fils}`,
  );

  check(
    "counts match the buckets",
    totals.collectedCount === buckets.settledIn.length &&
      totals.refundCount === buckets.settledOut.length,
  );

  /* The method table must add up to the same money as the headline. */
  const methods = methodTotals(buckets, "AED");

  const methodCollected = methods.reduce((sum, row) => sum + BigInt(row.collected.fils), 0n);
  const methodRefunded = methods.reduce((sum, row) => sum + BigInt(row.refunded.fils), 0n);

  check(
    "the method breakdown sums to collected",
    methodCollected === BigInt(totals.collected.fils),
    `${methodCollected} vs ${totals.collected.fils}`,
  );

  check(
    "the method breakdown sums to refunded",
    methodRefunded === BigInt(totals.refunded.fils),
    `${methodRefunded} vs ${totals.refunded.fils}`,
  );

  check(
    "a payment with no method is kept under a label, not dropped",
    methods.some((row) => row.method === "Not set" && row.count > 0),
    `methods: ${methods.map((row) => row.method).join(", ")}`,
  );

  /* And so must the daily worksheet, which is the one somebody ticks off
   * against a statement — a worksheet that does not add up to the headline
   * is worse than no worksheet. */
  const days = dailyTotals(buckets, "AED");

  const dayCollected = days.reduce((sum, row) => sum + BigInt(row.collected.fils), 0n);
  const dayRefunded = days.reduce((sum, row) => sum + BigInt(row.refunded.fils), 0n);

  check(
    "the daily worksheet sums to collected",
    dayCollected === BigInt(totals.collected.fils),
    `${dayCollected} vs ${totals.collected.fils}`,
  );

  check(
    "the daily worksheet sums to refunded",
    dayRefunded === BigInt(totals.refunded.fils),
    `${dayRefunded} vs ${totals.refunded.fils}`,
  );

  check(
    "every day's net is its own collected minus refunded",
    days.every(
      (row) => BigInt(row.net.fils) === BigInt(row.collected.fils) - BigInt(row.refunded.fils),
    ),
  );
}

/*
|--------------------------------------------------------------------------
| 4. MONEY IS EXACT
|--------------------------------------------------------------------------
*/

console.log("\nexact money");

{
  /* Values chosen so a float sum visibly drifts: 0.10 + 0.20 !== 0.30. */
  const pennies: Row[] = [
    { id: "a", amount: "0.10", direction: "in", status: "Verified", method: "Cash", paid_on: "2026-11-01" },
    { id: "b", amount: "0.20", direction: "in", status: "Verified", method: "Cash", paid_on: "2026-11-01" },
  ];

  const totals = paymentTotals(bucketPayments(pennies), "AED");

  check(
    "0.10 + 0.20 is exactly 0.30",
    totals.collected.fils === "30",
    `got ${totals.collected.fils} fils`,
  );

  /* The ordinary cents loss, which is the one that actually bites. */
  const round: Row[] = [
    { id: "a", amount: "5000.00", direction: "in", status: "Verified", method: "Cash", paid_on: "2026-11-01" },
    { id: "b", amount: "1234.50", direction: "in", status: "Verified", method: "Cash", paid_on: "2026-11-01" },
  ];

  const roundTotals = paymentTotals(bucketPayments(round), "AED");

  check(
    "cents survive the sum",
    roundTotals.collected.fils === "623450",
    `got ${roundTotals.collected.fils} fils`,
  );

  check(
    "the display keeps two decimal places",
    roundTotals.collected.display.includes("6,234.50"),
    roundTotals.collected.display,
  );

  /* A dealership-scale figure, summed one payment at a time. */
  const many: Row[] = Array.from({ length: 2000 }, (_, i) => ({
    id: `m${i}`,
    amount: "1999.99",
    direction: "in" as const,
    status: "Verified",
    method: "Card",
    paid_on: "2026-11-01",
  }));

  const manyTotals = paymentTotals(bucketPayments(many), "AED");

  check(
    "2,000 payments of 1999.99 sum exactly",
    manyTotals.collected.fils === String(2000 * 199999),
    `got ${manyTotals.collected.fils}, expected ${2000 * 199999}`,
  );
}

/*
|--------------------------------------------------------------------------
| 5. A REFUND-HEAVY MONTH GOES NEGATIVE RATHER THAN CLAMPING
|--------------------------------------------------------------------------
*/

console.log("\nnegative net");

{
  const unwound: Row[] = [
    { id: "a", amount: "10000.00", direction: "in", status: "Verified", method: "Card", paid_on: "2026-11-01" },
    { id: "b", amount: "90000.00", direction: "out", status: "Verified", method: "Bank Transfer", paid_on: "2026-11-02" },
  ];

  const totals = paymentTotals(bucketPayments(unwound), "AED");

  /*
   * A month that refunded more than it took is a real thing — a big deal
   * unwinds — and it is exactly the month somebody needs to ask about.
   * Clamping at zero would hide it behind a figure that looks merely quiet.
   */
  check(
    "net goes negative when refunds exceed collections",
    BigInt(totals.net.fils) === -8000000n,
    `got ${totals.net.fils} fils`,
  );

  check(
    "collected still reports the gross, not the net",
    totals.collected.fils === "1000000",
    `got ${totals.collected.fils} fils`,
  );
}

console.log(`\n${checks} checks, ${failures} failed.`);

if (failures > 0) process.exit(1);
