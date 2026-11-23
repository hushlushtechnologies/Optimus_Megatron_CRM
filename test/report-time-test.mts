import {
  DUBAI_TIME_ZONE,
  dubaiDateOf,
  dubaiInstant,
  dubaiMonthKey,
  dubaiParts,
  dubaiToday,
  formatMonthKey,
  parseReportRangeId,
  resolveReportRange,
} from "../src/lib/utils/report-time.ts";

/*
 * The reporting clock.
 *
 * Two things are being defended here.
 *
 * FIRST, the four-hour bug. resolveRange() built its boundaries with
 * `new Date(y, m, 1)`, which is midnight in the *process's* timezone. The
 * process runs in UTC, so "this month" began four hours into 1 November,
 * Dubai time, and every deal completed in those four hours was reported in
 * October. The regression test for it is explicit below: a deal completed at
 * 01:00 Dubai on the first of the month must be inside that month's window.
 *
 * SECOND, the assumption the whole file rests on: that Dubai is UTC+04:00
 * with no daylight saving. That is true and has been since 1990, but it is an
 * assumption, so it is checked against Intl rather than trusted — in June and
 * in December, because that is what daylight saving would break.
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
   THE ASSUMPTION
========================================================= */

/** What Intl says Dubai's offset is, in minutes, at a given instant. */
function intlOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DUBAI_TIME_ZONE,
    timeZoneName: "longOffset",
  })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;

  /* "GMT+04:00" */
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(parts ?? "");
  if (!match) return NaN;

  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

check("Dubai is UTC+4 in January", intlOffsetMinutes(new Date("2026-01-15T12:00:00Z")), 240);
check("Dubai is UTC+4 in June", intlOffsetMinutes(new Date("2026-06-15T12:00:00Z")), 240);
check("Dubai is UTC+4 in December", intlOffsetMinutes(new Date("2026-12-15T12:00:00Z")), 240);

/* =========================================================
   THE PRIMITIVES
========================================================= */

/* Midnight on 1 November in Dubai is 20:00 on 31 October, UTC. */
check(
  "dubaiInstant maps Dubai midnight to the right UTC instant",
  dubaiInstant(2026, 11, 1).toISOString(),
  "2026-10-31T20:00:00.000Z",
);

check("month is 1-based", dubaiInstant(2026, 1, 1).toISOString(), "2025-12-31T20:00:00.000Z");

/* Day overflow is how "tomorrow" and "90 days ago" are expressed. */
check(
  "day 0 is the last day of the previous month",
  dubaiDateOf(dubaiInstant(2026, 11, 0)),
  "2026-10-31",
);
/* November has 30 days, so day 31 is 1 December. Spelled out because the
   off-by-one here is the kind that silently shifts a month boundary. */
check(
  "day 31 of a 30-day month rolls into the next month",
  dubaiDateOf(dubaiInstant(2026, 11, 31)),
  "2026-12-01",
);
check(
  "day 32 of a 30-day month is the 2nd",
  dubaiDateOf(dubaiInstant(2026, 11, 32)),
  "2026-12-02",
);
check(
  "day 32 of a 31-day month is the 1st",
  dubaiDateOf(dubaiInstant(2026, 12, 32)),
  "2027-01-01",
);

/* 22:00 UTC is already tomorrow in Dubai. This is the whole bug in one line. */
check("22:00 UTC is the next day in Dubai", dubaiDateOf(new Date("2026-11-21T22:00:00Z")), "2026-11-22");
check("19:00 UTC is still the same day", dubaiDateOf(new Date("2026-11-21T19:00:00Z")), "2026-11-21");

check("dubaiToday agrees", dubaiToday(new Date("2026-11-21T22:30:00Z")), "2026-11-22");

/* Monday is weekday 1: the UAE week since January 2022. */
check("Monday is 1", dubaiParts(new Date("2026-11-23T08:00:00Z")).weekday, 1);
check("Sunday is 7", dubaiParts(new Date("2026-11-22T08:00:00Z")).weekday, 7);

/* =========================================================
   THE REGRESSION TEST FOR THE FOUR-HOUR BUG
========================================================= */

