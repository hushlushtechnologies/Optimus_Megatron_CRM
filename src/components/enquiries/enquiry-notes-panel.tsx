"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Lock, Pencil, StickyNote, Trash2, Unlock, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { IconButton } from "@/src/components/ui/icon-button";
import { Switch } from "@/src/components/ui/switch";
import { Textarea } from "@/src/components/ui/textarea";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";

import { EnquirySection } from "@/src/components/enquiries/enquiry-detail-section";
import {
  addEnquiryNoteAction,
  archiveEnquiryNoteAction,
  editEnquiryNoteAction,
} from "@/app/admin/enquiries/work-actions";
import type { EnquiryNote } from "@/src/lib/types/enquiry-work";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";

interface EnquiryNotesPanelProps {
  enquiryId: string;
  /** null means they couldn't be read, which is not the same as none. */
  notes: EnquiryNote[] | null;
  currentUserId: string;
  canManage: boolean;
  /** Lets somebody edit or remove a colleague's note, not just their own. */
  canManageAllNotes: boolean;
  index?: number;
}

/**
 * What colleagues have written about this enquiry.
 *
 * Internal by default. The switch exists because some notes are a draft of
 * what will be said to the customer and some are "he has rung three times,
 * tread carefully" — and the second kind must never be mistaken for the
 * first. The padlock on each note says which it is at a glance.
 *
 * Nothing here deletes. Removing a note archives it, because what a
 * colleague recorded before they changed their mind is sometimes exactly
 * what somebody needs to find later.
 */
export function EnquiryNotesPanel({
  enquiryId,
  notes,
  currentUserId,
  canManage,
  canManageAllNotes,
  index = 0,
}: EnquiryNotesPanelProps) {
  const router = useRouter();

  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<EnquiryNote | null>(null);

  const mine = (note: EnquiryNote) => canManageAllNotes || note.createdBy === currentUserId;

  const run = async (work: () => Promise<{ error: string | null }>, success: string) => {
    setSaving(true);

    try {
      const result = await work();

      if (result.error) {
        toast.error(result.error);
        return false;
      }

      toast.success(success);
      router.refresh();
      return true;
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    const text = draft.trim();
    if (!text) return;

    const ok = await run(
      () => addEnquiryNoteAction({ enquiryId, noteText: text, isInternal: internal }),
      "Note added.",
    );

    if (ok) {
      setDraft("");
      setInternal(true);
    }
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const text = editText.trim();
    if (!text) return;

    const ok = await run(() => editEnquiryNoteAction({ noteId: editingId, noteText: text }), "Note saved.");
    if (ok) setEditingId(null);
  };

  return (
    <EnquirySection
      title="Notes"
      index={index}
      icon={<StickyNote className="size-4" aria-hidden="true" />}
      description="For colleagues, not customers — unless you say otherwise."
    >
      {/* ---- Composer ---- */}

      {canManage && (
        <div className="flex flex-col gap-3">
          <Textarea
            label="Add a note"
            rows={3}
            maxLength={4000}
            showCharacterCount
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What happened, what to watch for, what you promised them…"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Switch
              checked={internal}
              onCheckedChange={setInternal}
              label={internal ? "Internal only" : "Could be shared with the customer"}
            />

            <Button
              size="sm"
              onClick={() => void add()}
              isLoading={saving}
              disabled={saving || !draft.trim()}
            >
              Add note
            </Button>
          </div>
        </div>
      )}

      {/* ---- The notes ---- */}

      {notes === null ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          The notes couldn&apos;t be loaded. Refresh the page to try again.
        </p>
      ) : notes.length === 0 ? (
        <p className="text-body-sm text-text-muted">
          Nothing written down yet. The first person to speak to this customer should change that.
        </p>
      ) : (
        <ul className="divide-border divide-y">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              {editingId === note.id ? (
                <>
                  <Textarea
                    aria-label="Edit this note"
                    rows={3}
                    maxLength={4000}
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                  />

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => void saveEdit()}
                      isLoading={saving}
                      disabled={saving || !editText.trim()}
                      leftIcon={<Check className="size-4" aria-hidden="true" />}
                    >
                      Save
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                      disabled={saving}
                      leftIcon={<X className="size-4" aria-hidden="true" />}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-body-sm text-text-primary min-w-0 break-words whitespace-pre-wrap">
                      {note.noteText}
                    </p>

                    {canManage && mine(note) && (
                      <div className="flex shrink-0 gap-1">
                        <IconButton
                          aria-label="Edit this note"
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() => {
                            setEditingId(note.id);
                            setEditText(note.noteText);
                          }}
                        >
                          <Pencil className="size-4" />
                        </IconButton>

                        <IconButton
                          aria-label="Remove this note"
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() => setPendingRemoval(note)}
                        >
                          <Trash2 className="size-4 text-red-400" />
                        </IconButton>
                      </div>
                    )}
                  </div>

                  <p className="text-caption text-text-subtle flex flex-wrap items-center gap-1.5">
                    {note.isInternal ? (
                      <Lock className="size-3" aria-hidden="true" />
                    ) : (
                      <Unlock className="size-3" aria-hidden="true" />
                    )}
                    <span>{note.isInternal ? "Internal" : "Shareable"}</span>
                    <span>·</span>
                    <span>{note.createdByName ?? "Someone"}</span>
                    <span>·</span>
                    <span>{formatDateTimeFull(note.createdAt)}</span>
                    {note.updatedAt && <span className="text-text-subtle">· edited</span>}
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={pendingRemoval !== null}
        onClose={() => setPendingRemoval(null)}
        title="Remove this note?"
        description="It comes off this page. It stays in the record, so it can be found again if anybody needs it."
        confirmLabel="Remove it"
        variant="danger"
        isLoading={saving}
        onConfirm={() => {
          const note = pendingRemoval;
          setPendingRemoval(null);
          if (note) void run(() => archiveEnquiryNoteAction({ noteId: note.id }), "Note removed.");
        }}
      />
    </EnquirySection>
  );
}
