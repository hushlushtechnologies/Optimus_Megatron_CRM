import "server-only";

import { createClient } from "@/src/lib/supabase/server";

import { ENQUIRY_PAGE_SIZE } from "@/src/lib/constants/enquiries";
import { UNASSIGNED, type EnquiryFilters, type EnquirySortOption } from "@/src/lib/utils/enquiry-filters";
import { toDubaiIsoDate } from "@/src/lib/utils/test-drive-format";
import { cleanSearchTerm } from "@/src/lib/utils/test-drive-list-filters";

import { getEnquiryWorkflow } from "@/src/lib/supabase/enquiry-workflow-queries";
import { resolveNames } from "@/src/lib/supabase/enquiry-work-queries";
import { closedStatusKeys, openStatusKeys } from "@/src/lib/utils/enquiry-workflow";
import type {
  EnquiryCustomerVehicle,
  EnquiryDreamCarDetails,
  EnquiryFinanceDetails,
  EnquiryPhoto,
  EnquiryStockCar,
} from "@/src/lib/types/enquiry-details";
import type { EnquiryTimelineEntry } from "@/src/lib/types/enquiry-timeline";
import type {
  EnquiryActivityEntry,
  EnquiryCustomerMatch,
  EnquiryListResult,
  EnquiryListRow,
  EnquirySummary,
  EnquiryTab,
  EnquiryTypeCounts,
} from "@/src/lib/types/enquiry";

/* =========================================================
   QUERY SHAPE
========================================================= */

/**
 * The filter methods the helper below calls.
 *
 * PostgREST's builder types are enormous and change between versions, so the
 * helper is generic over "something with the methods we use" rather than
 * naming the builder or reaching for `any`.
 */
export interface FilterableQuery<T> {
  eq(column: string, value: string): T;
  neq(column: string, value: string): T;
  is(column: string, value: null): T;
  in(column: string, values: readonly string[]): T;
  gt(column: string, value: string): T;
  gte(column: string, value: string): T;
  lte(column: string, value: string): T;
  or(filters: string): T;
}

/* =========================================================
   COLUMNS
========================================================= */

const LIST_COLUMNS = [
  "id, enquiry_number, version",
  "status, status_label, status_tone, status_is_open",
  "enquiry_type, type_label, general_category",
  "source, priority, priority_rank, subject",
  "full_name, email, phone, preferred_contact, message",
  "car_id, vehicle_text, vehicle_title, stock_id",
  "location_id, location_name",
  "page_url, utm_source, utm_medium, utm_campaign",
  "assigned_to, assigned_to_name",
  "customer_id, customer_name, customer_number",
  "lead_id, lead_number, deal_id, test_drive_id, reservation_id",
  "converted_at, closed_at, close_reason, archived_at",
  "created_by, created_by_name, created_at, updated_at",
  "last_activity_at, next_follow_up_at",
].join(", ");

/*
 * Which statuses count as open is configuration, not code: it is the is_open
 * flag on enquiry_statuses. Reading it means a status added in settings lands
 * on the right tab without anyone editing a list in here.
 *
 * getEnquiryWorkflow is request-cached, so asking for it in three places
 * costs one round of queries.
 */
export async function statusGroups() {
  const workflow = await getEnquiryWorkflow();
  return { open: openStatusKeys(workflow), closed: closedStatusKeys(workflow) };
}

/* =========================================================
   LIST
========================================================= */

/**
 * Narrows a query to one tab, one search term and one set of filters.
 *
 * Exported so the export route can build its rows through the very same
 * filter logic the list uses. Reimplementing the filters there is how an
 * export quietly stops matching what is on screen — somebody exports "the
 * current view" and gets a different set of enquiries.
 *
 * Shared by the list and the per-type counts so the two can't drift. A badge
 * that says 12 and a tab that then shows 9 is worse than no badge at all.
 *
 * `skipType` is for the type tabs, which need each type counted against
 * everything *except* the type filter — otherwise every tab but the chosen
 * one reads zero.
 */
