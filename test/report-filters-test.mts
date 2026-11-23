import {
  ALL_FILTER_IDS,
  EMPTY_REPORT_FILTERS,
  activeFilterChips,
  activeFilterCount,
  clearedFilters,
  filtersForSection,
  parseReportFilters,
  parseReportQuery,
  reportQueryString,
  withoutFilter,
} from "../src/lib/utils/report-filters.ts";
import { REPORT_SECTIONS } from "../src/lib/types/report-sections.ts";

/*
 * The filter layer has one quiet way of going wrong, and it is the reason
 * the section registry exists.
 *
 * A filter can be APPLIED to a query while being INVISIBLE in the chip row.
 * When that happens a person sees an empty report, no explanation, and no
 * way to clear the thing causing it — because the only control that could
 * clear it was never rendered.
 *
 * Both halves read the same registry, and the tests below hold them to it:
 * what a section parses is exactly what it chips, for every section.
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
   THE REGISTRY
========================================================= */

/* Every section declares its filters, and declares only real ones. */
for (const section of REPORT_SECTIONS) {
  const ids = filtersForSection(section.id);

  checkTrue(
    `${section.id} declares only real filter ids`,
    ids.every((id) => (ALL_FILTER_IDS as string[]).includes(id)),
  );

  checkTrue(`${section.id} declares no duplicates`, new Set(ids).size === ids.length);
}

/* The overview is deliberately narrow: it summarises eight domains at once,
   and a brand filter there would mean different things in different cards. */
check("the overview has only showroom and staff", filtersForSection("overview"), ["location", "staff"]);

checkTrue("sales has more than the overview", filtersForSection("sales").length > 2);
checkTrue("payments has a payment method filter", filtersForSection("payments").includes("paymentMethod"));
checkTrue("inventory has NO staff filter", !filtersForSection("inventory").includes("staff"));
checkTrue(
  "inventory has NO payment method filter",
  !filtersForSection("inventory").includes("paymentMethod"),
);

/* =========================================================
   PARSING, AND NARROWING
========================================================= */

const salesParams = {
  brand: "ferrari",
  location: "dubai-main",
  paymentMethod: "Cash",
  range: "last-month",
};

const salesFilters = parseReportFilters(salesParams, "sales");

check("a filter the section has is read", salesFilters.brand, "ferrari");
check("and another", salesFilters.location, "dubai-main");

/*
 * The important one. paymentMethod is not a sales filter, so a stale link
 * carrying it must not narrow the sales report. If it did, the reader would
 * see fewer deals than they should with nothing saying why.
 */
check("a filter the section does NOT have is ignored", salesFilters.paymentMethod, "");

const inventoryFilters = parseReportFilters(salesParams, "inventory");
check("the same URL on inventory keeps brand", inventoryFilters.brand, "ferrari");
check("but drops staff-shaped params it has no column for", inventoryFilters.staff, "");

/* Values are trimmed and capped: they reach a query. */
check("a value is trimmed", parseReportFilters({ brand: "  ferrari  " }, "sales").brand, "ferrari");
checkTrue(
  "a very long value is capped",
  parseReportFilters({ brand: "x".repeat(500) }, "sales").brand.length === 120,
);
check("a repeated key takes the first", parseReportFilters({ brand: ["a", "b"] }, "sales").brand, "a");
check("a missing param is an empty string", parseReportFilters({}, "sales").brand, "");

/* Every key is present on the result, so no consumer has to guard undefined. */
checkTrue(
  "the result always has every key",
  ALL_FILTER_IDS.every((id) => id in parseReportFilters({}, "overview")),
);

/* =========================================================
   PARSE AND CHIP AGREE — FOR EVERY SECTION
========================================================= */

/*
 * The invariant: what a section chips is exactly what that section has.
 *
 * NOTE ON HOW THIS IS TESTED, because the obvious way does not work.
 *
 * The first version of this test parsed a URL holding every filter and then
 * compared the parsed set against the chipped set. It passed — and it also
 * passed when activeFilterChips was mutated to ignore the section entirely,
 * which means it was testing nothing.
 *
 * The reason is that parseReportFilters already blanks the filters a section
 * does not have, so by the time the chips saw the object there was nothing
 * foreign left in it to leak. The test exercised the narrowing twice and the
 * chips not at all.
 *
 * So the filters are built DIRECTLY here, every key populated, bypassing the
 * parser. That is also the realistic case: any future code that assembles a
 * ReportFilters from a form, or carries one across sections, arrives at the
 * chips unnarrowed, and the chips have to hold the line themselves.
 */
const everyFilterSet = Object.fromEntries(
  ALL_FILTER_IDS.map((id) => [id, `value-${id}`]),
) as Record<(typeof ALL_FILTER_IDS)[number], string>;

