import { parseReportRangeId, type ReportRangeId } from "@/src/lib/utils/report-time";
import type { ReportSectionId } from "@/src/lib/types/report-sections";

/*
|--------------------------------------------------------------------------
| REPORT FILTERS
|--------------------------------------------------------------------------
|
| One filter model for every report section, and a registry saying which
| filters each section actually has.
|
| WHY THE REGISTRY
|
| The sprint plan asks for ten filters and then says "do not show irrelevant
| filters on unrelated reports". Those pull in opposite directions unless
| something decides, per section, which of the ten apply. A payment method
| filter on an inventory ageing report is noise; a lead source filter on a
| payments report is nonsense.
|
| Declaring it here means the drawer, the chips and the export route all read
| the same list. The alternative — each component deciding for itself — is how
| a filter ends up applied to the query and missing from the chips, so a
| person cannot see or remove the thing narrowing their report.
|
| EVERYTHING IS A STRING, AND EVERYTHING IS OPTIONAL
|
| Filters arrive from a URL, so a value is whatever somebody typed or
| whatever an old bookmark still holds. Nothing is validated against a lookup
| list here: values are applied as equality filters, so an unknown value
| returns no rows rather than every row — the safe direction for a filter to
| fail in, and the same choice the offers list made in Sprint 8.
*/

export type ReportFilterId =
  | "location"
  | "staff"
  | "brand"
  | "model"
  | "vehicle"
  | "collection"
  | "customerSource"
  | "leadSource"
  | "paymentMethod"
  | "status";

export type ReportFilters = Readonly<Record<ReportFilterId, string>>;

export const EMPTY_REPORT_FILTERS: ReportFilters = {
  location: "",
  staff: "",
  brand: "",
  model: "",
  vehicle: "",
  collection: "",
  customerSource: "",
  leadSource: "",
  paymentMethod: "",
  status: "",
};

export const ALL_FILTER_IDS = Object.keys(EMPTY_REPORT_FILTERS) as ReportFilterId[];

/** What each filter is called on screen. */
export const FILTER_LABELS: Record<ReportFilterId, string> = {
  location: "Showroom",
  staff: "Staff",
  brand: "Brand",
  model: "Model",
  vehicle: "Vehicle",
  collection: "Collection",
  customerSource: "Customer source",
  leadSource: "Lead source",
  paymentMethod: "Payment method",
  status: "Status",
};

/*
|--------------------------------------------------------------------------
| WHICH FILTERS EACH SECTION HAS
|--------------------------------------------------------------------------
|
| Ordered as they should appear in the drawer: the ones people reach for
| first at the top.
|
| The overview deliberately has only showroom and staff. It summarises eight
| domains at once, and a brand filter there would silently mean different
| things in different cards — "sales of this brand" next to "enquiries about
| this brand" next to "test drives in this brand" — some of which have no
| brand at all. A filter that changes some cards and not others is worse than
| no filter.
*/
export const SECTION_FILTERS: Record<ReportSectionId, readonly ReportFilterId[]> = {
  overview: ["location", "staff"],
  sales: ["location", "staff", "brand", "model", "vehicle", "collection", "status"],
  inventory: ["location", "brand", "model", "collection", "status"],
  customers: ["location", "staff", "customerSource", "leadSource", "status"],
  operations: ["location", "staff", "brand", "status"],
  staff: ["location"],
  payments: ["location", "staff", "paymentMethod", "status"],
  promotions: ["location", "status"],
};

/** The filters this section supports, in display order. */
export function filtersForSection(section: ReportSectionId): readonly ReportFilterId[] {
  return SECTION_FILTERS[section] ?? [];
}

/*
|--------------------------------------------------------------------------
| READING A URL
|--------------------------------------------------------------------------
*/

export type RawParam = string | string[] | undefined;

function one(value: RawParam): string {
  const first = Array.isArray(value) ? value[0] : value;
  /* Capped: a filter value reaches a query. */
  return (first ?? "").trim().slice(0, 120);
}

