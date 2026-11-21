import {
  formatCell,
  formatCellDate,
  formatCellMoney,
  formatCellNumber,
  formatCellTime,
} from "../src/lib/utils/offer-export-columns.ts";
import {
  oneParam,
  parseOfferFilters,
  parseOfferPage,
  parseOfferSearch,
  parseOfferSort,
  parseOfferTab,
} from "../src/lib/utils/offer-list-params.ts";

/*
 * Phase 24's two quiet ways of being wrong.
 *
 * ONE: THE CLOCK.
 *
 * The server runs on UTC. Dubai is UTC+04:00. A redemption taken at 02:00
 * Dubai time is 22:00 the previous day in UTC, so a file that formats
 * timestamps in the server's zone reports it on the wrong DAY — and nobody
 * notices, because the figures are all correct and only the date column is
 * shifted. Somebody reconciling a month's discounts then finds the first
 * four hours of every day filed under the day before.
 *
 * TWO: THE MONEY.
 *
 * Every money value in this module arrives as an exact decimal string
 * converted from bigint fils, and is passed through untouched. The failure
 * this guards against is not the exotic one — doubles hold a dealership's
 * figures exactly until about 9,000,000,000,000,000, which no showroom will
 * reach. It is the ordinary one: Number("5000.00") is 5000, and
 * String(5000) is "5000". Parse a money string to "format" it and the cents
 * are gone, so AED 5,000.00 prints as 5000 and a column of currency stops
 * reading as currency. The same step turns 1234.50 into 1234.5.
 *
 * That is a presentation defect rather than a wrong number, which is
 * exactly why it would survive a review: every figure is still correct.
 *
 * Both are tested here against real values rather than reasoned about.
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
   THE CLOCK
========================================================= */

/*
 * 2026-03-15T22:30:00Z is 02:30 on 16 March in Dubai. A formatter using the
 * server's own zone says the 15th.
 */
check("late-evening UTC is the next day in Dubai", formatCellDate("2026-03-15T22:30:00Z"), "16 Mar 2026");

check(
  "and the time reads as Dubai local, not UTC",
  formatCellTime("2026-03-15T22:30:00Z"),
  "16 Mar 2026, 02:30",
);

/* The other edge: just before midnight Dubai is still the same day. */
check("19:59 UTC is the same evening in Dubai", formatCellDate("2026-03-15T19:59:00Z"), "15 Mar 2026");

check("midday is unambiguous either way", formatCellDate("2026-03-15T08:00:00Z"), "15 Mar 2026");

/*
 * Dubai has no daylight saving, so the offset is +04:00 in both June and
 * December. This is the assumption the whole module rests on, and it is
 * cheap to pin.
 */
check("no DST in June", formatCellTime("2026-06-15T20:00:00Z"), "16 Jun 2026, 00:00");
check("no DST in December", formatCellTime("2026-12-15T20:00:00Z"), "16 Dec 2026, 00:00");

/* Rubbish in, a dash out — never "Invalid Date" in a column of figures. */
check("an unparseable date is a dash", formatCellDate("not a date"), "—");
check("an empty date is a dash", formatCellDate(null), "—");
check("an unparseable time is a dash", formatCellTime("13/15/2026"), "—");

/* =========================================================
   THE MONEY
========================================================= */

/* These must pass through byte for byte. */
check("an ordinary amount is unchanged", formatCellMoney("1234567.89"), "1234567.89");
check("a very large amount is unchanged", formatCellMoney("92233720368.54"), "92233720368.54");
check("a trailing-zero amount keeps its zeros", formatCellMoney("5000.00"), "5000.00");
check("a half-dirham amount keeps its zero", formatCellMoney("1234.50"), "1234.50");
check("no money is a dash, not a zero", formatCellMoney(null), "—");
check("an empty string is a dash, not a zero", formatCellMoney(""), "—");

/*
 * The distinction that matters: a dash means "nothing recorded", 0.00 means
 * "recorded as nothing". A campaign that has given away nothing yet and a
 * campaign whose discount column failed to load must not read the same.
 */
check("a genuine zero stays a zero", formatCellMoney("0.00"), "0.00");
checkTrue("and is not the same as absent", formatCellMoney("0.00") !== formatCellMoney(null));

