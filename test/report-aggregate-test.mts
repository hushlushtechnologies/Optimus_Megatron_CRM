import {
  averageFils,
  filsOf,
  money,
  moneyToFils,
  percentOfFils,
  splitCashMovement,
  sumFils,
  zeroMoney,
} from "../src/lib/utils/report-money.ts";
import {
  completenessMessage,
  completenessOf,
  figureFailed,
  figureFrom,
  figureOf,
  interpretCounted,
  type ReportFigure,
} from "../src/lib/supabase/report-aggregate.ts";

/*
 * The two things a financial report can get wrong without looking wrong:
 * the arithmetic, and its own honesty about how much it covered.
 */

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  const e = JSON.stringify(expected, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

  if (a === e) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL  ${name}\n      expected ${e}\n      got      ${a}`);
  }
}

function checkTrue(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL  ${name}`);
  }
}

/* =========================================================
   EXACT MONEY
========================================================= */

check("a decimal string parses to fils", filsOf("1234.50"), 123450n);
check("a number parses to fils", filsOf(1234.5), 123450n);
check("null is zero", filsOf(null), 0n);
check("undefined is zero", filsOf(undefined), 0n);
check("rubbish is zero", filsOf("not money"), 0n);

/*
 * The demonstration. A thousand amounts of 0.07 AED summed as floats drifts
 * to 69.99999999999966; summed as fils it is exactly 7000.
 *
 * 0.07 is a stress case rather than a typical payment — most realistic sets
 * of dealership figures happen to sum exactly in a double. The point is the
 * mechanism: once the module is summing floats, whether any given month
 * drifts is luck, and this is a financial report.
 */
const sevenFils = Array.from({ length: 1000 }, () => ({ amount: "0.07" }));

let floatSum = 0;
for (const row of sevenFils) floatSum += Number(row.amount);

check("summed as fils it is exact", sumFils(sevenFils, (r) => r.amount), 7000n);
checkTrue("whereas the float sum drifts, so the test is meaningful", floatSum !== 70);
checkTrue("and the drift is real, not a rounding display", Math.abs(floatSum - 70) > 1e-13);

/* Ordinary amounts, which must also be exact. */
const deals = [
  { total_due: "1234567.89" },
  { total_due: "250000.00" },
  { total_due: "99999.99" },
  { total_due: null },
];
check("a mixed set sums exactly", sumFils(deals, (r) => r.total_due), 158456788n);

check("an empty set is zero, not null", sumFils([], (r: { x: string }) => r.x), 0n);

/* =========================================================
   CROSSING TO THE CLIENT
========================================================= */

const m = money(123450n, "AED");
check("fils cross the wire as an exact string", m.fils, "123450");
checkTrue("display is formatted for a person", m.display.includes("1,234.50"));
check("chart is a plain number for geometry", m.chart, 1234.5);

/*
 * A bigint cannot be serialised into a server-component payload — it throws.
 * That is why fils is a string, and this asserts the whole Money object
 * survives the trip.
 */
checkTrue("a Money object is JSON-serialisable", (() => {
  try {
    JSON.parse(JSON.stringify(m));
    return true;
  } catch {
    return false;
  }
})());

check("and converts back to exact fils", moneyToFils(m), 123450n);
check("a zero still carries its currency", zeroMoney("AED").fils, "0");

/* A figure beyond exact double range survives as fils but not as chart. */
const huge = money(9_007_199_254_740_993n, "AED");
check("a huge amount keeps exact fils", huge.fils, "9007199254740993");

/* =========================================================
   CASH MOVEMENT — THREE FIGURES, NOT ONE
========================================================= */

/*
 * The month the old "Collected" figure got wrong: AED 2m in, AED 2m
 * refunded. The net is zero and the collection is not.
 */
const payments = [
  { amount: "2000000.00", direction: "in" },
  { amount: "2000000.00", direction: "out" },
];

const movement = splitCashMovement(payments, (r) => r, "AED");

check("money in is reported on its own", movement.in.fils, "200000000");
check("money out is reported positive", movement.out.fils, "200000000");
check("and the net is zero", movement.net.fils, "0");

checkTrue(
  "so a 2m month is not reported as having collected nothing",
  movement.in.fils !== movement.net.fils,
);

/* Net can legitimately be negative in a heavy refund month. */
const refundHeavy = splitCashMovement(
  [
    { amount: "100.00", direction: "in" },
    { amount: "500.00", direction: "out" },
  ],
  (r) => r,
);
check("net goes negative when refunds exceed receipts", refundHeavy.net.fils, "-40000");
checkTrue("and displays as negative", refundHeavy.net.display.includes("-"));

/*
 * An unrecognised direction counts as money in. The column is constrained in
 * the database so this should be unreachable; the direction of the error is
 * deliberate — it understates refunds rather than inventing them.
 */
const odd = splitCashMovement([{ amount: "50.00", direction: null }], (r) => r);
check("an unknown direction counts as money in", odd.in.fils, "5000");
check("and not as a refund", odd.out.fils, "0");

/* =========================================================
   THE TWO OPERATIONS THAT ROUND
========================================================= */

check("an average divides exactly when it can", averageFils(300000n, 3), 100000n);

