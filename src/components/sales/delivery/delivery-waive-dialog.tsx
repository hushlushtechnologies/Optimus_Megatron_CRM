"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Modal } from "@/src/components/ui/modal";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { setDeliveryItemAction } from "@/app/admin/sales/delivery-actions";
import type { DeliveryItem } from "@/src/lib/types/sales-delivery";

interface DeliveryWaiveDialogProps {
  item: DeliveryItem;
  onClose: () => void;
  onDone: () => void;
}

export function DeliveryWaiveDialog({ item, onClose, onDone }: DeliveryWaiveDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await setDeliveryItemAction({
        itemId: item.id,
        action: "waive",
        expectedState: item.state,
        note: reason.trim(),
      });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Check waived");
      onDone();
    } catch {
      const message = "Something went wrong. Refresh the page to see the check's current state.";
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
      title="Waive this check"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button variant="destructiveSolid" onClick={submit} isLoading={saving} disabled={reason.trim().length < 3}>
            Waive check
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="border-border bg-card-hover/40 rounded-md border p-3">
          <p className="text-text-primary font-medium">{item.label}</p>
        </div>
        <p className="text-body-sm text-text-muted">
          Waiving lets the vehicle be handed over without this check. Your name and reason are recorded on the deal. Use it
          only when the check truly doesn&apos;t apply or has been settled another way.
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