/*
 * A deal completed at 01:00 Dubai on 1 November 2026.
 * In UTC that is 2026-10-31T21:00:00Z.
 */
const earlyFirst = new Date("2026-10-31T21:00:00Z");

/* "Now" is mid-November, so this-month is November. */
const november = resolveReportRange("this-month", { at: new Date("2026-11-15T10:00:00Z") });

checkTrue(
  "a deal completed at 01:00 Dubai on the 1st IS inside this month",
  earlyFirst.toISOString() >= (november.fromIso ?? "") && earlyFirst.toISOString() < november.toIso,
);

/*
 * And the proof the test is meaningful: the OLD boundary would have excluded
 * it. The old code produced midnight UTC on the 1st.
 */
const oldBoundary = "2026-11-01T00:00:00.000Z";
checkTrue(
  "the old UTC boundary would have excluded it, so the test bites",
  earlyFirst.toISOString() < oldBoundary,
);

check("this month starts at Dubai midnight", november.fromIso, "2026-10-31T20:00:00.000Z");

/* The same deal must NOT also be in October. */
const october = resolveReportRange("last-month", { at: new Date("2026-11-15T10:00:00Z") });

checkTrue(
  "and it is NOT also counted in last month",
  !(earlyFirst.toISOString() >= (october.fromIso ?? "") && earlyFirst.toISOString() < october.toIso),
);

/* =========================================================
   NO GAP, NO OVERLAP
========================================================= */

/*
 * Half-open ranges mean last month's exclusive end is this month's inclusive
 * start — the same instant, belonging to exactly one of them. The old code
 * ended last month a millisecond early, which both left a hole and relied on
 * millisecond precision surviving Postgres.
 */
check("last month ends exactly where this month starts", october.toIso, november.fromIso);

check("last month is labelled by its own month", october.label, "October 2026");
check("this month is labelled by its own month", november.label, "November 2026");

/* =========================================================
   TIMESTAMP FORM vs DATE FORM
========================================================= */

/*
 * paid_on is a calendar date column. Filtering it with an ISO timestamp makes
 * Postgres coerce, and the result depends on the session timezone. Every range
 * therefore carries both forms, and the date form is INCLUSIVE at both ends
 * because a date column has no "exclusive day".
 */
check("this month's date form starts on the 1st", november.fromDate, "2026-11-01");
check("this month's date form ends today", november.toDate, "2026-11-15");
check("last month's date form ends on the 31st", october.toDate, "2026-10-31");
check("last month's date form starts on the 1st", october.fromDate, "2026-10-01");

/* A February boundary, where an off-by-one would be visible. */
const feb = resolveReportRange("last-month", { at: new Date("2026-03-10T08:00:00Z") });
check("February's date form ends on the 28th", feb.toDate, "2026-02-28");
check("February 2028 is a leap year", resolveReportRange("last-month", { at: new Date("2028-03-10T08:00:00Z") }).toDate, "2028-02-29");

/* =========================================================
   THE OTHER PERIODS
========================================================= */

const at = new Date("2026-11-18T10:00:00Z"); // Wednesday 18 November, 14:00 Dubai

const today = resolveReportRange("today", { at });
check("today starts at Dubai midnight", today.fromIso, "2026-11-17T20:00:00.000Z");
check("today ends at the next Dubai midnight", today.toIso, "2026-11-18T20:00:00.000Z");
check("today's date form is one day", [today.fromDate, today.toDate], ["2026-11-18", "2026-11-18"]);

const yesterday = resolveReportRange("yesterday", { at });
check("yesterday is one whole day", [yesterday.fromDate, yesterday.toDate], ["2026-11-17", "2026-11-17"]);
check("yesterday ends where today starts", yesterday.toIso, today.fromIso);

const thisWeek = resolveReportRange("this-week", { at });
check("this week starts on Monday", thisWeek.fromDate, "2026-11-16");

const lastWeek = resolveReportRange("last-week", { at });
check("last week starts the Monday before", lastWeek.fromDate, "2026-11-09");
check("last week ends on Sunday", lastWeek.toDate, "2026-11-15");
check("last week ends where this week starts", lastWeek.toIso, thisWeek.fromIso);