for (const section of REPORT_SECTIONS) {
  const expected = [...filtersForSection(section.id)].sort();

  const chippedIds = activeFilterChips(everyFilterSet, section.id)
    .map((chip) => chip.id)
    .sort();

  check(`${section.id}: chips exactly the filters it has`, chippedIds, expected);

  check(
    `${section.id}: the count matches the chips`,
    activeFilterCount(everyFilterSet, section.id),
    expected.length,
  );

  /* And the other half: the parser narrows to the same set. */
  const parsed = parseReportFilters(everyFilterSet, section.id);
  const appliedIds = ALL_FILTER_IDS.filter((id) => parsed[id] !== "").sort();

  check(`${section.id}: parses exactly the filters it has`, appliedIds, expected);
}

/* =========================================================
   CHIPS
========================================================= */

const chipFilters = parseReportFilters({ brand: "abc-123", location: "loc-9" }, "sales");

const chips = activeFilterChips(chipFilters, "sales", {
  brand: { "abc-123": "Ferrari" },
});

check("a chip is labelled by its filter", chips.find((c) => c.id === "brand")?.label, "Brand");
check("and shows a name when one is known", chips.find((c) => c.id === "brand")?.display, "Ferrari");

/*
 * A UUID with no name still chips, showing the raw value. A chip reading
 * "Showroom: loc-9" is not pretty, but it can be removed — which is the
 * point of the chip. Dropping it would leave the filter applied and
 * invisible.
 */
check("an unnamed value still chips", chips.find((c) => c.id === "location")?.display, "loc-9");
check("and keeps its real value for removal", chips.find((c) => c.id === "location")?.value, "loc-9");

check("an empty filter does not chip", activeFilterChips(EMPTY_REPORT_FILTERS, "sales"), []);

/* =========================================================
   REMOVING AND CLEARING
========================================================= */

const removed = withoutFilter(chipFilters, "brand");
check("removing a filter empties it", removed.brand, "");
check("and leaves the others alone", removed.location, "loc-9");

check("clearing empties everything", clearedFilters(), EMPTY_REPORT_FILTERS);

/* =========================================================
   WRITING A URL
========================================================= */

check("no filters and the default period is a bare URL", reportQueryString({ range: "this-month" }), "");

check(
  "the default period is omitted, not written out",
  reportQueryString({ range: "this-month", filters: { brand: "ferrari" } }),
  "?brand=ferrari",
);

check(
  "a non-default period is written",
  reportQueryString({ range: "last-month" }),
  "?range=last-month",
);

/* An empty filter leaves no trace, so a cleared filter does not linger in a
   shared link as `brand=`. */
check(
  "empty filters are omitted",
  reportQueryString({ range: "year", filters: { brand: "", location: "loc-1" } }),
  "?range=year&location=loc-1",
);

/* Custom bounds belong to the custom period and nothing else. */
check(
  "custom bounds are written for a custom period",
  reportQueryString({ range: "custom", customFrom: "2026-01-01", customTo: "2026-03-31" }),
  "?range=custom&from=2026-01-01&to=2026-03-31",
);

check(
  "and NOT written for any other period",
  reportQueryString({ range: "year", customFrom: "2026-01-01", customTo: "2026-03-31" }),
  "?range=year",
);

check(
  "a section's own params come through",
  reportQueryString({ range: "this-month", extra: { view: "table" } }),
  "?view=table",
);

check(
  "and an empty extra is omitted",
  reportQueryString({ range: "this-month", extra: { view: undefined } }),
  "",
);

/* =========================================================
   THE WHOLE QUERY
========================================================= */

const query = parseReportQuery(
  { range: "custom", from: "2026-02-01", to: "2026-02-28", brand: "ferrari", paymentMethod: "Cash" },
  "sales",
);

check("the period is read", query.range, "custom");
check("the custom bounds are read", [query.customFrom, query.customTo], ["2026-02-01", "2026-02-28"]);
check("the section is carried", query.section, "sales");
check("section filters are read", query.filters.brand, "ferrari");
check("and foreign ones are not", query.filters.paymentMethod, "");

check("an unknown period falls back", parseReportQuery({ range: "last-fortnight" }, "sales").range, "this-month");

/* A round trip: parse a URL, write it back, parse again — same filters. */
const roundTripped = parseReportFilters(
  Object.fromEntries(new URLSearchParams(reportQueryString({ range: "year", filters: query.filters }).slice(1))),
  "sales",
);
check("filters survive a round trip through a URL", roundTripped, query.filters);

/* =========================================================
   RESULT
========================================================= */

console.log(`\nreport-filters-test: ${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
