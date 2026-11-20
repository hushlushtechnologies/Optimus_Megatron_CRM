import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import {
  LINK_KINDS,
  LINK_KINDS_SPEC,
  NO_ENQUIRY_LINKS,
  type EnquiryLinkKind,
  type EnquiryLinkedRecord,
  type EnquiryLinks,
} from "@/src/lib/types/enquiry-links";
import type { EnquiryListRow } from "@/src/lib/types/enquiry";

/*
|--------------------------------------------------------------------------
| READING WHAT AN ENQUIRY IS CONNECTED TO
|--------------------------------------------------------------------------
|
| Each kind is read from its own module's list view, so a linked deal shows
| the same number, status and vehicle it shows in Sales. Reading live rather
| than storing a copy matters: a deal that has since been cancelled should
| say so on the enquiry too.
|
| Row-level security still applies to every one of these reads. Somebody who
| cannot see deals gets null back for the deal, which the panel reports as
| not visible rather than as absent.
*/

/** The columns one kind needs, in that view's own names. */
function selectFor(kind: EnquiryLinkKind): string {
  const spec = LINK_KINDS_SPEC[kind];

  return `id, ${spec.numberColumn}, ${spec.statusColumn}, ${spec.dateColumn}, vehicle_title`;
}

type RawRow = Record<string, unknown>;

function flatten(kind: EnquiryLinkKind, row: RawRow): EnquiryLinkedRecord {
  const spec = LINK_KINDS_SPEC[kind];

  const text = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value : null);

  return {
    kind,
    id: String(row.id),
    number: text(row[spec.numberColumn]) ?? "—",
    status: text(row[spec.statusColumn]) ?? "Unknown",
    vehicleTitle: text(row.vehicle_title),
    when: text(row[spec.dateColumn]),
  };
}

/**
 * Every record this enquiry points at.
 *
 * One query per kind that actually has an id set, in parallel. An enquiry
 * with no links costs nothing.
 */
export async function getEnquiryLinks(enquiry: EnquiryListRow): Promise<EnquiryLinks> {
  const supabase = await createClient();

  const wanted = LINK_KINDS.filter((kind) => enquiry[LINK_KINDS_SPEC[kind].column] !== null);

  if (wanted.length === 0) return { ...NO_ENQUIRY_LINKS };

  const results = await Promise.all(
    wanted.map(async (kind) => {
      const spec = LINK_KINDS_SPEC[kind];
      const id = enquiry[spec.column] as string;

      const { data, error } = await supabase
        .from(spec.view)
        .select(selectFor(kind))
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error(`getEnquiryLinks(${kind}) error:`, error);
        return [kind, null] as const;
      }

      return [kind, data ? flatten(kind, data as unknown as RawRow) : null] as const;
    }),
  );

  const links: EnquiryLinks = { ...NO_ENQUIRY_LINKS };
  for (const [kind, record] of results) links[kind] = record;

  return links;
}

/**
 * What could be linked, for one kind.
 *
 * Scoped to the enquiry's own customer, and that is the point rather than a
 * convenience. An unscoped picker would list every deal in the business by
 * customer name, which leaks one customer's dealings to anybody looking at
 * another's enquiry — and it would make attaching a stranger's deal to an
 * enquiry a single mis-click.
 *
 * So an enquiry with no customer on it gets an empty list. The panel says
 * to link a customer first, which is the honest instruction.
 */
export async function getEnquiryLinkCandidates(
  kind: EnquiryLinkKind,
  customerId: string | null,
): Promise<EnquiryLinkedRecord[]> {
  if (!customerId) return [];

  const supabase = await createClient();
  const spec = LINK_KINDS_SPEC[kind];

  const { data, error } = await supabase
    .from(spec.view)
    .select(selectFor(kind))
    .eq("customer_id", customerId)
    .order(spec.dateColumn, { ascending: false })
    .limit(50);

  if (error) {
    console.error(`getEnquiryLinkCandidates(${kind}) error:`, error);
    return [];
  }

  return ((data ?? []) as unknown as RawRow[]).map((row) => flatten(kind, row));
}

/**
 * Every enquiry belonging to one customer, newest first.
 *
 * Read from `enquiry_list`, so the rows are identical in shape to the ones
 * the enquiries module renders and can go through the same components.
 *
 * null means they couldn't be read, which is not the same as none.
 */
export async function getCustomerEnquiries(customerId: string): Promise<EnquiryListRow[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("enquiry_list")
    .select(
      `id, enquiry_number, status, status_label, status_tone, status_is_open,
       enquiry_type, type_label, general_category, source, priority, priority_rank,
       subject, full_name, vehicle_text, vehicle_title, stock_id, car_id,
       assigned_to, assigned_to_name, created_at, last_activity_at, next_follow_up_at,
       closed_at, converted_at`,
    )
    .eq("customer_id", customerId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("getCustomerEnquiries error:", error);
    return null;
  }

  return (data ?? []) as unknown as EnquiryListRow[];
}