export function applyEnquiryQuery<T extends FilterableQuery<T>>(
  query: T,
  params: {
    tab: EnquiryTab;
    search: string;
    filters: EnquiryFilters;
    groups: { open: string[]; closed: string[] };
    /** One timestamp for the whole request, so two counts can't disagree. */
    now: string;
    skipType?: boolean;
  },
): T {
  let next = query.is("archived_at", null);

  /* ---- Tab ---- */

  const { tab, groups } = params;

  if (tab === "open") next = next.in("status", groups.open);
  else if (tab === "converted") next = next.eq("status", "Converted");
  else if (tab === "spam") next = next.eq("status", "Spam");
  else if (tab === "closed")
    next = next.in(
      "status",
      groups.closed.filter((key) => key !== "Converted" && key !== "Spam"),
    );

  /*
   * Spam is excluded from "All" on purpose. Someone asking to see everything
   * means every real enquiry; junk has a tab of its own to be looked at
   * deliberately, which is also where a wrongly flagged one is recovered.
   */
  if (tab === "all") next = next.neq("status", "Spam");

  /* ---- Search ---- */

  const term = cleanSearchTerm(params.search);

  if (term) {
    const like = `%${term}%`;

    /*
     * One box, every identifier somebody might have in front of them: the
     * enquiry number off an email, a customer number off a record, a stock
     * number off a windscreen, or just a name half-remembered.
     */
    next = next.or(
      [
        `enquiry_number.ilike."${like}"`,
        `full_name.ilike."${like}"`,
        `email.ilike."${like}"`,
        `phone.ilike."${like}"`,
        `customer_number.ilike."${like}"`,
        `subject.ilike."${like}"`,
        `message.ilike."${like}"`,
        `vehicle_text.ilike."${like}"`,
        `vehicle_title.ilike."${like}"`,
        `stock_id.ilike."${like}"`,
      ].join(","),
    );
  }

  /* ---- Filters ---- */

  const { filters } = params;

  if (filters.type && !params.skipType) next = next.eq("enquiry_type", filters.type);

  /*
   * Narrows within the tab rather than replacing it. The bar only offers
   * statuses that belong to the tab you are on, so this can't contradict it.
   */
  if (filters.status) next = next.eq("status", filters.status);

  if (filters.priority) next = next.eq("priority", filters.priority);
  if (filters.source) next = next.eq("source", filters.source);
  if (filters.location) next = next.eq("location_id", filters.location);

  if (filters.assignedTo === UNASSIGNED) next = next.is("assigned_to", null);
  else if (filters.assignedTo) next = next.eq("assigned_to", filters.assignedTo);

  /* ---- Follow-up state ---- */

  if (filters.followUp === "none") next = next.is("next_follow_up_at", null);
  else if (filters.followUp === "due") next = next.lte("next_follow_up_at", params.now);
  else if (filters.followUp === "upcoming") next = next.gt("next_follow_up_at", params.now);

  if (filters.from) next = next.gte("created_at", `${filters.from}T00:00:00+04:00`);
  if (filters.to) next = next.lte("created_at", `${filters.to}T23:59:59+04:00`);

  return next;
}

export async function getEnquiryList(params: {
  tab: EnquiryTab;
  search: string;
  page: number;
  filters: EnquiryFilters;
  sort: EnquirySortOption;
}): Promise<EnquiryListResult | null> {
  const supabase = await createClient();

  const from = (params.page - 1) * ENQUIRY_PAGE_SIZE;
  const groups = await statusGroups();

  const base = supabase.from("enquiry_list").select(LIST_COLUMNS, { count: "exact" });

  const query = applyEnquiryQuery(base, { ...params, groups, now: new Date().toISOString() });

  /*
   * id is the tiebreaker on every sort. Without it two enquiries submitted in
   * the same moment can swap places between pages, so one is seen twice and
   * another is never seen at all.
   */
  const { sort } = params;

  let ordered = query.order(sort.column, {
    ascending: sort.ascending,
    ...(sort.nullsFirst === undefined ? {} : { nullsFirst: sort.nullsFirst }),
  });

  if (sort.then) ordered = ordered.order(sort.then.column, { ascending: sort.then.ascending });

  const { data, error, count } = await ordered
    .order("id", { ascending: true })
    .range(from, from + ENQUIRY_PAGE_SIZE - 1);

  if (error) {
    console.error("getEnquiryList error:", error);
    return null;
  }

  return { rows: (data ?? []) as unknown as EnquiryListRow[], totalCount: count ?? 0 };
}

/* =========================================================
   TYPE COUNTS
========================================================= */

/**
 * How many enquiries sit behind each type tab.
 *
 * Counted against the tab, search and filters currently applied, so the
 * number on a tab is the number of rows clicking it produces. The type
 * filter itself is left out, or every tab but the chosen one would read zero.
 *
 * A failure returns null and the tabs simply show no counts, which is a
 * better outcome than a page with no tabs.
 */
