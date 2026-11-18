"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Check, Lock, MessageSquarePlus, Pencil, Trash2, Unlock, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { Switch } from "@/src/components/ui/switch";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";

import { useMotion } from "@/src/hooks/use-motion";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";

import {
  archiveDealNoteAction,
  createDealNoteAction,
  updateDealNoteAction,
} from "@/app/admin/sales/notes-actions";
import type { DealNoteItem, DealNotesData } from "@/src/lib/types/sales-notes";

interface DealNotesPanelProps {
  dealId: string;
  data: DealNotesData;
}

/**
 * The written record on a deal.
 *
 * Notes are archived rather than deleted, so nothing a colleague wrote ever
 * disappears from the database. An internal note is marked as such: the
 * distinction exists so a note meant for staff is never mistaken for one the
 * customer could be shown.
 */
export function DealNotesPanel({ dealId, data }: DealNotesPanelProps) {
  const router = useRouter();
  const { fadeUp } = useMotion();

  const [draft, setDraft] = useState("");
  const [isInternal, setIsInternal] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<DealNoteItem | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  /* =========================================================
     ADD
  ========================================================= */

  const handleAdd = async () => {
    if (!draft.trim()) return;

    setIsSaving(true);

    try {
      const result = await createDealNoteAction({ dealId, noteText: draft, isInternal });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setDraft("");
      toast.success("Note added.");
      router.refresh();
    } catch {
      toast.error("Your note couldn't be saved. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  /* =========================================================
     EDIT
  ========================================================= */

  const startEdit = (note: DealNoteItem) => {
    setEditingId(note.id);
    setEditDraft(note.note_text);
  };

  const handleUpdate = async () => {
    if (!editingId || !editDraft.trim()) return;

    setIsUpdating(true);

    try {
      const result = await updateDealNoteAction({ dealId, noteId: editingId, noteText: editDraft });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setEditingId(null);
      toast.success("Note updated.");
      router.refresh();
    } catch {
      toast.error("Your change couldn't be saved. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  /* =========================================================
     ARCHIVE
  ========================================================= */

  const handleArchive = async () => {
    if (!archiveTarget) return;

    setIsArchiving(true);

    try {
      const result = await archiveDealNoteAction({ dealId, noteId: archiveTarget.id });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setArchiveTarget(null);
      toast.success("Note removed from this deal.");
      router.refresh();
    } catch {
      toast.error("Your change couldn't be saved. Please try again.");
    } finally {
      setIsArchiving(false);
    }
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="flex flex-col gap-5">
      {data.canAdd && (
        <section aria-label="Add a note" className="surface-card flex flex-col gap-3 p-5">
          <p className="text-label">Add a note</p>

          <Textarea
            aria-label="Note"
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What happened, what was agreed, what to do next…"
            maxLength={4000}
            showCharacterCount
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Switch label="Internal only" checked={isInternal} onCheckedChange={setIsInternal} />

            <Button
              onClick={() => void handleAdd()}
              isLoading={isSaving}
              disabled={!draft.trim()}
              leftIcon={<MessageSquarePlus className="size-4" />}
            >
              Add note
            </Button>
          </div>
        </section>
      )}

      {data.notes === null ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          The notes couldn&apos;t be loaded. Refresh the page to try again.
        </p>
      ) : data.notes.length === 0 ? (
        <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-10 text-center">
          No notes on this deal yet.
          {data.canAdd ? " Add the first one above." : ""}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.notes.map((note, index) => (
            <motion.li key={note.id} {...fadeUp(index)} className="surface-card flex flex-col gap-2.5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-body-sm text-text-primary flex items-center gap-2 font-medium">
                  {note.author_name}

                  <span
                    title={note.is_internal ? "Internal only" : "Shareable with the customer"}
                    className="text-caption text-text-subtle inline-flex items-center gap-1"
                  >
                    {note.is_internal ? (
                      <Lock className="size-3" aria-hidden="true" />
                    ) : (
                      <Unlock className="size-3" aria-hidden="true" />
                    )}
                    {note.is_internal ? "Internal" : "Shareable"}
                  </span>
                </p>

                <p className="text-caption text-text-subtle">
                  <time dateTime={note.created_at}>{formatDateTimeFull(note.created_at)}</time>
                  {note.updated_at && " · edited"}
                </p>
              </div>

              {editingId === note.id ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    aria-label="Edit note"
                    rows={3}
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    maxLength={4000}
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void handleUpdate()}
                      isLoading={isUpdating}
                      disabled={!editDraft.trim()}
                      leftIcon={<Check className="size-4" />}
                    >
                      Save
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                      disabled={isUpdating}
                      leftIcon={<X className="size-4" />}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-body-sm text-text-primary whitespace-pre-wrap">{note.note_text}</p>

                  {note.can_modify && (
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => startEdit(note)}
                        className="text-caption text-text-subtle hover:text-text-primary focus-visible:ring-primary inline-flex items-center gap-1 rounded focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => setArchiveTarget(note)}
                        className="text-caption text-text-subtle focus-visible:ring-primary inline-flex items-center gap-1 rounded hover:text-red-400 focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  )}
                </>
              )}
            </motion.li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => void handleArchive()}
        isLoading={isArchiving}
        variant="danger"
        title="Remove this note?"
        description="It disappears from the deal but stays in the database, so the written history is never lost."
        confirmLabel="Remove note"
      />
    </div>
  );
}