/*
 * The real regression guard: route money through formatCell, the function
 * the generators actually call, and confirm nothing in the chain parsed it.
 *
 * The second assertion is what makes the first meaningful. These three
 * values are chosen because a float round-trip visibly damages each of
 * them — if someone later "tidies" formatCellMoney into
 * Number(value).toFixed(2) or String(Number(value)), the first assertion
 * fails rather than passing for the wrong reason.
 */
for (const amount of ["5000.00", "1234.50", "0.00"]) {
  check(`formatCell leaves ${amount} exact`, formatCell("money", amount), amount);

  checkTrue(
    `a float round-trip would damage ${amount}, so that assertion is meaningful`,
    String(Number(amount)) !== amount,
  );
}

/* And a large value, to pin that nothing clamps or rounds at scale. */
check("formatCell leaves a large amount exact", formatCell("money", "92233720368.54"), "92233720368.54");

/* Counts are presentational, so separators are fine. */
check("counts get thousands separators", formatCellNumber(1234567), "1,234,567");
check("a zero count shows as zero", formatCellNumber(0), "0");
check("an absent count is a dash", formatCellNumber(null), "—");

/* =========================================================
   TEXT
========================================================= */

check("text passes through", formatCell("text", "Eid Special"), "Eid Special");
check("empty text is a dash", formatCell("text", ""), "—");
check("absent text is a dash", formatCell("text", null), "—");

/* =========================================================
   THE PARSERS — WHY THE EXPORT MATCHES THE SCREEN
========================================================= */

check("a known tab is kept", parseOfferTab("active"), "active");
check("an unknown tab falls back to all", parseOfferTab("nonsense"), "all");
check("a missing tab falls back to all", parseOfferTab(undefined), "all");
check("a repeated tab key takes the first", parseOfferTab(["drafts", "active"]), "drafts");

check("a known sort is kept", parseOfferSort("newest"), "newest");
check("an unknown sort falls back to newest", parseOfferSort("by-vibes"), "newest");

/* A search term reaches a query, so it is capped. */
checkTrue("a long search is clamped to 100", parseOfferSearch("x".repeat(500)).length === 100);
check("a search is trimmed", parseOfferSearch("  eid  "), "eid");

/* A page number from a URL is whatever somebody typed. */
check("page 3 is page 3", parseOfferPage("3"), 3);
check("page 0 clamps to 1", parseOfferPage("0"), 1);
check("a negative page clamps to 1", parseOfferPage("-5"), 1);
check("a non-numeric page clamps to 1", parseOfferPage("abc"), 1);
check("a missing page is 1", parseOfferPage(undefined), 1);

/*
 * The filters are the part the export↔screen agreement actually rests on.
 * Every key the page reads must be read here too — a filter the route
 * forgets is a file holding rows the person was not looking at.
 */
const filters = parseOfferFilters({
  type: "seasonal",
  status: "active",
  discountType: "percentage",
  createdBy: "abc-123",
  from: "2026-01-01",
  to: "2026-03-31",
  page: "4",
});

check("every filter key is read", filters, {
  type: "seasonal",
  status: "active",
  discountType: "percentage",
  createdBy: "abc-123",
  from: "2026-01-01",
  to: "2026-03-31",
});

check("absent filters are empty strings, not undefined", parseOfferFilters({}), {
  type: "",
  status: "",
  discountType: "",
  createdBy: "",
  from: "",
  to: "",
});

/*
 * The count of filter keys is pinned deliberately. If somebody adds a
 * seventh filter to the drawer and the page, this fails until it is added
 * here too — which is the moment to remember the export route reads the
 * same object.
 */
check("there are six filter keys", Object.keys(parseOfferFilters({})).sort(), [
  "createdBy",
  "discountType",
  "from",
  "status",
  "to",
  "type",
]);

check("oneParam trims", oneParam("  x  "), "x");
check("oneParam handles arrays", oneParam(["a", "b"]), "a");
check("oneParam handles undefined", oneParam(undefined), "");
check("oneParam handles an empty array", oneParam([]), "");

/* =========================================================
   RESULT
========================================================= */

console.log(`\nexport-format-test: ${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
