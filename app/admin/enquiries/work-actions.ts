"use server";

import { revalidatePath } from "next/cache";

import { beginEnquiryAction, type BeginEnquiryResult } from "@/src/lib/supabase/enquiry-permissions";
import type { EnquiryActionResult } from "@/src/lib/types/enquiry";
import { logEnquiryAudit } from "@/src/lib/supabase/enquiry-audit";
import type { EnquiryStockMatchOption } from "@/src/lib/types/enquiry-details";
import {
  addEnquiryNoteSchema,
  archiveEnquiryNoteSchema,
  completeEnquiryFollowUpSchema,
  createEnquiryFollowUpSchema,
  editEnquiryNoteSchema,
  logEnquiryContactSchema,
  rescheduleEnquiryFollowUpSchema,
  setEnquiryFollowUpStatusSchema,
} from "@/src/lib/validation/enquiry-work";
import { enquiryValuationSchema, matchDreamCarSchema } from "@/src/lib/validation/enquiry-valuation";

import type { ZodError } from "zod";

/*
|--------------------------------------------------------------------------
| NOTES AND FOLLOW-UPS
|--------------------------------------------------------------------------
|
| In a file of their own rather than with the enquiry actions, because these
| are the things that happen *during* an enquiry's life and there are enough
| of them that one file would stop being readable.
|
| Every one of them re-checks the permission server-side. The screen hides
| controls somebody can't use, but hiding a button is a courtesy, not a
| guard — the guard is here.
*/

/** The Supabase client a successful beginEnquiryAction hands back. */
type ActionClient = Extract<BeginEnquiryResult, { ok: true }>["supabase"];

function firstIssue(error: ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

function refresh(enquiryId: string) {
  revalidatePath("/admin/enquiries");
  revalidatePath(`/admin/enquiries/${enquiryId}`);
}

/**
 * Which enquiry a note or follow-up belongs to.
 *
 * Needed because the client sends only the row's own id, and the path to
 * revalidate is the enquiry's. Reading it back also confirms the row is one
 * this person is allowed to see at all — RLS answers that, and a missing row
 * is indistinguishable from a forbidden one, which is the right answer here.
 */
async function ownerOf(
  supabase: ActionClient,
  table: "enquiry_notes" | "enquiry_follow_ups",
  rowId: string,
): Promise<string | null> {
  const { data, error } = await supabase.from(table).select("enquiry_id").eq("id", rowId).maybeSingle();

  if (error) {
    console.error(`ownerOf ${table} error:`, error);
    return null;
  }

  return (data as { enquiry_id: string } | null)?.enquiry_id ?? null;
}

/* =========================================================
   NOTES
========================================================= */

export async function addEnquiryNoteAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = addEnquiryNoteSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error, "That note couldn't be saved.") };

  const v = parsed.data;

  const { error } = await start.supabase.from("enquiry_notes").insert({
    enquiry_id: v.enquiryId,
    note_text: v.noteText,
    is_internal: v.isInternal,
    created_by: start.userId,
  });

  if (error) {
    console.error("addEnquiryNoteAction error:", error);
    return { error: "That note couldn't be saved. Please try again." };
  }

  refresh(v.enquiryId);
  return { error: null };
}

/**
 * Changing a note's wording.
 *
 * The row keeps its author and its created_at; updated_by and updated_at
 * record the edit, so a note that has been changed can be seen to have been
 * changed. Nothing here lets somebody edit a note into another person's name.
 */
export async function editEnquiryNoteAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = editEnquiryNoteSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error, "That note couldn't be saved.") };

  const v = parsed.data;

  const enquiryId = await ownerOf(start.supabase, "enquiry_notes", v.noteId);
  if (!enquiryId) return { error: "That note is no longer there." };

  const { error } = await start.supabase
    .from("enquiry_notes")
    .update({ note_text: v.noteText, updated_by: start.userId, updated_at: new Date().toISOString() })
    .eq("id", v.noteId);

  if (error) {
    console.error("editEnquiryNoteAction error:", error);
    return { error: "That note couldn't be saved. Please try again." };
  }

  refresh(enquiryId);
  return { error: null };
}