export async function getEnquiryTypeCounts(params: {
  tab: EnquiryTab;
  search: string;
  filters: EnquiryFilters;
}): Promise<EnquiryTypeCounts | null> {
  const supabase = await createClient();

  const workflow = await getEnquiryWorkflow();
  const groups = await statusGroups();

  const head = { count: "exact" as const, head: true };

  const types = workflow.types.map((item) => item.key);

  /* One moment for every count, or "due" could mean two different things. */
  const now = new Date().toISOString();

  /*
   * One query per tab, built the same way: null is the All tab, a key is one
   * type. Each is a head-only count, so no rows cross the wire.
   */
  const [allRes, ...typeRes] = await Promise.all(
    [null, ...types].map((key) => {
      const base = supabase.from("enquiry_list").select("id", head);
      const narrowed = applyEnquiryQuery(base, { ...params, groups, now, skipType: true });

      return key === null ? narrowed : narrowed.eq("enquiry_type", key);
    }),
  );

  if (allRes.error) {
    console.error("getEnquiryTypeCounts error:", allRes.error);
    return null;
  }

  const byType: Record<string, number> = {};

  types.forEach((key, index) => {
    byType[key] = typeRes[index]?.count ?? 0;
  });

  return { all: allRes.count ?? 0, byType };
}

/* =========================================================
   SUMMARY
========================================================= */

/**
 * How many days of history the trend and the comparison look at.
 *
 * 30-day windows rather than calendar months on purpose: on the 3rd of the
 * month, "down 85% vs last month" is an artefact of the calendar, not a fall
 * in enquiries. Two equal windows can be compared on any day of the year.
 */
const TREND_DAYS = 14;
const WINDOW_DAYS = 30;

/** Above this, one query can no longer count the window honestly. */
const TREND_ROW_CAP = 5000;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The six figures above the list.
 *
 * Head-only counts rather than one aggregate query: each is a cheap index
 * scan, they run in parallel, and one failing doesn't take the others down
 * with it. The last query is the only one that reads rows, and it is capped.
 *
 * Nothing here counts archived enquiries, and only the Spam tab counts Spam:
 * the dashboard is meant to describe the work in front of the team, not the
 * size of the table.
 */
export async function getEnquirySummary(): Promise<EnquirySummary | null> {
  const supabase = await createClient();

  const head = { count: "exact" as const, head: true };
  const groups = await statusGroups();

  /* Open, but past New. "In progress" means somebody has it. */
  const working = groups.open.filter((key) => key !== "New");

  const live = () => supabase.from("enquiry_list").select("id", head).is("archived_at", null);

  const now = new Date().toISOString();

  const [totalRes, newRes, progressRes, followUpRes, overdueRes, completedRes, urgentRes, historyRes] =
    await Promise.all([
      live().neq("status", "Spam"),
      live().eq("status", "New"),
      live().in("status", working),
      live().in("status", groups.open).not("next_follow_up_at", "is", null),
      live().in("status", groups.open).lte("next_follow_up_at", now),
      live().in("status", ["Completed", "Converted"]),
      live().in("status", groups.open).in("priority", ["Urgent", "High"]),

      /*
       * The only query that reads rows. Two windows' worth, so the comparison
       * and the sparkline come from one round trip.
       */
      supabase
        .from("enquiry_list")
        .select("created_at")
        .is("archived_at", null)
        .neq("status", "Spam")
        .gte("created_at", daysAgoIso(WINDOW_DAYS * 2))
        .order("created_at", { ascending: false })
        .limit(TREND_ROW_CAP),
    ]);

  const counts = [totalRes, newRes, progressRes, followUpRes, overdueRes, completedRes, urgentRes];
  const failed = counts.find((item) => item.error);

  if (failed?.error) {
    console.error("getEnquirySummary error:", failed.error);
    return null;
  }

  /* =======================================================
     HISTORY

     Its own failure is survivable: seven real counts are worth showing
     without a sparkline, so this falls back to null rather than null-ing
     the whole summary.
  ======================================================= */

  let last30: number | null = null;
  let previous30: number | null = null;
  let trend: number[] | null = null;

  const history = (historyRes.data ?? []) as { created_at: string }[];

  if (historyRes.error) {
    console.error("getEnquirySummary history error:", historyRes.error);
  } else if (history.length >= TREND_ROW_CAP) {
    /*
     * The window was truncated, so both halves are wrong by an unknown
     * amount. A comparison drawn from it would look authoritative and be
     * false, which is worse than no comparison at all.
     */
    console.warn("getEnquirySummary: history capped, skipping trend");
  } else {
    const boundary = Date.parse(daysAgoIso(WINDOW_DAYS));

    last30 = history.filter((row) => Date.parse(row.created_at) >= boundary).length;
    previous30 = history.length - last30;

    /* ---- Daily buckets, keyed by the calendar date in Dubai ---- */

    const perDay = new Map<string, number>();

    for (const row of history) {
      const day = toDubaiIsoDate(row.created_at);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }

    const days: string[] = [];

    for (let back = TREND_DAYS - 1; back >= 0; back -= 1) {
      days.push(toDubaiIsoDate(new Date(Date.now() - back * 24 * 60 * 60 * 1000)));
    }

    trend = days.map((day) => perDay.get(day) ?? 0);
  }

  return {
    total: totalRes.count ?? 0,
    newCount: newRes.count ?? 0,
    inProgress: progressRes.count ?? 0,
    followUpsDue: followUpRes.count ?? 0,
    followUpsOverdue: overdueRes.count ?? 0,
    completed: completedRes.count ?? 0,
    urgent: urgentRes.count ?? 0,
    last30,
    previous30,
    trend,
  };
}

