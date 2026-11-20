"use server";

import { revalidatePath } from "next/cache";

import { beginEnquiryAction, type BeginEnquiryResult } from "@/src/lib/supabase/enquiry-permissions";
import { logEnquiryAudit } from "@/src/lib/supabase/enquiry-audit";
import { getEnquiryLinkCandidates } from "@/src/lib/supabase/enquiry-link-queries";
import { LINK_KINDS_SPEC, type EnquiryLinkedRecord } from "@/src/lib/types/enquiry-links";
import type { EnquiryActionResult } from "@/src/lib/types/enquiry";
import { listEnquiryLinkCandidatesSchema, setEnquiryLinkSchema } from "@/src/lib/validation/enquiry-links";

/*
|--------------------------------------------------------------------------
| CONNECTING AN ENQUIRY TO A LEAD, DEAL, TEST DRIVE OR RESERVATION
|--------------------------------------------------------------------------
|
| Linking records only ever records that two existing things are about each
| other. Nothing here creates a deal, a reservation or a payment, and an
| enquiry arriving causes none of them.
|
| Every link is checked against the enquiry's customer before it is written.
| The picker is already scoped that way, but a server action is reachable
| without the picker, so the check belongs here too.
*/

type ActionClient = Extract<BeginEnquiryResult, { ok: true }>["supabase"];

function refresh(enquiryId: string) {
  revalidatePath(`/admin/enquiries/${enquiryId}`);
  revalidatePath("/admin/enquiries");
}

/** The enquiry's customer, and whether the enquiry is still open to edits. */
async function enquiryContext(supabase: ActionClient, enquiryId: string) {
  const { data, error } = await supabase
    .from("enquiries")
    .select("id, customer_id")
    .eq("id", enquiryId)
    .maybeSingle();

  if (error || !data) return null;

  return data as { id: string; customer_id: string | null };
}

/**
 * Point an enquiry at a record, or clear the link.
 *
 * Refuses when the record belongs to somebody else, which is the whole
 * guard: without it, a request made outside the picker could attach one
 * customer's deal to another customer's enquiry, and the enquiry would then
 * show that customer's vehicle and number to anybody who can read it.
 */
export async function setEnquiryLinkAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = setEnquiryLinkSchema.safeParse(input);
  if (!parsed.success) return { error: "That link couldn't be saved." };

  const v = parsed.data;
  const spec = LINK_KINDS_SPEC[v.kind];

  const enquiry = await enquiryContext(start.supabase, v.enquiryId);
  if (!enquiry) return { error: "That enquiry is no longer there." };

  if (v.recordId !== null) {
    if (!enquiry.customer_id) {
      return { error: "Link a customer to this enquiry first, then its records can be connected." };
    }

    const { data: record, error: readError } = await start.supabase
      .from(spec.view)
      .select("id, customer_id")
      .eq("id", v.recordId)
      .maybeSingle();

    if (readError || !record) {
      return { error: `That ${spec.label.toLowerCase()} is no longer there.` };
    }

    const owner = (record as { customer_id: string | null }).customer_id;

    if (owner !== enquiry.customer_id) {
      return {
        error: `That ${spec.label.toLowerCase()} belongs to a different customer, so it can't be linked here.`,
      };
    }
  }

  const { error } = await start.supabase
    .from("enquiries")
    .update({ [spec.column]: v.recordId })
    .eq("id", v.enquiryId);

  if (error) {
    console.error("setEnquiryLinkAction error:", error);
    return { error: "That link couldn't be saved. Please try again." };
  }

  await logEnquiryAudit(start.supabase, {
    enquiryId: v.enquiryId,
    type: "edited",
    description: v.recordId === null ? `${spec.label} unlinked` : `Linked to a ${spec.label.toLowerCase()}`,
    newValue: v.recordId,
    actorId: start.userId,
  });

  refresh(v.enquiryId);
  return { error: null };
}

/**
 * What this enquiry's customer has, for one kind.
 *
 * Returns an empty list rather than an error when there is no customer: the
 * panel says what to do about that, and an empty picker is not a failure.
 */
export async function listEnquiryLinkCandidatesAction(input: unknown): Promise<EnquiryLinkedRecord[]> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return [];

  const parsed = listEnquiryLinkCandidatesSchema.safeParse(input);
  if (!parsed.success) return [];

  const enquiry = await enquiryContext(start.supabase, parsed.data.enquiryId);
  if (!enquiry) return [];

  return getEnquiryLinkCandidates(parsed.data.kind, enquiry.customer_id);
}
