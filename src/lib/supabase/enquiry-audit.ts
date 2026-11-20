import "server-only";

import type { EnquiryTimelineKind } from "@/src/lib/types/enquiry-timeline";

/*
|--------------------------------------------------------------------------
| THE EVENTS A TRIGGER CANNOT WRITE
|--------------------------------------------------------------------------
|
| Most of the audit trail is written by the database, which is the right
| place for it: creation, status moves and reassignments are recorded by
| triggers in tables of their own, so they are logged even if somebody
| changes a row by hand in SQL.
|
| Three kinds of event can't be done that way, because the interesting part
| is not visible in the row:
|
|   valuation  a trigger sees two numbers change; it cannot say whether that
|              was a first valuation or a revision, which is the part a
|              person reading the history wants
|   edited     priority, a linked customer, a linked deal — small changes
|              that each tell you little alone and read as one line here
|   archived   taken off the list, or put back
|
| So these are written by the actions that make them, through this helper,
| and deliberately never fail the action: an audit row that could block a
| save would mean a valuation lost because a log insert timed out.
*/

/** The activity_type values this module writes, and the kind each becomes. */
export const AUDIT_TYPES = {
  valuation: "valuation",
  edited: "edited",
  archived: "archived",
} as const satisfies Record<string, EnquiryTimelineKind>;

export type EnquiryAuditType = keyof typeof AUDIT_TYPES;

/* Narrow enough to describe what it does, loose enough to take any client. */
interface AuditClient {
  from(table: string): {
    /*
     * PromiseLike, not Promise: PostgREST hands back a builder that is
     * awaitable but is not a Promise, so naming Promise here rejects every
     * real client.
     */
    insert(values: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
}

interface LogEnquiryAuditInput {
  enquiryId: string;
  type: EnquiryAuditType;
  /** One line, past tense, readable on its own: "Valuation revised". */
  description: string;
  oldValue?: string | null;
  newValue?: string | null;
  actorId: string | null;
}

/**
 * Record something a person did to an enquiry.
 *
 * Never throws and never returns a failure. The caller has already changed
 * the data; refusing to continue because the history could not be written
 * would turn a logging problem into lost work. A failure is logged to the
 * server console, where it is a bug to fix rather than something the person
 * at the screen can do anything about.
 */
export async function logEnquiryAudit(supabase: AuditClient, input: LogEnquiryAuditInput): Promise<void> {
  try {
    const { error } = await supabase.from("enquiry_activity").insert({
      enquiry_id: input.enquiryId,
      activity_type: AUDIT_TYPES[input.type],
      description: input.description,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      changed_by: input.actorId,
    });

    if (error) console.error("logEnquiryAudit error:", error.message);
  } catch (error) {
    console.error("logEnquiryAudit threw:", error);
  }
}
