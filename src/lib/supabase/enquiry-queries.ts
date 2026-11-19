import "server-only";

import { createClient } from "@/src/lib/supabase/server";

import { ENQUIRY_PAGE_SIZE } from "@/src/lib/constants/enquiries";
import { UNASSIGNED, type EnquiryFilters, type EnquirySortOption } from "@/src/lib/utils/enquiry-filters";
import { getDubaiToday } from "@/src/lib/utils/test-drive-format";
import { cleanSearchTerm } from "@/src/lib/utils/test-drive-list-filters";

import type {
  EnquiryActivityEntry,
  EnquiryCustomerMatch,
  EnquiryListResult,
  EnquiryListRow,
  EnquirySummary,
  EnquiryTab,
} from "@/src/lib/types/enquiry";

/* =========================================================
   COLUMNS
========================================================= */

const LIST_COLUMNS =
  "id, enquiry_number, status, enquiry_type, source, full_name, email, phone, preferred_contact, message, car_id, vehicle_text, vehicle_title, stock_id, page_url, utm_source, utm_medium, utm_campaign, assigned_to, assigned_to_name, customer_id, customer_name, customer_number, lead_id, lead_number, converted_at, closed_at, close_reason, created_by, created_by_name, created_at, updated_at";

/** Statuses that still need somebody to do something. */
const OPEN_STATUSES = ["New", "In Review"] as const;

/* =========================================================
   HELPERS
========================================================= */

/**
 * The first moment of the current month in Dubai, as an ISO string.
 *
 * Written with the offset rather than as a bare date, because a bare date is
 * read as UTC midnight — which in Dubai is 4am, so the last four hours of the
 * previous month would be counted in this one.
 */
function monthStartIso(): string {
  return `${getDubaiToday().slice(0, 7)}-01T00:00:00+04:00`;
}

function dayAgoIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

/* =========================================================
   LIST
========================================================= */

export async function getEnquiryList(params: {
  tab: EnquiryTab;
  search: string;
  page: number;
  filters: EnquiryFilters;
  sort: EnquirySortOption;
}): Promise<EnquiryListResult | null> {
  const supabase = await createClient();

  const from = (params.page - 1) * ENQUIRY_PAGE_SIZE;

  let query = supabase.from("enquiry_list").select(LIST_COLUMNS, { count: "exact" });

  /* ---- Tab ---- */

  if (params.tab === "open") query = query.in("status", [...OPEN_STATUSES]);
  else if (params.tab === "converted") query = query.eq("status", "Converted");
  else if (params.tab === "spam") query = query.eq("status", "Spam");
  else if (params.tab === "closed") query = query.eq("status", "Closed");

  /*
   * Spam is excluded from "All" on purpose. Someone asking to see everything
   * means every real enquiry; junk has a tab of its own to be looked at
   * deliberately, which is also where a wrongly flagged one is recovered.
   */
  if (params.tab === "all") query = query.neq("status", "Spam");

  /* ---- Search ---- */

  const term = cleanSearchTerm(params.search);

  if (term) {
    const like = `%${term}%`;

    query = query.or(
      [
        `enquiry_number.ilike."${like}"`,
        `full_name.ilike."${like}"`,
        `email.ilike."${like}"`,
        `phone.ilike."${like}"`,
        `message.ilike."${like}"`,
        `vehicle_text.ilike."${like}"`,
      ].join(","),
    );
  }

  /* ---- Filters ---- */

  if (params.filters.type) query = query.eq("enquiry_type", params.filters.type);
  if (params.filters.source) query = query.eq("source", params.filters.source);

  if (params.filters.assignedTo === UNASSIGNED) query = query.is("assigned_to", null);
  else if (params.filters.assignedTo) query = query.eq("assigned_to", params.filters.assignedTo);

  if (params.filters.from) query = query.gte("created_at", `${params.filters.from}T00:00:00+04:00`);
  if (params.filters.to) query = query.lte("created_at", `${params.filters.to}T23:59:59+04:00`);

  /*
   * id is the tiebreaker on every sort. Without it two enquiries submitted in
   * the same moment can swap places between pages, so one is seen twice and
   * another is never seen at all.
   */
  const { data, error, count } = await query
    .order(params.sort.column, { ascending: params.sort.ascending })
    .order("id", { ascending: true })
    .range(from, from + ENQUIRY_PAGE_SIZE - 1);

  if (error) {
    console.error("getEnquiryList error:", error);
    return null;
  }

  return { rows: (data ?? []) as unknown as EnquiryListRow[], totalCount: count ?? 0 };
}

/* =========================================================
   SUMMARY
========================================================= */

/**
 * The five figures above the list.
 *
 * Five head-only counts rather than one aggregate query: each is a cheap
 * index scan, they run in parallel, and one of them failing doesn't take the
 * other four down with it.
 */
export async function getEnquirySummary(): Promise<EnquirySummary | null> {
  const supabase = await createClient();

  const head = { count: "exact" as const, head: true };

  const [newRes, reviewRes, unassignedRes, convertedRes, staleRes] = await Promise.all([
    supabase.from("enquiry_list").select("id", head).eq("status", "New"),
    supabase.from("enquiry_list").select("id", head).eq("status", "In Review"),
    supabase
      .from("enquiry_list")
      .select("id", head)
      .in("status", [...OPEN_STATUSES])
      .is("assigned_to", null),
    supabase
      .from("enquiry_list")
      .select("id", head)
      .eq("status", "Converted")
      .gte("converted_at", monthStartIso()),
    supabase.from("enquiry_list").select("id", head).eq("status", "New").lt("created_at", dayAgoIso()),
  ]);

  const failed = [newRes, reviewRes, unassignedRes, convertedRes, staleRes].find((item) => item.error);

  if (failed?.error) {
    console.error("getEnquirySummary error:", failed.error);
    return null;
  }

  return {
    newCount: newRes.count ?? 0,
    inReviewCount: reviewRes.count ?? 0,
    unassignedCount: unassignedRes.count ?? 0,
    convertedMonth: convertedRes.count ?? 0,
    staleCount: staleRes.count ?? 0,
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
  cars: { id: string; display_title: string; stock_id: string }[];
}

export async function getEnquiryLookups(): Promise<EnquiryLookups> {
  const supabase = await createClient();

  const [staffRes, stagesRes, carsRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase
      .from("lead_stages")
      .select("id, name")
      .eq("stage_type", "open")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("cars")
      .select("id, display_title, stock_id")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  if (staffRes.error) console.error("getEnquiryLookups staff error:", staffRes.error);
  if (stagesRes.error) console.error("getEnquiryLookups stages error:", stagesRes.error);
  if (carsRes.error) console.error("getEnquiryLookups cars error:", carsRes.error);

  return {
    staff: ((staffRes.data ?? []) as { id: string; full_name: string | null }[]).map((person) => ({
      id: person.id,
      full_name: person.full_name?.trim() || "Unnamed",
    })),
    stages: (stagesRes.data ?? []) as { id: string; name: string }[],
    cars: (carsRes.data ?? []) as { id: string; display_title: string; stock_id: string }[],
  };
}