/**
 * Taking a note off the screen.
 *
 * Archived, not deleted. What a colleague recorded before they changed
 * their mind is sometimes exactly what somebody needs to find later, and a
 * CRM that can silently lose it is worse than one that keeps a row nobody
 * is looking at.
 */
export async function archiveEnquiryNoteAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = archiveEnquiryNoteSchema.safeParse(input);
  if (!parsed.success) return { error: "That note couldn't be removed." };

  const enquiryId = await ownerOf(start.supabase, "enquiry_notes", parsed.data.noteId);
  if (!enquiryId) return { error: "That note is no longer there." };

  const { error } = await start.supabase
    .from("enquiry_notes")
    .update({ is_archived: true, updated_by: start.userId, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.noteId);

  if (error) {
    console.error("archiveEnquiryNoteAction error:", error);
    return { error: "That note couldn't be removed. Please try again." };
  }

  refresh(enquiryId);
  return { error: null };
}

/* =========================================================
   FOLLOW-UPS
========================================================= */

export async function createEnquiryFollowUpAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = createEnquiryFollowUpSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error, "That follow-up couldn't be saved.") };

  const v = parsed.data;

  const { error } = await start.supabase.from("enquiry_follow_ups").insert({
    enquiry_id: v.enquiryId,
    type: v.type,
    status: "Scheduled",
    scheduled_at: v.scheduledAt,
    /* Unassigned means whoever has the enquiry; it is not nobody's job. */
    assigned_to: v.assignedTo,
    notes: v.notes === "" ? null : v.notes,
    reminder_minutes_before: v.reminderMinutesBefore,
    created_by: start.userId,
  });

  if (error) {
    console.error("createEnquiryFollowUpAction error:", error);
    return { error: "That follow-up couldn't be saved. Please try again." };
  }

  /*
   * enquiries.next_follow_up_at is maintained by a trigger, not here. The
   * list sorts and filters on it, and a denormalised column the application
   * writes is a column that drifts.
   */
  refresh(v.enquiryId);
  return { error: null };
}

/**
 * Recording contact that already happened.
 *
 * One row, created and completed together. "They rang in and I spoke to
 * them" is the most common thing anybody does to an enquiry, and making
 * somebody schedule a call into the past before they can log it is the kind
 * of step that ends with the call not being logged at all.
 */
export async function logEnquiryContactAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = logEnquiryContactSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error, "That couldn't be logged.") };

  const v = parsed.data;
  const when = v.happenedAt ?? new Date().toISOString();

  const { error } = await start.supabase.from("enquiry_follow_ups").insert({
    enquiry_id: v.enquiryId,
    type: v.type,
    status: "Completed",
    scheduled_at: when,
    assigned_to: start.userId,
    completed_at: when,
    completed_by: start.userId,
    outcome_notes: v.outcomeNotes,
    created_by: start.userId,
  });

  if (error) {
    console.error("logEnquiryContactAction error:", error);
    return { error: "That couldn't be logged. Please try again." };
  }

  refresh(v.enquiryId);
  return { error: null };
}

/**
 * Marking a follow-up done, with what came of it.
 *
 * The outcome is required. A follow-up ticked off with no note tells the
 * next person that somebody made contact and nothing about what was said,
 * which is the half that matters.
 *
 * Guarded against completing one twice: the second attempt would overwrite
 * the first outcome and move the timestamp.
 */
export async function completeEnquiryFollowUpAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = completeEnquiryFollowUpSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error, "That couldn't be saved.") };

  const v = parsed.data;

  const { data: row, error: readError } = await start.supabase
    .from("enquiry_follow_ups")
    .select("enquiry_id, status")
    .eq("id", v.followUpId)
    .maybeSingle();

  if (readError || !row) return { error: "That follow-up is no longer there." };

  const current = row as { enquiry_id: string; status: string };

  if (current.status === "Completed") {
    return { error: "That follow-up has already been completed." };
  }

  if (current.status === "Cancelled") {
    return { error: "That follow-up was cancelled. Schedule a new one instead." };
  }

  const now = new Date().toISOString();

  const { error } = await start.supabase
    .from("enquiry_follow_ups")
    .update({
      status: "Completed",
      completed_at: now,
      completed_by: start.userId,
      outcome_notes: v.outcomeNotes,
    })
    .eq("id", v.followUpId)
    /* Belt and braces: the status cannot have moved since the read above. */
    .eq("status", current.status);

  if (error) {
    console.error("completeEnquiryFollowUpAction error:", error);
    return { error: "That couldn't be saved. Please try again." };
  }

  refresh(current.enquiry_id);
  return { error: null };
}

