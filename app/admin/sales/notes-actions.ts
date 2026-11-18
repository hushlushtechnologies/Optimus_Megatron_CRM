"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import type { DealNoteResult } from "@/src/lib/types/sales-notes";

/*
|--------------------------------------------------------------------------
| DEAL NOTES (Phase 16)
|--------------------------------------------------------------------------
|
| Notes are archived, never deleted, so a deal's written history stays whole.
|
| The row-level policies on sales_deal_notes are the real guard: they allow a
| person to change their own note, or anyone's if they may assign deals. These
| actions check the same things first so the message is friendly rather than a
| raw policy error.
*/

const NOTE_TEXT = z
  .string()
  .trim()
  .min(1, "Write something before saving.")
  .max(4000, "Keep the note under 4,000 characters.");

const createSchema = z.object({
  dealId: z.string().uuid(),
  noteText: NOTE_TEXT,
  isInternal: z.boolean(),
});

const updateSchema = z.object({
  dealId: z.string().uuid(),
  noteId: z.string().uuid(),
  noteText: NOTE_TEXT,
});

const archiveSchema = z.object({
  dealId: z.string().uuid(),
  noteId: z.string().uuid(),
});

export async function createDealNoteAction(input: unknown): Promise<DealNoteResult> {
  const start = await beginSalesAction("edit");
  if (!start.ok) return { error: start.error };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the note and try again." };
  }

  const { dealId, noteText, isInternal } = parsed.data;

  // created_by is set by a database trigger, so the client can never spoof an author.
  const { error } = await start.supabase.from("sales_deal_notes").insert({
    deal_id: dealId,
    note_text: noteText,
    is_internal: isInternal,
  });

  if (error) {
    console.error("createDealNoteAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  // The deal's own activity feed records that a note happened, never its contents.
  await start.supabase.from("sales_activity").insert({
    deal_id: dealId,
    activity_type: "note_added",
    description: isInternal ? "Internal note added" : "Note added",
    changed_by: start.userId,
  });

  revalidatePath(`/admin/sales/${dealId}`);
  return { error: null };
}

export async function updateDealNoteAction(input: unknown): Promise<DealNoteResult> {
  const start = await beginSalesAction("edit");
  if (!start.ok) return { error: start.error };

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the note and try again." };
  }

  const { dealId, noteId, noteText } = parsed.data;

  const { data, error } = await start.supabase
    .from("sales_deal_notes")
    .update({
      note_text: noteText,
      updated_at: new Date().toISOString(),
      updated_by: start.userId,
    })
    .eq("id", noteId)
    .eq("deal_id", dealId)
    .select("id");

  if (error) {
    console.error("updateDealNoteAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  // No row came back: the policy refused it, which means it isn't this person's note.
  if (!data || data.length === 0) {
    return { error: "You can only edit notes you wrote." };
  }

  revalidatePath(`/admin/sales/${dealId}`);
  return { error: null };
}

export async function archiveDealNoteAction(input: unknown): Promise<DealNoteResult> {
  const start = await beginSalesAction("edit");
  if (!start.ok) return { error: start.error };

  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { error: "That note could not be found." };

  const { dealId, noteId } = parsed.data;

  const { data, error } = await start.supabase
    .from("sales_deal_notes")
    .update({
      is_archived: true,
      updated_at: new Date().toISOString(),
      updated_by: start.userId,
    })
    .eq("id", noteId)
    .eq("deal_id", dealId)
    .select("id");

  if (error) {
    console.error("archiveDealNoteAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  if (!data || data.length === 0) {
    return { error: "You can only remove notes you wrote." };
  }

  revalidatePath(`/admin/sales/${dealId}`);
  return { error: null };
}