/* =========================================================
   ONE ENQUIRY
========================================================= */

/** null means not found, or not visible to this person. */
export async function getEnquiry(id: string): Promise<EnquiryListRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("enquiry_list").select(LIST_COLUMNS).eq("id", id).maybeSingle();

  if (error) {
    console.error("getEnquiry error:", error);
    return null;
  }

  return (data as unknown as EnquiryListRow) ?? null;
}

/** The activity trail, newest first. null means it couldn't be loaded. */
export async function getEnquiryActivity(id: string): Promise<EnquiryActivityEntry[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("enquiry_activity")
    .select("id, enquiry_id, activity_type, description, old_value, new_value, changed_by, changed_at")
    .eq("enquiry_id", id)
    .order("changed_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("getEnquiryActivity error:", error);
    return null;
  }

  const rows = (data ?? []) as Omit<EnquiryActivityEntry, "changed_by_name">[];

  /*
   * Names are resolved in a second query rather than through a join, because
   * enquiry_activity has no view of its own and embedding profiles here would
   * mean a foreign-key relationship the client can't see through RLS.
   */
  const ids = [...new Set(rows.map((row) => row.changed_by).filter((value): value is string => !!value))];

  const names = new Map<string, string>();

  if (ids.length > 0) {
    const { data: people, error: peopleError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);

    if (peopleError) console.error("getEnquiryActivity names error:", peopleError);

    for (const person of (people ?? []) as { id: string; full_name: string | null }[]) {
      names.set(person.id, person.full_name?.trim() || "Someone");
    }
  }

  return rows.map((row) => ({
    ...row,
    changed_by_name: row.changed_by ? (names.get(row.changed_by) ?? "Someone") : null,
  }));
}

/* =========================================================
   CUSTOMER MATCHING
========================================================= */

/**
 * Customers who look like the person who sent this enquiry.
 *
 * Matched on email and on the last nine digits of the phone number, so a
 * number saved as 050 123 4567 still matches one typed as +971 50 123 4567.
 * Offered as suggestions only — a person decides, never the code.
 */
