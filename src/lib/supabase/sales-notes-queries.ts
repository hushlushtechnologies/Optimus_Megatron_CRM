import { createClient } from "@/src/lib/supabase/server";
import { getMySalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { isUuid } from "@/src/lib/utils/search-term";
import type { DealNote, DealNoteItem, DealNotesData } from "@/src/lib/types/sales-notes";

const NOTE_COLUMNS =
  "id, deal_id, note_text, is_internal, is_archived, created_by, created_at, updated_by, updated_at";

const FAILED: DealNotesData = { notes: null, canAdd: false };

/**
 * A deal's notes, newest first, with authors resolved and each note marked
 * with whether the signed-in person may change it.
 *
 * Archived notes are kept in the database but never returned here.
 */
export async function getDealNotes(dealId: string): Promise<DealNotesData> {
  if (!isUuid(dealId)) return FAILED;

  const supabase = await createClient();

  const [{ data: notes, error }, permissions, userResult] = await Promise.all([
    supabase
      .from("sales_deal_notes")
      .select(NOTE_COLUMNS)
      .eq("deal_id", dealId)
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(200),
    getMySalesPermissions(supabase),
    supabase.auth.getUser(),
  ]);

  if (error) {
    console.error("getDealNotes error:", error);
    return FAILED;
  }

  const rows = (notes ?? []) as unknown as DealNote[];
  const currentUserId = userResult.data.user?.id ?? null;

  const authorIds = Array.from(
    new Set(rows.map((note) => note.created_by).filter((id): id is string => !!id)),
  );

  const { data: profiles } = authorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", authorIds)
    : { data: [] };

  const names = new Map(
    ((profiles ?? []) as unknown as { id: string; full_name: string | null }[]).map((profile) => [
      profile.id,
      profile.full_name?.trim() || "Unnamed staff",
    ]),
  );

  const items: DealNoteItem[] = rows.map((note) => ({
    ...note,
    author_name: note.created_by ? (names.get(note.created_by) ?? "Unknown") : "Unknown",
    // Your own note, or anyone's if you may assign deals. The database enforces the same rule.
    can_modify:
      permissions.edit && (note.created_by === currentUserId || permissions.assign),
  }));

  return { notes: items, canAdd: permissions.edit };
}