/* 10000 fils over 3 is 3333.33; half-up on the fil gives 3333. */
check("an average rounds half-up", averageFils(10000n, 3), 3333n);
/* 10001 over 2 is 5000.5, which rounds up. */
check("exactly a half rounds up", averageFils(10001n, 2), 5001n);
/* And symmetrically for a negative total. */
check("a negative average rounds symmetrically", averageFils(-10001n, 2), -5001n);

check("an average of nothing is null, not zero", averageFils(50000n, 0), null);
check("a negative count is null too", averageFils(50000n, -1), null);

check("a percentage of a total", percentOfFils(2500n, 10000n), 25);
check("a small share does not floor to zero", percentOfFils(1n, 10000n), 0.01);
check("a percentage of zero is null, not Infinity", percentOfFils(500n, 0n), null);

/* =========================================================
   COMPLETENESS — THE CAP
========================================================= */

/* The ordinary case: fewer rows than the limit, and a count agreeing. */
const small = interpretCounted<{ id: number }>(
  { data: [{ id: 1 }, { id: 2 }], error: null, count: 2 },
  1000,
  "small",
);
check("a small result is complete", small.complete, true);
check("and carries its exact total", small.total, 2);
check("and no error", small.error, null);

/* The cap biting: 1000 rows fetched, 4312 matched. */
const capped = interpretCounted<{ id: number }>(
  { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null, count: 4312 },
  1000,
  "capped",
);
check("a capped result is NOT complete", capped.complete, false);
check("and knows how many it missed", capped.total, 4312);
check("but still returns the rows it has", capped.rows.length, 1000);

/* Exactly at the limit, with a count: complete, because the count says so. */
const exact = interpretCounted<{ id: number }>(
  { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null, count: 1000 },
  1000,
  "exact",
);
check("exactly at the limit with a matching count is complete", exact.complete, true);

/*
 * Without a count, a full page is assumed truncated. That is wrong by one in
 * the exactly-full case, and deliberately so: an unnecessary warning costs a
 * line of UI, whereas assuming completeness on a full page is how a capped
 * total gets shown as final.
 */
const noCount = interpretCounted<{ id: number }>(
  { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null, count: null },
  1000,
  "nocount",
);
check("a full page with no count is assumed incomplete", noCount.complete, false);

const noCountShort = interpretCounted<{ id: number }>(
  { data: [{ id: 1 }], error: null, count: null },
  1000,
  "nocountshort",
);
check("a short page with no count is complete", noCountShort.complete, true);

/* =========================================================
   COMPLETENESS — THE FAILURE
========================================================= */

/*
 * The defect this shape exists to prevent: a failed query reducing to zero.
 * A failure must produce null, and null must not be confusable with zero.
 */
const broken = interpretCounted<{ amount: string }>(
  { data: null, error: { message: "statement timeout" }, count: null },
  1000,
  "payments",
);

check("a failed query has no rows", broken.rows, []);
check("and reports its error", broken.error, "statement timeout");
check("and is not complete", broken.complete, false);

const brokenFigure = figureFrom(broken, (rows) => sumFils(rows, (r) => r.amount));
check("a figure from a failed query is NULL, not zero", brokenFigure.value, null);

const emptyButFine = interpretCounted<{ amount: string }>(
  { data: [], error: null, count: 0 },
  1000,
  "empty",
);
const zeroFigure = figureFrom(emptyButFine, (rows) => sumFils(rows, (r) => r.amount));
check("whereas a genuinely empty period is zero", zeroFigure.value, 0n);

checkTrue(
  "so failure and emptiness are distinguishable",
  brokenFigure.value === null && zeroFigure.value === 0n,
);

/* =========================================================
   COMBINING A SET
========================================================= */

const healthy: Record<string, ReportFigure<unknown>> = {
  created: figureOf(12),
  completed: figureOf(5),
  collected: figureOf(100n),
};
check("a healthy set is complete", completenessOf(healthy).allComplete, true);
check("and has no message", completenessMessage(completenessOf(healthy)), null);

const oneCapped: Record<string, ReportFigure<unknown>> = {
  created: figureOf(12),
  completed: figureOf(5, false, 9000),
};
const cappedState = completenessOf(oneCapped);
check("one capped figure makes the set incomplete", cappedState.allComplete, false);
check("and names which", cappedState.incomplete, ["completed"]);
checkTrue(
  "and the message says how to get a right answer",
  (completenessMessage(cappedState) ?? "").includes("Narrow the period"),
);

const oneFailed: Record<string, ReportFigure<unknown>> = {
  created: figureOf(12),
  collected: figureFailed("timeout"),
};
const failedState = completenessOf(oneFailed);
check("a failed figure is reported as failed, not capped", failedState.failed, ["collected"]);
check("and not listed as incomplete", failedState.incomplete, []);
checkTrue(
  "and its message does not suggest narrowing the period",
  !(completenessMessage(failedState) ?? "").includes("Narrow the period"),
);

/* A figure whose value is null counts as failed even without an error set. */
const nullValue: Record<string, ReportFigure<unknown>> = {
  odd: { value: null, complete: true, total: null, error: null },
};
check("a null value counts as failed however it got there", completenessOf(nullValue).failed, ["odd"]);

/* Failure is reported per figure, so one broken query does not blank the
   page — the specific improvement over the old all-or-nothing behaviour. */
checkTrue(
  "a set with one failure still reports its good figures",
  oneFailed.created.value === 12,
);

/* =========================================================
   RESULT
========================================================= */

console.log(`\nreport-aggregate-test: ${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
