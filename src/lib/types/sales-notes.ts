/*
|--------------------------------------------------------------------------
| DEAL NOTES (Sprint 6 Phase 16)
|--------------------------------------------------------------------------
|
| The same shape as lead notes, so a note behaves identically on either side
| of the system. Notes are archived, never deleted.
*/

export interface DealNote {
  id: string;
  deal_id: string;
  note_text: string;
  is_internal: boolean;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
}

/** A note with its author resolved, as the panel renders it. */
export interface DealNoteItem extends DealNote {
  author_name: string;
  /** True when the signed-in person wrote it, or may manage anyone's notes. */
  can_modify: boolean;
}

/** Null means the lookup failed, which is different from "there are none". */
export interface DealNotesData {
  notes: DealNoteItem[] | null;
  canAdd: boolean;
}

export interface DealNoteResult {
  error: string | null;
}