/**
 * The filters in a URL, narrowed to the ones this section has.
 *
 * Narrowing matters: without it a stale link carrying `paymentMethod=Cash`
 * would apply that filter to an inventory report, where it would match
 * nothing and leave the reader staring at an empty page with no chip
 * explaining why.
 */
export function parseReportFilters(
  params: Record<string, RawParam>,
  section: ReportSectionId,
): ReportFilters {
  const allowed = new Set(filtersForSection(section));
  const result: Record<ReportFilterId, string> = { ...EMPTY_REPORT_FILTERS };

  for (const id of ALL_FILTER_IDS) {
    if (allowed.has(id)) result[id] = one(params[id]);
  }

  return result;
}

/** Everything a report screen reads from its URL. */
export interface ReportQuery {
  section: ReportSectionId;
  range: ReportRangeId;
  customFrom: string;
  customTo: string;
  filters: ReportFilters;
}

export function parseReportQuery(
  params: Record<string, RawParam>,
  section: ReportSectionId,
): ReportQuery {
  return {
    section,
    range: parseReportRangeId(params.range),
    customFrom: one(params.from),
    customTo: one(params.to),
    filters: parseReportFilters(params, section),
  };
}

/*
|--------------------------------------------------------------------------
| WRITING A URL
|--------------------------------------------------------------------------
*/

/**
 * A query string for a report view.
 *
 * Empty values are omitted rather than written as `brand=`, so a cleared
 * filter leaves no trace in the address bar and a shared link carries only
 * what was actually applied.
 */
export function reportQueryString(query: {
  range?: ReportRangeId;
  customFrom?: string;
  customTo?: string;
  filters?: Partial<ReportFilters>;
  /** Extra params a section owns, such as the sales report's `view`. */
  extra?: Record<string, string | undefined>;
}): string {
  const params = new URLSearchParams();

  if (query.range && query.range !== "this-month") params.set("range", query.range);

  if (query.range === "custom") {
    if (query.customFrom) params.set("from", query.customFrom);
    if (query.customTo) params.set("to", query.customTo);
  }

  for (const id of ALL_FILTER_IDS) {
    const value = query.filters?.[id];
    if (value) params.set(id, value);
  }

  for (const [key, value] of Object.entries(query.extra ?? {})) {
    if (value) params.set(key, value);
  }

  const text = params.toString();
  return text ? `?${text}` : "";
}

/*
|--------------------------------------------------------------------------
| CHIPS
|--------------------------------------------------------------------------
*/

export interface ActiveFilterChip {
  id: ReportFilterId;
  label: string;
  value: string;
  /** How the value should read on the chip, when a name is known. */
  display: string;
}

/**
 * The filters currently narrowing a report, for the chip row.
 *
 * `names` maps an id to a human name, because a filter value is usually a
 * UUID. A chip reading "Showroom: 4f3a…" tells somebody nothing they can act
 * on, so where the name is unknown the raw value is shown and the chip still
 * works — removing it is the point.
 *
 * Only filters the section has are returned, so a stale URL parameter cannot
 * produce a chip for a filter that is not being applied.
 */
export function activeFilterChips(
  filters: ReportFilters,
  section: ReportSectionId,
  names: Partial<Record<ReportFilterId, Record<string, string>>> = {},
): ActiveFilterChip[] {
  return filtersForSection(section)
    .filter((id) => filters[id] !== "")
    .map((id) => ({
      id,
      label: FILTER_LABELS[id],
      value: filters[id],
      display: names[id]?.[filters[id]] ?? filters[id],
    }));
}

/** How many filters are narrowing this report. For the drawer's badge. */
export function activeFilterCount(filters: ReportFilters, section: ReportSectionId): number {
  return filtersForSection(section).filter((id) => filters[id] !== "").length;
}

/** The same filters with one removed. */
export function withoutFilter(filters: ReportFilters, id: ReportFilterId): ReportFilters {
  return { ...filters, [id]: "" };
}

/** Every filter cleared. The period is not a filter and is left alone. */
export function clearedFilters(): ReportFilters {
  return { ...EMPTY_REPORT_FILTERS };
}
