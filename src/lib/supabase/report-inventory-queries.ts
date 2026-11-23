import { createClient } from "@/src/lib/supabase/server";
import {
  AGGREGATE_PAGE,
  figureFailed,
  figureFrom,
  figureOf,
  interpretCounted,
  type CountedRows,
} from "@/src/lib/supabase/report-aggregate";
import { money, sumFils } from "@/src/lib/utils/report-money";
import { resolveReportRange, type ReportRangeId } from "@/src/lib/utils/report-time";
import { bucketByAge, daysBetweenDubai } from "@/src/lib/utils/report-grouping";
import type { ReportFilters } from "@/src/lib/utils/report-filters";
import {
  AGEING_BUCKETS,
  SLOW_MOVING_DAYS,
  type AgeingBucket,
  type InventoryBreakdownRow,
  type InventoryReportData,
  type StatusCount,
} from "@/src/lib/types/report-inventory";

/*
|--------------------------------------------------------------------------
| THE INVENTORY REPORT
|--------------------------------------------------------------------------
|
| Reads `cars` and the `vehicle_statuses` lookup, which is how the rest of
| the application decides what "available" means. Nothing here hardcodes a
| status name, because the statuses are rows in a table that somebody can
| add to.
|
| HOW THE STATUSES WORK, SINCE IT IS NOT OBVIOUS
|
| vehicle_statuses holds two kinds of status, separated by `category`:
|
|   availability   available, reserved, sold, coming-soon
|   publishing     draft, published, ...
|
| and a car carries both — `availability_status_id` and
| `publishing_status_id`. So a car can be simultaneously "available" and
| "draft", which is exactly why the draft count is reported separately rather
| than as another slice of the availability pie. Adding them together would
| double-count, and the plan calls that out by name.
|
| ONE FETCH, SEVERAL BREAKDOWNS
|
| The brand, collection, location and ageing breakdowns all need the same
| rows, so they share one query rather than running four. That also means
| they share one completeness verdict, which is correct: if the fetch was
| capped, every breakdown derived from it is partial together.
|
| TWO POPULATIONS, SAID OUT LOUD
|
|   breakdowns   every non-archived vehicle, whatever its status
|   ageing       available vehicles only
|
| Ageing a sold car measures how long ago it was entered, which is not a
| useful number. The UI labels both.
*/

/** Columns the breakdowns and ageing need. */
const CAR_COLUMNS = `
  id, regular_price, created_at,
  brand:brands(name),
  collection:collections(name),
  location:locations(name),
  availability_status:vehicle_statuses!cars_availability_status_id_fkey(slug, name)
`;

interface CarRow {
  id: string;
  regular_price: string | number | null;
  created_at: string;
  brand: { name: string } | null;
  collection: { name: string } | null;
  location: { name: string } | null;
  availability_status: { slug: string; name: string } | null;
}

