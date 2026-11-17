"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MinusCircle, TriangleAlert } from "lucide-react";
import { Modal } from "@/src/components/ui/modal";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { completeDeliveryAction } from "@/app/admin/sales/delivery-actions";
import { formatTime, getDubaiToday } from "@/src/lib/utils/test-drive-format";
import type { DeliveryItem, DeliveryRecord } from "@/src/lib/types/sales-delivery";
import type { SalesDealDetail } from "@/src/lib/types/sales-detail";

interface DeliveryCompleteDialogProps {
  deal: Pick<SalesDealDetail, "id" | "deal_number" | "customer_name" | "vehicle_title">;
  delivery: DeliveryRecord;
  items: DeliveryItem[];
  onClose: () => void;
  onDone: () => void;
}

// The parent mounts this only while it is open, so the time starts at "now" each opening.
export function DeliveryCompleteDialog({ deal, delivery, items, onClose, onDone }: DeliveryCompleteDialogProps) {
  const [date, setDate] = useState(() => getDubaiToday());
  const [time, setTime] = useState(() => formatTime(new Date().toISOString()));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const waived = items.filter((item) => item.state === "waived");
  const skipped = items.filter((item) => !item.is_required && !item.is_ready);
  const canSubmit = !saving && date !== "" && time !== "" && date <= getDubaiToday();

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await completeDeliveryAction({
        dealId: deal.id,
        expectedUpdatedAt: delivery.updated_at,
        date,
        time,
        notes: notes.trim(),
      });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Vehicle handed over. The deal is complete.");
      onDone();
    } catch {
      const message = "Something went wrong. Refresh the page to see the delivery's current state.";
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
      title="Complete the handover"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button variant="gradient" onClick={submit} isLoading={saving} disabled={!canSubmit}>
            Hand over vehicle
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="border-border bg-card-hover/40 flex flex-col gap-1 rounded-md border p-3">
          <p className="text-caption text-text-subtle">{deal.deal_number}</p>
          <p className="text-text-primary font-medium">{deal.customer_name}</p>
          <p className="text-body-sm text-text-muted">{deal.vehicle_title}</p>
        </div>

        <p className="text-body-sm text-text-muted">
          This records that the customer has the vehicle and completes the deal. It can&apos;t be undone.
        </p>

        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Input
            label="Date of handover"
            type="date"
            required
            max={getDubaiToday()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <Input label="Time" type="time" required value={time} onChange={(event) => setTime(event.target.value)} />
        </div>
        <p className="text-caption text-text-subtle -mt-2">Dubai time. It can&apos;t be in the future.</p>

        {(waived.length > 0 || skipped.length > 0) && (
          <div className="border-border flex flex-col gap-2 rounded-md border p-3">
            {waived.map((item) => (
              <p key={item.id} className="text-body-sm text-text-primary flex items-start gap-2">
                <MinusCircle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
                <span>
                  <span className="font-medium">Waived:</span> {item.label}
                  {item.note ? <span className="text-text-muted"> ({item.note})</span> : null}
                </span>
              </p>
            ))}
            {skipped.map((item) => (
              <p key={item.id} className="text-body-sm text-text-muted flex items-start gap-2">
                <CheckCircle2 className="text-text-subtle mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>Optional, not done: {item.label}</span>
              </p>
            ))}
          </div>
        )}

        <Textarea
          label="Handover notes (optional)"
          placeholder="Condition at handover, what was handed over, anything the customer mentioned."
          rows={3}
          maxLength={500}
          showCharacterCount
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
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