"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Modal } from "@/src/components/ui/modal";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { issueDocumentAction, voidDocumentAction } from "@/app/admin/sales/document-actions";
import { DOCUMENT_LABELS, documentPdfPath } from "@/src/lib/utils/sales-documents";
import type { DocumentType, SalesDocumentItem } from "@/src/lib/types/sales-documents";

function ErrorBox({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
      {message}
    </p>
  );
}

const ISSUE_NOTES: Record<DocumentType, string> = {
  Quotation:
    "The quotation shows the current price, discount and fees. Prices can change later, but this document won't. It does not reserve the vehicle.",
  Invoice:
    "This invoice shows tax as not applied. Check how VAT applies to your sales before you send it to a customer. Only one invoice can be live per deal.",
  Receipt: "The receipt shows this payment and the deal's position at this moment.",
  "Reservation Confirmation":
    "The confirmation shows the hold period and the deposit position at this moment.",
};

interface IssueDocumentDialogProps {
  type: DocumentType;
  dealId: string | null;
  reservationId: string | null;
  onClose: () => void;
  onDone: () => void;
}

// The parent mounts this only while it is open, so every opening starts clean.
export function IssueDocumentDialog({ type, dealId, reservationId, onClose, onDone }: IssueDocumentDialogProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const label = DOCUMENT_LABELS[type];

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await issueDocumentAction({ type, dealId, reservationId, paymentId: null, note: note.trim() });
      if (result.error || !result.documentId) {
        const message = result.error ?? "The document could not be created.";
        setError(message);
        toast.error(message);
        return;
      }

      toast.success(`${label} ${result.documentNumber}${result.created ? " created" : " already exists"}`, {
        action: {
          label: "Open PDF",
          onClick: () => window.open(documentPdfPath(result.documentId as string), "_blank", "noopener,noreferrer"),
        },
        duration: 8000,
      });
      onDone();
    } catch {
      const message = "Something went wrong. Check the documents list before trying again.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!saving) onClose();
      }}
      size="md"
      title={`Create ${label.toLowerCase()}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button onClick={submit} isLoading={saving}>
            Create {label.toLowerCase()}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-text-muted">{ISSUE_NOTES[type]}</p>
        <p className="text-body-sm text-text-muted">
          Once created, a document can&apos;t be edited. If something is wrong, void it with a reason and create a new
          one.
        </p>
        <Textarea
          label="Note on the document (optional)"
          placeholder="Printed on the document, for the customer to read."
          rows={2}
          maxLength={300}
          showCharacterCount
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {error && <ErrorBox message={error} />}
      </div>
    </Modal>
  );
}

interface VoidDocumentDialogProps {
  document: SalesDocumentItem;
  onClose: () => void;
  onDone: () => void;
}

export function VoidDocumentDialog({ document, onClose, onDone }: VoidDocumentDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await voidDocumentAction({ id: document.id, reason: reason.trim() });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(`${document.doc_number} voided`);
      onDone();
    } catch {
      const message = "Something went wrong. Refresh the page to see the document's current state.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!saving) onClose();
      }}
      size="md"
      title="Void document"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button variant="destructiveSolid" onClick={submit} isLoading={saving} disabled={reason.trim().length < 3}>
            Void document
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="border-border bg-card-hover/40 flex flex-col gap-1 rounded-md border p-3">
          <p className="text-caption text-text-subtle">{DOCUMENT_LABELS[document.doc_type]}</p>
          <p className="text-text-primary font-medium">{document.doc_number}</p>
        </div>
        <p className="text-body-sm text-text-muted">
          A voided document stays on record and can still be downloaded, marked VOIDED with your reason. This can&apos;t
          be undone. Create a new document if one is needed.
        </p>
        <Textarea
          label="Reason"
          required
          rows={3}
          maxLength={300}
          showCharacterCount
          placeholder="Tell the team why."
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
        />
        {error && <ErrorBox message={error} />}
      </div>
    </Modal>
  );
}