export async function findCustomerMatches(
  email: string | null,
  phone: string | null,
): Promise<EnquiryCustomerMatch[]> {
  const supabase = await createClient();

  const digits = (phone ?? "").replace(/\D/g, "");
  const tail = digits.length >= 9 ? digits.slice(-9) : null;

  if (!email && !tail) return [];

  const matches = new Map<string, EnquiryCustomerMatch>();

  const [byEmail, byPhone] = await Promise.all([
    email
      ? supabase
          .from("customer_profiles")
          .select("id, full_name, customer_number, email, phone")
          .ilike("email", email)
          .is("archived_at", null)
          .limit(5)
      : Promise.resolve({ data: [], error: null }),

    tail
      ? supabase
          .from("customer_profiles")
          .select("id, full_name, customer_number, email, phone")
          .ilike("phone", `%${tail}`)
          .is("archived_at", null)
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (byEmail.error) console.error("findCustomerMatches email error:", byEmail.error);
  if (byPhone.error) console.error("findCustomerMatches phone error:", byPhone.error);

  type Row = {
    id: string;
    full_name: string;
    customer_number: string;
    email: string | null;
    phone: string | null;
  };

  for (const row of (byEmail.data ?? []) as Row[]) {
    matches.set(row.id, { ...row, matchedOn: "email" });
  }

  for (const row of (byPhone.data ?? []) as Row[]) {
    if (!matches.has(row.id)) matches.set(row.id, { ...row, matchedOn: "phone" });
  }

  return [...matches.values()];
}

/* =========================================================
   LOOKUPS
========================================================= */

export interface EnquiryLookups {
  staff: { id: string; full_name: string }[];
  /** Only open stages: a lead can't start life won or lost. */
  stages: { id: string; name: string }[];
  /**
   * Stock, with what it is listed at and where it stands.
   *
   * The price and showroom come along because a trade-in has to put the
   * customer's car next to one of ours, and "what does this one cost" is the
   * first question anybody asks.
   */
  cars: {
    id: string;
    display_title: string;
    stock_id: string;
    regular_price: number | null;
    location_name: string | null;
  }[];
  /** Active showrooms, for the location filter. */
  locations: { id: string; name: string }[];
  /** Makes the showroom knows about. A customer's own car may not be one of them. */
  brands: { id: string; name: string }[];
  /**
   * Fuel and gearbox names, taken from the inventory lookups.
   *
   * A dream car stores these as text rather than a foreign key, because a
   * customer may want something nobody stocks. Offering the same words
   * inventory uses is what lets a future match compare like with like.
   */
  fuelTypes: string[];
  transmissions: string[];
}

type CarRow = {
  id: string;
  display_title: string;
  stock_id: string;
  regular_price: string | number | null;
  location: { name: string } | { name: string }[] | null;
};

export async function getEnquiryLookups(): Promise<EnquiryLookups> {
  const supabase = await createClient();

  const [staffRes, stagesRes, carsRes, locationsRes, brandsRes, fuelRes, gearboxRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase
      .from("lead_stages")
      .select("id, name")
      .eq("stage_type", "open")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("cars")
      .select("id, display_title, stock_id, regular_price, location:locations(name)")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("locations").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("brands").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("fuel_types").select("name").eq("is_active", true).order("sort_order"),
    supabase.from("transmission_types").select("name").eq("is_active", true).order("sort_order"),
  ]);

  if (staffRes.error) console.error("getEnquiryLookups staff error:", staffRes.error);
  if (stagesRes.error) console.error("getEnquiryLookups stages error:", stagesRes.error);
  if (carsRes.error) console.error("getEnquiryLookups cars error:", carsRes.error);
  if (locationsRes.error) console.error("getEnquiryLookups locations error:", locationsRes.error);
  if (brandsRes.error) console.error("getEnquiryLookups brands error:", brandsRes.error);
  if (fuelRes.error) console.error("getEnquiryLookups fuel error:", fuelRes.error);
  if (gearboxRes.error) console.error("getEnquiryLookups transmission error:", gearboxRes.error);

  return {
    staff: ((staffRes.data ?? []) as { id: string; full_name: string | null }[]).map((person) => ({
      id: person.id,
      full_name: person.full_name?.trim() || "Unnamed",
    })),
    stages: (stagesRes.data ?? []) as { id: string; name: string }[],
    cars: ((carsRes.data ?? []) as unknown as CarRow[]).map((car) => ({
      id: car.id,
      display_title: car.display_title,
      stock_id: car.stock_id,
      regular_price: car.regular_price === null ? null : Number(car.regular_price),
      /* The embed is an object or a one-item array depending on the join. */
      location_name: Array.isArray(car.location)
        ? (car.location[0]?.name ?? null)
        : (car.location?.name ?? null),
    })),
    locations: (locationsRes.data ?? []) as { id: string; name: string }[],
    brands: (brandsRes.data ?? []) as { id: string; name: string }[],
    fuelTypes: ((fuelRes.data ?? []) as { name: string }[]).map((row) => row.name),
    transmissions: ((gearboxRes.data ?? []) as { name: string }[]).map((row) => row.name),
  };
}

/* =========================================================
   TYPE-SPECIFIC DETAILS
========================================================= */

/**
 * The finance figures behind one enquiry.
 *
 * null means there are none — most enquiries aren't finance enquiries — and
 * that is not an error. A failure is logged and also returns null, because
 * a detail page that renders without one optional block beats one that
 * doesn't render at all.
 */
export async function getEnquiryFinanceDetails(id: string): Promise<EnquiryFinanceDetails | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("enquiry_finance_details")
    .select(
      "vehicle_price, down_payment, term_months, monthly_budget, employment_type, bank_preference, notes",
    )
    .eq("enquiry_id", id)
    .maybeSingle();

  if (error) {
    console.error("getEnquiryFinanceDetails error:", error);
    return null;
  }

  if (!data) return null;

  const row = data as {
    vehicle_price: string | number | null;
    down_payment: string | number | null;
    term_months: number | null;
    monthly_budget: string | number | null;
    employment_type: string | null;
    bank_preference: string | null;
    notes: string | null;
  };

  /* numeric comes back as a string over the wire, so every figure is coerced once, here. */
  const money = (value: string | number | null) => (value === null ? null : Number(value));

  return {
    vehiclePrice: money(row.vehicle_price),
    downPayment: money(row.down_payment),
    termMonths: row.term_months,
    monthlyBudget: money(row.monthly_budget),
    employmentType: (row.employment_type as EnquiryFinanceDetails["employmentType"]) ?? null,
    bankPreference: row.bank_preference,
    notes: row.notes,
  };
}

