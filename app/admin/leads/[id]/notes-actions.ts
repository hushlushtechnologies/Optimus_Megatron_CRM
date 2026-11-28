"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import type { LeadNote } from "@/src/lib/types/lead";
import { assertCanManageAllLeadNotes, assertCanManageLeads } from "@/src/lib/supabase/lead-permissions";

async function assertCanModifyLeadNote(noteId: string): Promise<{ allowed: boolean; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { allowed: false, error: "You must be signed in to do this." };

  const [{ data: note }, elevated] = await Promise.all([
    supabase.from("lead_notes").select("created_by").eq("id", noteId).single(),
    assertCanManageAllLeadNotes(),
  ]);

  const isOwner = note?.created_by === user.id;

  if (!isOwner && !elevated.allowed) {
    return { allowed: false, error: "You can only edit or archive notes you created." };
  }
  return { allowed: true, error: null };
}

export async function createLeadNote(leadId: string, noteText: string, isInternal: boolean) {
  const permission = await assertCanManageLeads();
  if (!permission.allowed) return { error: permission.error, note: undefined };

  if (!noteText.trim()) return { error: "Note cannot be empty.", note: undefined };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_notes")
    .insert({ lead_id: leadId, note_text: noteText.trim(), is_internal: isInternal })
    .select("*")
    .single();

  if (error) {
    console.error("createLeadNote error:", error);
    return { error: "Unable to add note. Please try again.", note: undefined };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    activity_type: "note_added",
    description: "Note added",
    changed_by: user?.id ?? null,
  });

  revalidatePath(`/admin/leads/${leadId}`);
  return { error: null, note: data as LeadNote };
}

export async function updateLeadNote(noteId: string, leadId: string, noteText: string) {
  const permission = await assertCanModifyLeadNote(noteId);
  if (!permission.allowed) return { error: permission.error };

  if (!noteText.trim()) return { error: "Note cannot be empty." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("lead_notes")
    .update({ note_text: noteText.trim(), updated_at: new Date().toISOString(), updated_by: user?.id })
    .eq("id", noteId);

  if (error) {
    console.error("updateLeadNote error:", error);
    return { error: "Unable to update note. Please try again." };
  }

  revalidatePath(`/admin/leads/${leadId}`);
  return { error: null };
}

export async function archiveLeadNote(noteId: string, leadId: string) {
  const permission = await assertCanModifyLeadNote(noteId);
  if (!permission.allowed) return { error: permission.error };

  const supabase = await createClient();
  const { error } = await supabase.from("lead_notes").update({ is_archived: true }).eq("id", noteId);

  if (error) {
    console.error("archiveLeadNote error:", error);
    return { error: "Unable to archive note. Please try again." };
  }

  revalidatePath(`/admin/leads/${leadId}`);
  return { error: null };
}