const last90 = resolveReportRange("last-90", { at });
check("last 90 days includes today", last90.toDate, "2026-11-18");
check("and starts 89 days earlier, for 90 whole days", last90.fromDate, "2026-08-21");

const year = resolveReportRange("year", { at });
check("this year starts on 1 January, Dubai", year.fromIso, "2025-12-31T20:00:00.000Z");
check("this year is labelled by the year", year.label, "2026");

const lastYear = resolveReportRange("last-year", { at });
check("last year covers the whole year", [lastYear.fromDate, lastYear.toDate], ["2025-01-01", "2025-12-31"]);
check("last year ends where this year starts", lastYear.toIso, year.fromIso);

const all = resolveReportRange("all", { at });
check("all time has no lower bound", all.fromIso, null);
check("all time has no lower date bound either", all.fromDate, null);
checkTrue("but it does have an upper bound", all.toIso.length > 0);

/* =========================================================
   CUSTOM RANGES
========================================================= */

const custom = resolveReportRange("custom", { at, customFrom: "2026-03-01", customTo: "2026-03-31" });
check("a custom range keeps its dates", [custom.fromDate, custom.toDate], ["2026-03-01", "2026-03-31"]);
check("and its exclusive end is the next day", custom.toIso, "2026-03-31T20:00:00.000Z");
check("a custom range is labelled by its bounds", custom.label, "2026-03-01 to 2026-03-31");

/* A single day chosen twice reads as one day, not a range. */
const oneDay = resolveReportRange("custom", { at, customFrom: "2026-03-05", customTo: "2026-03-05" });
check("a one-day custom range says so", oneDay.label, "2026-03-05");
check("and covers exactly 24 hours", new Date(oneDay.toIso).getTime() - new Date(oneDay.fromIso ?? 0).getTime(), 86_400_000);

/* Backwards dates are a typing mistake, not a request for no data. */
const backwards = resolveReportRange("custom", { at, customFrom: "2026-03-31", customTo: "2026-03-01" });
check("backwards dates are swapped", [backwards.fromDate, backwards.toDate], ["2026-03-01", "2026-03-31"]);

/* Nonsense falls back to this month rather than to all of time. */
check("a missing end falls back to this month", resolveReportRange("custom", { at, customFrom: "2026-03-01" }).id, "this-month");
check("an impossible date falls back", resolveReportRange("custom", { at, customFrom: "2026-02-31", customTo: "2026-03-01" }).id, "this-month");
check("a malformed date falls back", resolveReportRange("custom", { at, customFrom: "01/03/2026", customTo: "2026-03-01" }).id, "this-month");

/* =========================================================
   PARSING WHAT ARRIVES IN A URL
========================================================= */

check("a known id is kept", parseReportRangeId("last-90"), "last-90");
check("an unknown id falls back to this month", parseReportRangeId("last-fortnight"), "this-month");
check("a missing id falls back", parseReportRangeId(undefined), "this-month");
check("a repeated key takes the first", parseReportRangeId(["year", "today"]), "year");

/* Sprint 6's five ids must keep working: they are in bookmarks and in links. */
for (const legacy of ["this-month", "last-month", "last-90", "year", "all"]) {
  check(`the Sprint 6 id "${legacy}" still resolves`, parseReportRangeId(legacy), legacy);
}

/* =========================================================
   MONTH BUCKETS
========================================================= */

/* 01:00 Dubai on 1 November is October in UTC. A trend chart bucketed on the
   raw string would disagree with the KPI card above it. */
check("a bucket is a Dubai month", dubaiMonthKey("2026-10-31T21:00:00Z"), "2026-11");
check("and the obvious case still works", dubaiMonthKey("2026-11-15T10:00:00Z"), "2026-11");
check("an unparseable timestamp has no bucket", dubaiMonthKey("not a date"), null);

check("a bucket formats readably", formatMonthKey("2026-11"), "Nov 2026");
check("a malformed bucket is returned as-is", formatMonthKey("nonsense"), "nonsense");

/* =========================================================
   RESULT
========================================================= */

console.log(`\nreport-time-test: ${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