/**
 * The customer's own cars on one enquiry.
 *
 * A list rather than one row because a trade-in has two sides: the car they
 * own and the one they want. Sell My Car has exactly one, role "selling".
 *
 * null means it couldn't be read. An empty array means this enquiry has no
 * customer vehicle, which is true of most of them.
 */
export async function getEnquiryCustomerVehicles(id: string): Promise<EnquiryCustomerVehicle[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("enquiry_customer_vehicles")
    .select(
      `id, role, brand_id, brand_other, model, variant, year, mileage_km,
       registration_emirate, spec, exterior_color, interior_color, condition,
       has_accident_history, accident_notes, has_service_history, service_notes,
       asking_price, location_id, description,
       estimated_value, valuation_notes, proposed_offer, offer_expires_at,
       evaluated_by, evaluated_at,
       brands ( name )`,
    )
    .eq("enquiry_id", id)
    .order("role");

  if (error) {
    console.error("getEnquiryCustomerVehicles error:", error);
    return null;
  }

  type Row = {
    id: string;
    role: string;
    brand_id: string | null;
    brand_other: string | null;
    model: string | null;
    variant: string | null;
    year: number | null;
    mileage_km: number | null;
    registration_emirate: string | null;
    spec: string | null;
    exterior_color: string | null;
    interior_color: string | null;
    condition: string | null;
    has_accident_history: boolean | null;
    accident_notes: string | null;
    has_service_history: boolean | null;
    service_notes: string | null;
    asking_price: string | number | null;
    location_id: string | null;
    description: string | null;
    estimated_value: string | number | null;
    valuation_notes: string | null;
    proposed_offer: string | number | null;
    offer_expires_at: string | null;
    evaluated_by: string | null;
    evaluated_at: string | null;
    brands: { name: string } | { name: string }[] | null;
  };

  const money = (value: string | number | null) => (value === null ? null : Number(value));

  /* The embed arrives as an object or a one-item array depending on the join. */
  const brandName = (value: Row["brands"]) =>
    Array.isArray(value) ? (value[0]?.name ?? null) : (value?.name ?? null);

  const rows = (data ?? []) as unknown as Row[];

  /*
   * The evaluator's name comes from a second query, not an embed: profiles is
   * reachable here, but the foreign key from this table isn't one the client
   * can see through RLS. At most two cars per enquiry, so one lookup.
   */
  const names = await resolveNames(
    supabase,
    rows.map((row) => row.evaluated_by),
  );

  return rows.map((row) => ({
    id: row.id,
    role: row.role as EnquiryCustomerVehicle["role"],
    brandId: row.brand_id,
    brandOther: row.brand_other,
    brandName: brandName(row.brands),
    model: row.model,
    variant: row.variant,
    year: row.year,
    mileageKm: row.mileage_km,
    registrationEmirate: row.registration_emirate as EnquiryCustomerVehicle["registrationEmirate"],
    spec: row.spec as EnquiryCustomerVehicle["spec"],
    exteriorColor: row.exterior_color,
    interiorColor: row.interior_color,
    condition: row.condition as EnquiryCustomerVehicle["condition"],
    hasAccidentHistory: row.has_accident_history,
    accidentNotes: row.accident_notes,
    hasServiceHistory: row.has_service_history,
    serviceNotes: row.service_notes,
    askingPrice: money(row.asking_price),
    locationId: row.location_id,
    description: row.description,
    estimatedValue: money(row.estimated_value),
    valuationNotes: row.valuation_notes,
    proposedOffer: money(row.proposed_offer),
    offerExpiresAt: row.offer_expires_at,
    evaluatedAt: row.evaluated_at,
    evaluatedByName: row.evaluated_by ? (names.get(row.evaluated_by) ?? null) : null,
  }));
}

/**
 * Photos attached to one enquiry, with short-lived links to view them.
 *
 * The bucket is private, so each photo needs a signed URL. An hour is long
 * enough to look through an enquiry and short enough that a link copied out
 * of the page stops working before it can be passed around.
 */