function groupBy(
  rows: CarRow[],
  pick: (row: CarRow) => string | null,
  currency: string,
): InventoryBreakdownRow[] {
  const groups = new Map<string, { count: number; fils: bigint }>();

  for (const row of rows) {
    /* A vehicle with no brand is still a vehicle. Dropping it would make the
       breakdown's total quietly disagree with the headline count. */
    const name = pick(row)?.trim() || "Unassigned";

    const current = groups.get(name) ?? { count: 0, fils: 0n };
    current.count += 1;
    current.fils += sumFils([row], (r) => r.regular_price);
    groups.set(name, current);
  }

  return Array.from(groups.entries())
    .map(([name, group]) => ({
      id: name,
      name,
      count: group.count,
      value: money(group.fils, currency),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getInventoryReport(
  range: ReportRangeId,
  filters: ReportFilters,
  options: { customFrom?: string; customTo?: string } = {},
): Promise<InventoryReportData> {
  const supabase = await createClient();

  const resolved = resolveReportRange(range, {
    customFrom: options.customFrom,
    customTo: options.customTo,
  });

  const { data: settings } = await supabase.from("sales_settings").select("currency").maybeSingle();
  const currency = (settings?.currency as string | undefined) ?? "AED";

  /* ---- the status lookup ---- */

  const { data: statusRows, error: statusError } = await supabase
    .from("vehicle_statuses")
    .select("id, slug, name, category");

  if (statusError) {
    console.error("getInventoryReport statuses error:", statusError);
  }

  const statuses = (statusRows ?? []) as { id: string; slug: string; name: string; category: string }[];

  const availability = statuses.filter((status) => status.category === "availability");
  const draftStatus = statuses.find(
    (status) => status.category === "publishing" && status.slug === "draft",
  );

  /* ---- exact counts ---- */

  /*
   * The filters, applied inline rather than through a generic helper.
   *
   * A helper taking a Supabase query builder has to be typed against
   * PostgrestFilterBuilder's generics, and the version that compiles ends up
   * so cast-laden that it no longer checks anything. Four `if`s per query is
   * duller and actually type-safe.
   */
  const countBase = () =>
    supabase.from("cars").select("id", { count: "exact", head: true }).is("archived_at", null);

  const withFilters = (query: ReturnType<typeof countBase>) => {
    let next = query;
    if (filters.location) next = next.eq("location_id", filters.location);
    if (filters.brand) next = next.eq("brand_id", filters.brand);
    if (filters.model) next = next.eq("model_id", filters.model);
    if (filters.collection) next = next.eq("collection_id", filters.collection);
    return next;
  };

  const totalQuery = withFilters(countBase());

  /*
   * One count per availability status, driven by the lookup rather than a
   * hardcoded list — so a status somebody adds next year appears here
   * without a code change, and a status that is renamed does not silently
   * become zero.
   */
  const statusQueries = availability.map((status) =>
    withFilters(countBase()).eq("availability_status_id", status.id),
  );

  const draftQuery = draftStatus
    ? withFilters(countBase()).eq("publishing_status_id", draftStatus.id)
    : null;

  /* Added during the period, by record creation. */
  let addedQuery = withFilters(countBase()).lt("created_at", resolved.toIso);
  if (resolved.fromIso) addedQuery = addedQuery.gte("created_at", resolved.fromIso);

  /* ---- the rows every breakdown shares ---- */

  let rowsQuery = supabase
    .from("cars")
    .select(CAR_COLUMNS, { count: "exact" })
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(AGGREGATE_PAGE);

  if (filters.location) rowsQuery = rowsQuery.eq("location_id", filters.location);
  if (filters.brand) rowsQuery = rowsQuery.eq("brand_id", filters.brand);
  if (filters.model) rowsQuery = rowsQuery.eq("model_id", filters.model);
  if (filters.collection) rowsQuery = rowsQuery.eq("collection_id", filters.collection);

  const [totalRes, draftRes, addedRes, rowsRes, ...statusResults] = await Promise.all([
    totalQuery,
    draftQuery ?? Promise.resolve({ count: null, error: null }),
    addedQuery,
    rowsQuery,
    ...statusQueries,
  ]);

  /* ---- counts into figures ---- */

  const countOf = (
    result: { count: number | null; error: { message?: string } | null },
    label: string,
  ) => {
    if (result.error) {
      console.error(`inventory count "${label}" failed:`, result.error);
      return figureFailed<number>(result.error.message ?? "query failed");
    }
    if (typeof result.count !== "number") return figureFailed<number>("no count returned");
    return figureOf(result.count, true, result.count);
  };

  const byStatus: StatusCount[] = availability.map((status, index) => ({
    slug: status.slug,
    label: status.name,
    count: (statusResults[index] as { count: number | null })?.count ?? 0,
  }));

  const anyStatusFailed = statusResults.some(
    (result) => (result as { error: unknown }).error !== null,
  );

  /* ---- rows into breakdowns ---- */

  const counted: CountedRows<CarRow> = interpretCounted<CarRow>(
    rowsRes,
    AGGREGATE_PAGE,
    "inventory rows",
  );

  const rows = counted.rows;
  const now = new Date();

  const availableRows = rows.filter(
    (row) => row.availability_status?.slug === "available",
  );

  /* One pass, and every vehicle lands in exactly one bucket — see
     bucketByAge for why overlapping bounds are a real hazard here. */
  const bucketed = bucketByAge(availableRows, (row) => row.created_at, AGEING_BUCKETS, now);

  const ageing: AgeingBucket[] = AGEING_BUCKETS.map((bucket) => {
    const inBucket = bucketed.get(bucket.id) ?? [];

    return {
      id: bucket.id,
      label: bucket.label,
      count: inBucket.length,
      value: money(sumFils(inBucket, (row) => row.regular_price), currency),
    };
  });

  const slowMovingCount = availableRows.filter(
    (row) => daysBetweenDubai(row.created_at, now) > SLOW_MOVING_DAYS,
  ).length;

  return {
    total: countOf(totalRes, "total"),
    byStatus: anyStatusFailed
      ? figureFailed<StatusCount[]>("a status count failed")
      : figureOf(byStatus),
    draft: draftStatus ? countOf(draftRes, "draft") : figureOf(0),

    /*
     * Listed value of available stock, summed from the fetched rows — so it
     * carries the same completeness as the breakdowns. A value figure from a
     * capped fetch says it is partial rather than reporting a short total as
     * the whole.
     */
    availableValue: figureFrom(counted, () =>
      money(sumFils(availableRows, (row) => row.regular_price), currency),
    ),

    byBrand: figureFrom(counted, (fetched) => groupBy(fetched, (row) => row.brand?.name ?? null, currency)),
    byCollection: figureFrom(counted, (fetched) =>
      groupBy(fetched, (row) => row.collection?.name ?? null, currency),
    ),
    byLocation: figureFrom(counted, (fetched) =>
      groupBy(fetched, (row) => row.location?.name ?? null, currency),
    ),

    ageing: figureFrom(counted, () => ageing),
    slowMoving: figureFrom(counted, () => slowMovingCount),
    addedInPeriod: countOf(addedRes, "added in period"),

    currency,
    rangeLabel: resolved.label,
  };
}