/**
 * Moving a follow-up to a new time.
 *
 * The old time is not kept as a field — the reason, which is the part worth
 * reading, is appended to the notes with the time it moved from. A column
 * holding only the previous time would answer "when was it" and never "why
 * did it move".
 */
export async function rescheduleEnquiryFollowUpAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = rescheduleEnquiryFollowUpSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error, "That couldn't be rescheduled.") };

  const v = parsed.data;

  const { data: row, error: readError } = await start.supabase
    .from("enquiry_follow_ups")
    .select("enquiry_id, status, scheduled_at, notes")
    .eq("id", v.followUpId)
    .maybeSingle();

  if (readError || !row) return { error: "That follow-up is no longer there." };

  const current = row as {
    enquiry_id: string;
    status: string;
    scheduled_at: string;
    notes: string | null;
  };

  if (current.status === "Completed" || current.status === "Cancelled") {
    return { error: `A ${current.status.toLowerCase()} follow-up can't be moved. Schedule a new one.` };
  }

  const moved = `Moved from ${new Date(current.scheduled_at).toISOString()}${v.reason ? ` — ${v.reason}` : ""}`;
  const notes = [current.notes, moved].filter(Boolean).join("\n");

  const { error } = await start.supabase
    .from("enquiry_follow_ups")
    .update({ status: "Rescheduled", scheduled_at: v.scheduledAt, notes })
    .eq("id", v.followUpId);

  if (error) {
    console.error("rescheduleEnquiryFollowUpAction error:", error);
    return { error: "That couldn't be rescheduled. Please try again." };
  }

  refresh(current.enquiry_id);
  return { error: null };
}

/** Marking one missed, or calling it off. */
export async function setEnquiryFollowUpStatusAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = setEnquiryFollowUpStatusSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error, "That couldn't be saved.") };

  const v = parsed.data;

  const { data: row, error: readError } = await start.supabase
    .from("enquiry_follow_ups")
    .select("enquiry_id, status, notes")
    .eq("id", v.followUpId)
    .maybeSingle();

  if (readError || !row) return { error: "That follow-up is no longer there." };

  const current = row as { enquiry_id: string; status: string; notes: string | null };

  if (current.status === "Completed") {
    return { error: "That follow-up is already done." };
  }

  const notes = v.reason ? [current.notes, v.reason].filter(Boolean).join("\n") : current.notes;

  const { error } = await start.supabase
    .from("enquiry_follow_ups")
    .update({ status: v.status, notes })
    .eq("id", v.followUpId);

  if (error) {
    console.error("setEnquiryFollowUpStatusAction error:", error);
    return { error: "That couldn't be saved. Please try again." };
  }

  refresh(current.enquiry_id);
  return { error: null };
}

/* =========================================================
   VALUATION
========================================================= */

/**
 * Recording what a customer's car is worth to us.
 *
 * Needs enquiries.valuate, not enquiries.manage — Phase 1 created that
 * permission precisely so that handling an enquiry and putting a number on
 * somebody's car can be different jobs. A salesperson may well do both; a
 * receptionist taking the call should not.
 *
 * evaluated_by and evaluated_at are set here, never sent by the client: who
 * valued a car and when is the part that has to be trustworthy.
 */
