import {
  bucketByAge,
  daysBetweenDubai,
  tallyBuyers,
  type AgeBucketSpec,
} from "../src/lib/utils/report-grouping.ts";
import { AGEING_BUCKETS } from "../src/lib/types/report-inventory.ts";

/*
 * Two calculations that can be wrong without looking wrong.
 *
 * The ageing maths moves cars between buckets. The buyer tally decides
 * whether a customer who bought three cars is one customer or three — which
 * the sprint plan calls out by name as the thing not to get wrong.
 */

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);

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
   AGE, IN DUBAI DAYS
========================================================= */

const noon = new Date("2026-11-20T08:00:00Z"); // midday in Dubai

check("the same day is zero", daysBetweenDubai("2026-11-20T06:00:00Z", noon), 0);
check("yesterday is one", daysBetweenDubai("2026-11-19T06:00:00Z", noon), 1);
check("a week is seven", daysBetweenDubai("2026-11-13T06:00:00Z", noon), 7);

/*
 * The case the millisecond version gets wrong. A car entered at 23:00 Dubai
 * on the 19th is 19:00 UTC on the 19th. At midday Dubai on the 20th, that is
 * 17 hours later — under 24 — so dividing milliseconds gives 0. It is one
 * calendar day old, and belongs in a different bucket.
 */
const lateYesterday = "2026-11-19T19:00:00Z"; // 23:00 Dubai on the 19th
check("a car entered late yesterday is one day old", daysBetweenDubai(lateYesterday, noon), 1);

checkTrue(
  "and the millisecond method would have said zero, so the test bites",
  Math.floor((noon.getTime() - new Date(lateYesterday).getTime()) / 86_400_000) === 0,
);

/* A record dated in the future is zero, not negative — a negative age would
   match no bucket and the vehicle would vanish from the breakdown. */
check("a future date is zero, not negative", daysBetweenDubai("2027-01-01T00:00:00Z", noon), 0);

check("an unparseable date is zero", daysBetweenDubai("not a date", noon), 0);

/* =========================================================
   BUCKETS — EXACTLY ONE EACH
========================================================= */

const now = new Date("2026-11-20T08:00:00Z");

/** A car created N days before `now`, in Dubai terms. */
function carAged(days: number, id: string) {
  const created = new Date(now.getTime() - days * 86_400_000);
  return { id, created_at: created.toISOString() };
}

const fleet = [
  carAged(0, "today"),
  carAged(15, "mid-first"),
  carAged(30, "boundary-30"),
  carAged(31, "boundary-31"),
  carAged(60, "boundary-60"),
  carAged(61, "boundary-61"),
  carAged(90, "boundary-90"),
  carAged(91, "boundary-91"),
  carAged(400, "ancient"),
];

const bucketed = bucketByAge(fleet, (car) => car.created_at, AGEING_BUCKETS, now);

check("under 30 holds the new ones", bucketed.get("0-30")?.map((c) => c.id), [
  "today",
  "mid-first",
  "boundary-30",
]);
check("31 to 60", bucketed.get("31-60")?.map((c) => c.id), ["boundary-31", "boundary-60"]);
check("61 to 90", bucketed.get("61-90")?.map((c) => c.id), ["boundary-61", "boundary-90"]);
check("over 90 is open-ended", bucketed.get("90+")?.map((c) => c.id), ["boundary-91", "ancient"]);

/*
 * Every vehicle is placed.
 *
 * Honest note on what this does and does not prove. bucketByAge uses
 * `buckets.find(...)`, which returns the first match — so a vehicle
 * physically cannot land in two buckets, and the "none twice" assertion
 * below is guaranteed by the implementation rather than defended by the
 * test. It is kept as a regression guard in case `find` is ever changed to
 * `filter`.
 *
 * The real risk is the opposite one: a vehicle landing in NO bucket, or in
 * the wrong one. The boundary cases above are what catch that. Mutating the
 * lower bound from `>=` to `>` — the off-by-one somebody would actually
 * write — fails five of these assertions and names each vehicle that moved.
 */
const placed = Array.from(bucketed.values()).flat();
check("every vehicle is placed", placed.length, fleet.length);
checkTrue(
  "and none is placed twice",
  new Set(placed.map((car) => car.id)).size === fleet.length,
);

/* A bucket set with a gap drops the vehicle rather than guessing. */
const gapped: AgeBucketSpec[] = [
  { id: "a", label: "0-10", minDays: 0, maxDays: 10 },
  { id: "b", label: "20-30", minDays: 20, maxDays: 30 },
];
const withGap = bucketByAge([carAged(15, "in-the-gap")], (c) => c.created_at, gapped, now);
check("a vehicle in a gap is placed nowhere", Array.from(withGap.values()).flat().length, 0);

/* Empty buckets still exist, so the breakdown shows "0" rather than omitting
   a row and making the table look shorter than it is. */
const emptyRun = bucketByAge([], (c: { created_at: string }) => c.created_at, AGEING_BUCKETS, now);
check("every bucket exists even with no data", Array.from(emptyRun.keys()), ["0-30", "31-60", "61-90", "90+"]);

/* =========================================================
   PEOPLE, NOT ROWS
========================================================= */

/*
 * The plan's warning, in test form. Six deals, three customers, one of whom
 * bought three cars and one two. Counting rows gives 6; counting people
 * gives 3; repeat buyers is 2.
 */
const deals = [
  { customer_id: "alice" },
  { customer_id: "alice" },
  { customer_id: "alice" },
  { customer_id: "bob" },
  { customer_id: "bob" },
  { customer_id: "carla" },
];

const tally = tallyBuyers(deals);

check("six deals are three buyers", tally.buyers, 3);
check("two of them bought more than once", tally.repeatBuyers, 2);
check("and the deal counts are kept", tally.byCustomer.get("alice"), 3);

checkTrue(
  "buyers is NOT the number of deals, which is the whole point",
  tally.buyers !== deals.length,
);

/* A single buyer is not a repeat buyer. */
check("one deal means no repeats", tallyBuyers([{ customer_id: "solo" }]).repeatBuyers, 0);
check("one deal means one buyer", tallyBuyers([{ customer_id: "solo" }]).buyers, 1);

/* No deals is zero of both, not a failure. */
check("no deals is no buyers", tallyBuyers([]).buyers, 0);
check("and no repeats", tallyBuyers([]).repeatBuyers, 0);

/*
 * Deals with no customer are skipped, not grouped. Grouping them under one
 * null key would show up as a single astonishingly prolific repeat buyer.
 */
const withNulls = tallyBuyers([
  { customer_id: null },
  { customer_id: null },
  { customer_id: null },
  { customer_id: "real" },
]);
check("customerless deals do not create a buyer", withNulls.buyers, 1);
check("and do not create a repeat buyer", withNulls.repeatBuyers, 0);

/* =========================================================
   RESULT
========================================================= */

console.log(`\nreport-grouping-test: ${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