export async function getEnquiryPhotos(id: string): Promise<EnquiryPhoto[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("enquiry_media")
    .select("id, customer_vehicle_id, storage_path, title")
    .eq("enquiry_id", id)
    .eq("media_type", "image")
    .order("sort_order");

  if (error) {
    console.error("getEnquiryPhotos error:", error);
    return null;
  }

  const rows = (data ?? []) as {
    id: string;
    customer_vehicle_id: string | null;
    storage_path: string;
    title: string | null;
  }[];

  if (rows.length === 0) return [];

  const { data: signed, error: signError } = await supabase.storage.from("enquiry-media").createSignedUrls(
    rows.map((row) => row.storage_path),
    60 * 60,
  );

  if (signError) console.error("getEnquiryPhotos sign error:", signError);

  /* One failed signature loses one thumbnail, not the whole set. */
  const urls = new Map((signed ?? []).map((item) => [item.path ?? "", item.signedUrl]));

  return rows.map((row) => ({
    id: row.id,
    vehicleId: row.customer_vehicle_id,
    storagePath: row.storage_path,
    url: urls.get(row.storage_path) ?? null,
    title: row.title,
  }));
}

/**
 * One car from stock, for the side of a trade-in that is ours.
 *
 * Read directly rather than taken from the lookups list, which is capped at
 * 300 for a dropdown: the car on a six-month-old enquiry will not be in it.
 */
export async function getEnquiryStockCar(carId: string): Promise<EnquiryStockCar | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cars")
    .select("id, display_title, stock_id, regular_price, location:locations(name)")
    .eq("id", carId)
    .maybeSingle();

  if (error) {
    console.error("getEnquiryStockCar error:", error);
    return null;
  }

  if (!data) return null;

  const row = data as unknown as CarRow;

  return {
    id: row.id,
    title: row.display_title,
    stockId: row.stock_id,
    listedPrice: row.regular_price === null ? null : Number(row.regular_price),
    locationName: Array.isArray(row.location)
      ? (row.location[0]?.name ?? null)
      : (row.location?.name ?? null),
  };
}

/**
 * What a customer wants that the showroom hasn't got.
 *
 * null means there is no dream car row, which is true of every other kind
 * of enquiry. A failure is logged and also returns null: the rest of the
 * detail page is worth showing without it.
 */
export async function getEnquiryDreamCarDetails(id: string): Promise<EnquiryDreamCarDetails | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("enquiry_dream_car_details")
    .select(
      `brand_id, brand_other, model, variant, year_from, year_to,
       budget_min, budget_max, exterior_color, interior_color, max_mileage_km,
       fuel_type, transmission, spec, features, timeline, notes,
       matched_car_id, matched_at,
       brands ( name )`,
    )
    .eq("enquiry_id", id)
    .maybeSingle();

  if (error) {
    console.error("getEnquiryDreamCarDetails error:", error);
    return null;
  }

  if (!data) return null;

  type Row = {
    brand_id: string | null;
    brand_other: string | null;
    model: string | null;
    variant: string | null;
    year_from: number | null;
    year_to: number | null;
    budget_min: string | number | null;
    budget_max: string | number | null;
    exterior_color: string | null;
    interior_color: string | null;
    max_mileage_km: number | null;
    fuel_type: string | null;
    transmission: string | null;
    spec: string | null;
    features: string | null;
    timeline: string | null;
    notes: string | null;
    matched_car_id: string | null;
    matched_at: string | null;
    brands: { name: string } | { name: string }[] | null;
  };

  const row = data as unknown as Row;
  const money = (value: string | number | null) => (value === null ? null : Number(value));

  return {
    brandId: row.brand_id,
    brandOther: row.brand_other,
    brandName: Array.isArray(row.brands) ? (row.brands[0]?.name ?? null) : (row.brands?.name ?? null),
    model: row.model,
    variant: row.variant,
    yearFrom: row.year_from,
    yearTo: row.year_to,
    budgetMin: money(row.budget_min),
    budgetMax: money(row.budget_max),
    exteriorColor: row.exterior_color,
    interiorColor: row.interior_color,
    maxMileageKm: row.max_mileage_km,
    fuelType: row.fuel_type,
    transmission: row.transmission,
    spec: row.spec as EnquiryDreamCarDetails["spec"],
    features: row.features,
    timeline: row.timeline as EnquiryDreamCarDetails["timeline"],
    notes: row.notes,
    matchedCarId: row.matched_car_id,
    matchedAt: row.matched_at,
  };
}

/* =========================================================
   TIMELINE
========================================================= */

/**
 * Everything that has happened to one enquiry, newest first.
 *
 * Three tables, read in parallel and merged here rather than in SQL: a view
 * with three UNION branches would have to agree on a column list none of
 * them really shares, and this way each source keeps its own shape.
 *
 * null means the timeline couldn't be loaded, which is not the same as an
 * enquiry nothing has happened to.
 */
