import {
  ENQUIRY_SOURCES,
  ENQUIRY_TABS,
  ENQUIRY_TYPES,
  type EnquirySource,
  type EnquiryTab,
  type EnquiryType,
} from "@/src/lib/types/enquiry";
import { readParam } from "@/src/lib/utils/test-drive-list-filters";

/*
|--------------------------------------------------------------------------
| ENQUIRY LIST FILTERS
|--------------------------------------------------------------------------
|
| Pure functions, no server imports, so the page and the client component
| share one definition of what a filter means. Anything the URL can't be
| trusted to hold is dropped rather than passed to the database.
*/

type RawParams = Record<string, string | string[] | undefined>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The sentinel for "nobody has picked this up". Not a user id, so it can't collide. */
export const UNASSIGNED = "unassigned";

export type EnquirySortId = "newest" | "oldest" | "updated";

export interface EnquirySortOption {
  id: EnquirySortId;
  label: string;
  column: "created_at" | "updated_at";
  ascending: boolean;
}

export const ENQUIRY_SORTS: EnquirySortOption[] = [
  { id: "newest", label: "Newest first", column: "created_at", ascending: false },
  { id: "oldest", label: "Waiting longest", column: "created_at", ascending: true },
  { id: "updated", label: "Recently worked on", column: "updated_at", ascending: false },
];

export interface EnquiryFilters {
  type: EnquiryType | "";
  source: EnquirySource | "";
  /** A user id, UNASSIGNED, or "" for anyone. */
  assignedTo: string;
  /** created_at from, inclusive. yyyy-mm-dd. */
  from: string;
  /** created_at to, inclusive. yyyy-mm-dd. */
  to: string;
}

export const EMPTY_ENQUIRY_FILTERS: EnquiryFilters = {
  type: "",
  source: "",
  assignedTo: "",
  from: "",
  to: "",
};

export const ENQUIRY_FILTER_PARAM_KEYS = ["type", "source", "who", "from", "to"] as const;

/* =========================================================
   READERS
========================================================= */

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | "" {
  return (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

function asDate(value: string): string {
  if (!DATE_RE.test(value)) return "";

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "";

  return value;
}

/* =========================================================
   PARSE
========================================================= */

export function parseEnquiryTab(raw: string): EnquiryTab {
  return (ENQUIRY_TABS as readonly string[]).includes(raw) ? (raw as EnquiryTab) : "open";
}

export function parseEnquiryFilters(params: RawParams): EnquiryFilters {
  const who = readParam(params, "who");

  const from = asDate(readParam(params, "from"));
  const to = asDate(readParam(params, "to"));

  // A backwards range returns nothing and reads as a bug rather than a typo.
  const datesValid = from === "" || to === "" || from <= to;

  return {
    type: oneOf(readParam(params, "type"), ENQUIRY_TYPES),
    source: oneOf(readParam(params, "source"), ENQUIRY_SOURCES),
    assignedTo: who === UNASSIGNED || UUID_RE.test(who) ? who.toLowerCase() : "",
    from: datesValid ? from : "",
    to: datesValid ? to : "",
  };
}

export function parseEnquirySort(raw: string, openTab: boolean): EnquirySortOption {
  const found = ENQUIRY_SORTS.find((option) => option.id === raw);
  if (found) return found;

  /*
   * The open tab is a work queue, so the enquiry that has been waiting
   * longest comes first. Everywhere else is a record, so newest first.
   */
  const fallback: EnquirySortId = openTab ? "oldest" : "newest";
  return ENQUIRY_SORTS.find((option) => option.id === fallback) ?? ENQUIRY_SORTS[0];
}

/* =========================================================
   COUNT AND WRITE
========================================================= */

export function countActiveEnquiryFilters(filters: EnquiryFilters): number {
  return Object.values(filters).filter((value) => value !== "").length;
}

export function writeEnquiryFiltersToParams(params: URLSearchParams, filters: EnquiryFilters) {
  const pairs: [string, string][] = [
    ["type", filters.type],
    ["source", filters.source],
    ["who", filters.assignedTo],
    ["from", filters.from],
    ["to", filters.to],
  ];

  for (const [key, value] of pairs) {
    if (value === "") params.delete(key);
    else params.set(key, value);
  }
}

/** Removes every filter param, leaving the tab, search and sort untouched. */
export function clearEnquiryFilterParams(params: URLSearchParams) {
  for (const key of ENQUIRY_FILTER_PARAM_KEYS) params.delete(key);
}