export async function saveEnquiryValuationAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("valuate");
  if (!start.ok) return { error: start.error };

  const parsed = enquiryValuationSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error, "That valuation couldn't be saved.") };

  const v = parsed.data;

  const { data: row, error: readError } = await start.supabase
    .from("enquiry_customer_vehicles")
    .select("enquiry_id, estimated_value, evaluated_at")
    .eq("id", v.vehicleId)
    .maybeSingle();

  if (readError || !row) return { error: "That vehicle is no longer there." };

  const existing = row as {
    enquiry_id: string;
    estimated_value: string | number | null;
    evaluated_at: string | null;
  };

  const enquiryId = existing.enquiry_id;
  const hadValuation = existing.evaluated_at !== null;
  const previousEstimate = existing.estimated_value === null ? null : Number(existing.estimated_value);

  /*
   * Clearing every figure clears the evaluation stamp too, so a car with no
   * valuation never looks as though somebody looked at it and declined to
   * say anything.
   */
  const anyFigure = v.estimatedValue !== null || v.proposedOffer !== null || v.valuationNotes !== "";

  const { error } = await start.supabase
    .from("enquiry_customer_vehicles")
    .update({
      estimated_value: v.estimatedValue,
      valuation_notes: v.valuationNotes === "" ? null : v.valuationNotes,
      proposed_offer: v.proposedOffer,
      offer_expires_at: v.offerExpiresOn,
      evaluated_by: anyFigure ? start.userId : null,
      evaluated_at: anyFigure ? new Date().toISOString() : null,
    })
    .eq("id", v.vehicleId);

  if (error) {
    console.error("saveEnquiryValuationAction error:", error);
    return { error: "That valuation couldn't be saved. Please try again." };
  }

  /*
   * "Added" or "revised" is the part a trigger could not tell: it sees two
   * numbers change either way. Whether this is the first opinion on the car
   * or somebody changing their mind is exactly what the history is read for.
   */
  await logEnquiryAudit(start.supabase, {
    enquiryId,
    type: "valuation",
    description: !anyFigure ? "Valuation cleared" : hadValuation ? "Valuation revised" : "Valuation added",
    oldValue: previousEstimate === null ? null : String(previousEstimate),
    newValue: v.estimatedValue === null ? null : String(v.estimatedValue),
    actorId: start.userId,
  });

  refresh(enquiryId);
  return { error: null };
}

/* =========================================================
   DREAM CAR MATCHING
========================================================= */

/**
 * Linking a car in stock to a dream-car brief.
 *
 * Always a person's decision. Matching a brief to stock on brand and budget
 * alone looks plausible and produces phone calls about cars the customer did
 * not ask for — so there is no rule here, only a record of who decided and
 * when.
 *
 * Passing carId null clears the link.
 */
export async function matchDreamCarAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = matchDreamCarSchema.safeParse(input);
  if (!parsed.success) return { error: "That car couldn't be linked." };

  const v = parsed.data;

  const { error } = await start.supabase
    .from("enquiry_dream_car_details")
    .update({
      matched_car_id: v.carId,
      matched_by: v.carId ? start.userId : null,
      matched_at: v.carId ? new Date().toISOString() : null,
    })
    .eq("enquiry_id", v.enquiryId);

  if (error) {
    console.error("matchDreamCarAction error:", error);
    return { error: "That car couldn't be linked. Please try again." };
  }

  refresh(v.enquiryId);
  return { error: null };
}

/**
 * The cars available to link to a dream-car brief.
 *
 * Sold and reserved cars are included, with their status in the label. A
 * filtered list would quietly answer "we have nothing like that" when the
 * truth is "we had one and it went" — which is the more useful thing to be
 * able to tell a customer.
 */
export async function searchStockForMatchAction(): Promise<EnquiryStockMatchOption[]> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return [];

  const { data, error } = await start.supabase
    .from("cars")
    .select(
      `id, display_title, stock_id,
       availability_status:vehicle_statuses!cars_availability_status_id_fkey(name)`,
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("searchStockForMatchAction error:", error);
    return [];
  }

  type Row = {
    id: string;
    display_title: string;
    stock_id: string;
    availability_status: { name: string } | { name: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((car) => ({
    id: car.id,
    title: car.display_title,
    stockId: car.stock_id,
    availability: Array.isArray(car.availability_status)
      ? (car.availability_status[0]?.name ?? null)
      : (car.availability_status?.name ?? null),
  }));
}
