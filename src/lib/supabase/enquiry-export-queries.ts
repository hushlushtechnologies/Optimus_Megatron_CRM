import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { applyEnquiryQuery, statusGroups, type FilterableQuery } from "@/src/lib/supabase/enquiry-queries";
import type { EnquiryFilters } from "@/src/lib/utils/enquiry-filters";
import type { EnquiryTab } from "@/src/lib/types/enquiry";

/*
|--------------------------------------------------------------------------
| ROWS FOR AN EXPORT
|--------------------------------------------------------------------------
|
| Three scopes the plan asks for:
|
|   current    everything matching the filters on screen
|   selected   the ticked rows, and only those
|   type       one enquiry type, ignoring the type tab
|
| "current" goes through applyEnquiryQuery — the same function the list
| itself uses — so the file somebody downloads holds the rows they were
| looking at. An export built from its own copy of the filters drifts from
| the list the first time either changes.
|
| On privacy: these rows carry a member of the public's name, email and
| phone number, which is the point of the file and also the reason the route
| that calls this requires enquiries.export rather than enquiries.view. What
| is deliberately NOT here: the hashed IP and the user agent. Those exist to
| catch spam, they are of no use to a salesperson, and a spreadsheet is the
| last place they should end up.
*/

/** What one row of an enquiry export holds. */
export interface EnquiryExportRow {
  enquiryNumber: string;
  createdAt: string;
  type: string;
  status: string;
  priority: string;
  source: string;
  subject: string | null;
  customerName: string;
  email: string | null;
  phone: string | null;
  preferredContact: string | null;
  vehicle: string | null;
  stockId: string | null;
  location: string | null;
  assignedTo: string;
  nextFollowUpAt: string | null;
  lastActivityAt: string;
  closedAt: string | null;
  closeReason: string | null;
}

const EXPORT_COLUMNS = `
  enquiry_number, created_at, last_activity_at, next_follow_up_at,
  type_label, enquiry_type, status_label, status, priority, source, subject,
  full_name, customer_name, email, phone, preferred_contact,
  vehicle_title, vehicle_text, stock_id, location_name,
  assigned_to_name, closed_at, close_reason, archived_at, status_is_open
`;

interface ExportRequest {
  scope: "current" | "selected" | "type";
  ids?: string[];
  /** Required when scope is "type". */
  enquiryType?: string;
  tab: EnquiryTab;
  search: string;
  filters: EnquiryFilters;
}

type RawRow = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

function toRow(raw: RawRow): EnquiryExportRow {
  return {
    enquiryNumber: String(raw.enquiry_number ?? ""),
    createdAt: String(raw.created_at ?? ""),
    type: text(raw.type_label) ?? String(raw.enquiry_type ?? ""),
    status: text(raw.status_label) ?? String(raw.status ?? ""),
    priority: String(raw.priority ?? ""),
    source: String(raw.source ?? ""),
    subject: text(raw.subject),
    /* The customer on file where there is one, otherwise the name given. */
    customerName: text(raw.customer_name) ?? text(raw.full_name) ?? "Unknown",
    email: text(raw.email),
    phone: text(raw.phone),
    preferredContact: text(raw.preferred_contact),
    vehicle: text(raw.vehicle_title) ?? text(raw.vehicle_text),
    stockId: text(raw.stock_id),
    location: text(raw.location_name),
    assignedTo: text(raw.assigned_to_name) ?? "Unassigned",
    nextFollowUpAt: text(raw.next_follow_up_at),
    lastActivityAt: String(raw.last_activity_at ?? raw.created_at ?? ""),
    closedAt: text(raw.closed_at),
    closeReason: text(raw.close_reason),
  };
}

/** How many rows one file may hold, so an export can't try to stream the table. */
export const MAX_EXPORT_ROWS = 2000;

export async function getEnquiryExportRows(request: ExportRequest): Promise<EnquiryExportRow[]> {
  const supabase = await createClient();

  if (request.scope === "selected") {
    if (!request.ids?.length) return [];

    const { data, error } = await supabase
      .from("enquiry_list")
      .select(EXPORT_COLUMNS)
      .in("id", request.ids.slice(0, MAX_EXPORT_ROWS))
      .order("created_at", { ascending: false });

    if (error) {
      console.error("getEnquiryExportRows(selected) error:", error);
      return [];
    }

    return ((data ?? []) as unknown as RawRow[]).map(toRow);
  }

  if (request.scope === "type") {
    if (!request.enquiryType) return [];

    const { data, error } = await supabase
      .from("enquiry_list")
      .select(EXPORT_COLUMNS)
      .eq("enquiry_type", request.enquiryType)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_EXPORT_ROWS);

    if (error) {
      console.error("getEnquiryExportRows(type) error:", error);
      return [];
    }

    return ((data ?? []) as unknown as RawRow[]).map(toRow);
  }

  /* ---- The current view, through the list's own filter logic ---- */

  const groups = await statusGroups();

  const base = supabase.from("enquiry_list").select(EXPORT_COLUMNS);

  const query = applyEnquiryQuery(base as unknown as FilterableQuery<typeof base>, {
    tab: request.tab,
    search: request.search,
    filters: request.filters,
    groups,
    now: new Date().toISOString(),
  }) as unknown as typeof base;

  const { data, error } = await query.order("created_at", { ascending: false }).limit(MAX_EXPORT_ROWS);

  if (error) {
    console.error("getEnquiryExportRows(current) error:", error);
    return [];
  }

  return ((data ?? []) as unknown as RawRow[]).map(toRow);
}