/**
 * Which kind of timeline entry an activity row is.
 *
 * Anything unrecognised reads as a plain edit rather than as "created": an
 * unknown type showing up as the enquiry arriving is worse than showing up
 * as a change nobody labelled, because the first is a confident lie about
 * when the enquiry came in.
 */
function activityKind(activityType: string): EnquiryTimelineEntry["kind"] {
  switch (activityType) {
    case "created":
      return "created";
    case "converted":
      return "converted";
    case "valuation":
      return "valuation";
    case "archived":
      return "archived";
    default:
      return "edited";
  }
}

export async function getEnquiryTimeline(id: string): Promise<EnquiryTimelineEntry[] | null> {
  const supabase = await createClient();

  const [activityRes, statusRes, assignmentRes] = await Promise.all([
    supabase
      .from("enquiry_activity")
      .select("id, activity_type, description, changed_by, changed_at")
      .eq("enquiry_id", id)
      .order("changed_at", { ascending: false })
      .limit(100),
    supabase
      .from("enquiry_status_history")
      .select("id, from_status, to_status, reason, changed_by, changed_at")
      .eq("enquiry_id", id)
      .order("changed_at", { ascending: false })
      .limit(100),
    supabase
      .from("enquiry_staff_assignment_history")
      .select("id, previous_staff_id, new_staff_id, assigned_by, reason, assigned_at")
      .eq("enquiry_id", id)
      .order("assigned_at", { ascending: false })
      .limit(100),
  ]);

  const failed = [activityRes, statusRes, assignmentRes].find((item) => item.error);

  if (failed?.error) {
    console.error("getEnquiryTimeline error:", failed.error);
    return null;
  }

  type ActivityRow = {
    id: string;
    activity_type: string;
    description: string;
    changed_by: string | null;
    changed_at: string;
  };
  type StatusRow = {
    id: string;
    from_status: string | null;
    to_status: string;
    reason: string | null;
    changed_by: string | null;
    changed_at: string;
  };
  type AssignmentRow = {
    id: string;
    previous_staff_id: string | null;
    new_staff_id: string | null;
    assigned_by: string | null;
    reason: string | null;
    assigned_at: string;
  };

  const activity = (activityRes.data ?? []) as ActivityRow[];
  const statuses = (statusRes.data ?? []) as StatusRow[];
  const assignments = (assignmentRes.data ?? []) as AssignmentRow[];

  /*
   * Every person named anywhere in the three lists, resolved in one query.
   * Doing it per row would be dozens of round trips for a single screen.
   */
  const ids = new Set<string>();

  for (const row of activity) if (row.changed_by) ids.add(row.changed_by);
  for (const row of statuses) if (row.changed_by) ids.add(row.changed_by);
  for (const row of assignments) {
    for (const value of [row.assigned_by, row.previous_staff_id, row.new_staff_id]) {
      if (value) ids.add(value);
    }
  }

  const names = new Map<string, string>();

  if (ids.size > 0) {
    const { data: people, error: peopleError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...ids]);

    if (peopleError) console.error("getEnquiryTimeline names error:", peopleError);

    for (const person of (people ?? []) as { id: string; full_name: string | null }[]) {
      names.set(person.id, person.full_name?.trim() || "Someone");
    }
  }

  const who = (value: string | null) => (value ? (names.get(value) ?? "Someone") : null);

  const entries: EnquiryTimelineEntry[] = [
    ...activity.map((row) => ({
      id: `activity:${row.id}`,
      kind: activityKind(row.activity_type),
      title: row.description,
      detail: null,
      actorName: who(row.changed_by),
      at: row.changed_at,
    })),

    ...statuses.map((row) => ({
      id: `status:${row.id}`,
      kind: "status" as const,
      title: row.from_status ? `${row.from_status} → ${row.to_status}` : `Set to ${row.to_status}`,
      detail: row.reason,
      actorName: who(row.changed_by),
      at: row.changed_at,
    })),

    ...assignments.map((row) => {
      const from = who(row.previous_staff_id);
      const to = who(row.new_staff_id);

      return {
        id: `assignment:${row.id}`,
        kind: "assignment" as const,
        title: to ? (from ? `Reassigned from ${from} to ${to}` : `Assigned to ${to}`) : "Assignment cleared",
        detail: row.reason,
        actorName: who(row.assigned_by),
        at: row.assigned_at,
      };
    }),
  ];

  return entries.sort((a, b) => b.at.localeCompare(a.at));
}
