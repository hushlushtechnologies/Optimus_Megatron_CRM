import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import type { EnquiryFollowUp, EnquiryNote } from "@/src/lib/types/enquiry-work";

/*
|--------------------------------------------------------------------------
| READING NOTES AND FOLLOW-UPS
|--------------------------------------------------------------------------
|
| Both resolve staff names in one extra query rather than through a join.
| These tables have no view of their own, and embedding profiles would mean
| relying on a foreign-key relationship the client cannot see through RLS.
*/

/** Every name needed by a set of rows, in one query. */
export async function resolveNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((value): value is string => !!value))];
  const names = new Map<string, string>();

  if (unique.length === 0) return names;

  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", unique);

  if (error) console.error("resolveNames error:", error);

  for (const person of (data ?? []) as { id: string; full_name: string | null }[]) {
    names.set(person.id, person.full_name?.trim() || "Someone");
  }

  return names;
}

/* =========================================================
   NOTES
========================================================= */

/**
 * The notes on one enquiry, newest first.
 *
 * Archived notes are left out. Nothing here deletes a note — archiving keeps
 * it in the table, which matters when somebody needs to know what a
 * colleague recorded before they changed their mind about it.
 *
 * null means the notes couldn't be read, which is not the same as none.
 */
export async function getEnquiryNotes(id: string): Promise<EnquiryNote[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("enquiry_notes")
    .select("id, note_text, is_internal, created_by, created_at, updated_at")
    .eq("enquiry_id", id)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("getEnquiryNotes error:", error);
    return null;
  }

  type Row = {
    id: string;
    note_text: string;
    is_internal: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string | null;
  };

  const rows = (data ?? []) as Row[];
  const names = await resolveNames(
    supabase,
    rows.map((row) => row.created_by),
  );

  return rows.map((row) => ({
    id: row.id,
    noteText: row.note_text,
    isInternal: row.is_internal,
    createdBy: row.created_by,
    createdByName: row.created_by ? (names.get(row.created_by) ?? "Someone") : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/* =========================================================
   FOLLOW-UPS
========================================================= */

/**
 * The follow-ups on one enquiry.
 *
 * Ordered by when they are or were due, newest first, so what is overdue
 * and what is next sit at the top where somebody picking the enquiry up will
 * look. The screen separates outstanding from done; the order within each is
 * the same question — when.
 */
export async function getEnquiryFollowUps(id: string): Promise<EnquiryFollowUp[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("enquiry_follow_ups")
    .select(
      `id, type, status, scheduled_at, assigned_to, notes, reminder_minutes_before,
       completed_at, completed_by, outcome_notes, created_by, created_at`,
    )
    .eq("enquiry_id", id)
    .order("scheduled_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("getEnquiryFollowUps error:", error);
    return null;
  }

  type Row = {
    id: string;
    type: string;
    status: string;
    scheduled_at: string;
    assigned_to: string | null;
    notes: string | null;
    reminder_minutes_before: number | null;
    completed_at: string | null;
    completed_by: string | null;
    outcome_notes: string | null;
    created_by: string | null;
    created_at: string;
  };

  const rows = (data ?? []) as Row[];

  const names = await resolveNames(
    supabase,
    rows.flatMap((row) => [row.assigned_to, row.completed_by, row.created_by]),
  );

  const who = (value: string | null) => (value ? (names.get(value) ?? "Someone") : null);

  return rows.map((row) => ({
    id: row.id,
    type: row.type as EnquiryFollowUp["type"],
    status: row.status as EnquiryFollowUp["status"],
    scheduledAt: row.scheduled_at,
    assignedTo: row.assigned_to,
    assignedToName: who(row.assigned_to),
    notes: row.notes,
    reminderMinutesBefore: row.reminder_minutes_before,
    completedAt: row.completed_at,
    completedByName: who(row.completed_by),
    outcomeNotes: row.outcome_notes,
    createdByName: who(row.created_by),
    createdAt: row.created_at,
  }));
}
