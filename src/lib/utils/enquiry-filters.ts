import { ENQUIRY_PRIORITIES, ENQUIRY_TABS, type EnquiryTab } from "@/src/lib/types/enquiry";
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

export type EnquirySortId = "newest" | "oldest" | "updated" | "priority" | "follow_up" | "activity";

export interface EnquirySortOption {
  id: EnquirySortId;
  label: string;
  column: string;
  ascending: boolean;
  /** Where rows with no value go. Left out, Postgres decides by direction. */
  nullsFirst?: boolean;
  /**
   * A second column, applied before the id tiebreak.
   *
   * Priority needs one: four bands over four hundred rows would otherwise
   * leave every Urgent enquiry in whatever order the table felt like.
   */
  then?: { column: string; ascending: boolean };
}

export const ENQUIRY_SORTS: EnquirySortOption[] = [
  { id: "newest", label: "Newest first", column: "created_at", ascending: false },
  { id: "oldest", label: "Waiting longest", column: "created_at", ascending: true },
  { id: "updated", label: "Recently updated", column: "updated_at", ascending: false },
  {
    id: "priority",
    label: "Most urgent first",
    column: "priority_rank",
    ascending: true,
    then: { column: "created_at", ascending: true },
  },
  {
    id: "follow_up",
    label: "Follow-up soonest",
    column: "next_follow_up_at",
    ascending: true,
    /* An enquiry with nothing scheduled is not the most urgent thing on the list. */
    nullsFirst: false,
  },
  { id: "activity", label: "Last activity", column: "last_activity_at", ascending: false },
];

/* =========================================================
   FOLLOW-UP STATE
========================================================= */

export const ENQUIRY_FOLLOW_UP_STATES = ["due", "upcoming", "none"] as const;

export type EnquiryFollowUpState = (typeof ENQUIRY_FOLLOW_UP_STATES)[number] | "";

export const ENQUIRY_FOLLOW_UP_LABELS: Record<Exclude<EnquiryFollowUpState, "">, string> = {
  due: "Follow-up due",
  upcoming: "Follow-up scheduled",
  none: "No follow-up set",
};

export interface EnquiryFilters {
  /** A type key, or "" for every kind. Validated against the database, not a list in here. */
  type: string;
  /** A status key, or "" for every status in the current tab. */
  status: string;
  /** A priority, or "" for any. */
  priority: string;
  /** A source key, or "" for anywhere. */
  source: string;
  /** A user id, UNASSIGNED, or "" for anyone. */
  assignedTo: string;
  /** A location id, or "" for every showroom. */
  location: string;
  /** Whether a follow-up is due, scheduled, or not set at all. */
  followUp: EnquiryFollowUpState;
  /** created_at from, inclusive. yyyy-mm-dd. */
  from: string;
  /** created_at to, inclusive. yyyy-mm-dd. */
  to: string;
}

export const EMPTY_ENQUIRY_FILTERS: EnquiryFilters = {
  type: "",
  status: "",
  priority: "",
  source: "",
  assignedTo: "",
  location: "",
  followUp: "",
  from: "",
  to: "",
};

export const ENQUIRY_FILTER_PARAM_KEYS = [
  "type",
  "status",
  "priority",
  "source",
  "who",
  "loc",
  "due",
  "from",
  "to",
] as const;

/* =========================================================
   READERS
========================================================= */

/** For the vocabularies that really are a fixed list in code. */
function oneOf<T extends string>(value: string, allowed: readonly T[]): T | "" {
  return (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

/**
 * A type or source from the URL.
 *
 * Checked for shape rather than against a hard-coded list. The vocabulary
 * lives in enquiry_types and enquiry_sources now, so a type added in
 * settings has to produce a working tab and a shareable link without this
 * file being edited. An unknown value simply matches no rows, which is the
 * right answer for a link to something that no longer exists.
 */
function vocabularyParam(value: string): string {
  const trimmed = value.trim();

  return trimmed.length > 0 && trimmed.length <= 60 ? trimmed : "";
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
  const location = readParam(params, "loc");

  const from = asDate(readParam(params, "from"));
  const to = asDate(readParam(params, "to"));

  // A backwards range returns nothing and reads as a bug rather than a typo.
  const datesValid = from === "" || to === "" || from <= to;

  return {
    type: vocabularyParam(readParam(params, "type")),
    status: vocabularyParam(readParam(params, "status")),
    priority: oneOf(readParam(params, "priority"), ENQUIRY_PRIORITIES),
    source: vocabularyParam(readParam(params, "source")),
    assignedTo: who === UNASSIGNED || UUID_RE.test(who) ? who.toLowerCase() : "",
    location: UUID_RE.test(location) ? location.toLowerCase() : "",
    followUp: oneOf(readParam(params, "due"), ENQUIRY_FOLLOW_UP_STATES),
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
    ["status", filters.status],
    ["priority", filters.priority],
    ["source", filters.source],
    ["who", filters.assignedTo],
    ["loc", filters.location],
    ["due", filters.followUp],
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
