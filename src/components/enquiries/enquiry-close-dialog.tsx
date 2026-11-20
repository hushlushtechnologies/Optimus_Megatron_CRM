"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { setEnquiryStatusAction } from "@/app/admin/enquiries/actions";
import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/ui/modal";
import { Textarea } from "@/src/components/ui/textarea";
import type { EnquiryListRow } from "@/src/lib/types/enquiry";

interface EnquiryCloseDialogProps {
  enquiry: EnquiryListRow;
  onClose: () => void;
}

/**
 * Closing an enquiry that went nowhere.
 *
 * A reason is required, and it is the only field. Six months later the reason
 * is the whole value of the record: "wanted a model we don't carry" tells the
 * next person something, "Closed" tells them nothing.
 */
export function EnquiryCloseDialog({ enquiry, onClose }: EnquiryCloseDialogProps) {
  const router = useRouter();

  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    setSaving(true);

    try {
      const result = await setEnquiryStatusAction({ id: enquiry.id, status: "Cancelled", reason });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(`${enquiry.enquiry_number} closed.`);
      onClose();
      router.refresh();
    } catch {
      const message = "Something went wrong. Refresh the page and try again.";
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
      title="Close this enquiry"
      description="For an enquiry that needs nothing further. It stays on file and can be reopened."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>

          <Button onClick={submit} isLoading={saving} disabled={saving || reason.trim().length < 3}>
            Close enquiry
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Textarea
          label="Why is it being closed?"
          required
          rows={3}
          maxLength={300}
          showCharacterCount
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint="A sentence is plenty. Whoever reads this next will not have the conversation you just had."
        />

        {error && (
          <p
            role="alert"
            className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
