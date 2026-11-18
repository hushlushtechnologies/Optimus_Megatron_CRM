"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Modal } from "@/src/components/ui/modal";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { saveDeliveryPlanAction } from "@/app/admin/sales/delivery-actions";
import { formatTime, toDubaiIsoDate } from "@/src/lib/utils/test-drive-format";
import type { DeliveryLookups, DeliveryMode, DeliveryRecord } from "@/src/lib/types/sales-delivery";

interface DeliveryPlanDialogProps {
  dealId: string;
  delivery: DeliveryRecord;
  lookups: DeliveryLookups;
  onClose: () => void;
  onDone: () => void;
}

const OPTION_CLASS =
  "border-border bg-card hover:border-primary/40 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-primary flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2";

// The parent mounts this only while it is open, so every opening starts from the delivery's current plan.
export function DeliveryPlanDialog({ dealId, delivery, lookups, onClose, onDone }: DeliveryPlanDialogProps) {
  const [date, setDate] = useState(delivery.planned_at ? toDubaiIsoDate(delivery.planned_at) : "");
  const [time, setTime] = useState(delivery.planned_at ? formatTime(delivery.planned_at) : "10:00");
  const [mode, setMode] = useState<DeliveryMode>(delivery.delivery_mode ?? "showroom");
  const [locationId, setLocationId] = useState(delivery.location_id ?? "");
  const [address, setAddress] = useState(delivery.address ?? "");
  const [staffId, setStaffId] = useState(
    delivery.handover_staff_id && lookups.staff.some((person) => person.id === delivery.handover_staff_id)
      ? delivery.handover_staff_id
      : "",
  );
  const [notes, setNotes] = useState(delivery.prep_notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit =
    !saving &&
    date !== "" &&
    time !== "" &&
    staffId !== "" &&
    (mode === "showroom" ? locationId !== "" : address.trim().length >= 5);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await saveDeliveryPlanAction({
        dealId,
        expectedUpdatedAt: delivery.updated_at,
        date,
        time,
        mode,
        locationId: mode === "showroom" ? locationId : null,
        address: mode === "address" ? address.trim() : "",
        staffId,
        notes: notes.trim(),
      });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Handover planned");
      onDone();
    } catch {
      const message = "Something went wrong. Refresh the page to see the delivery's current plan.";
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
      title={delivery.planned_at ? "Change the handover plan" : "Plan the handover"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button onClick={submit} isLoading={saving} disabled={!canSubmit}>
            Save plan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Input
            label="Date"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <Input
            label="Time"
            type="time"
            required
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>
        <p className="text-caption text-text-subtle -mt-2">Dates and times are Dubai time.</p>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-label mb-1">Where will the handover happen?</legend>
          <label className={OPTION_CLASS}>
            <input
              type="radio"
              name="delivery-mode"
              checked={mode === "showroom"}
              onChange={() => setMode("showroom")}
              className="accent-primary mt-1 size-4"
            />
            <span className="text-body-sm text-text-primary">At a showroom</span>
          </label>
          <label className={OPTION_CLASS}>
            <input
              type="radio"
              name="delivery-mode"
              checked={mode === "address"}
              onChange={() => setMode("address")}
              className="accent-primary mt-1 size-4"
            />
            <span className="text-body-sm text-text-primary">Delivered to the customer</span>
          </label>
        </fieldset>

        {mode === "showroom" ? (
          <Select
            label="Showroom"
            placeholder="Choose a showroom"
            options={lookups.showrooms.map((showroom) => ({ value: showroom.id, label: showroom.name }))}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          />
        ) : (
          <Textarea
            label="Delivery address"
            required
            rows={2}
            maxLength={300}
            showCharacterCount
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        )}

        <Select
          label="Who will hand the vehicle over?"
          placeholder="Choose a person"
          options={lookups.staff.map((person) => ({ value: person.id, label: person.name }))}
          value={staffId}
          onChange={(event) => setStaffId(event.target.value)}
        />

        <Textarea
          label="Preparation notes (optional)"
          placeholder="Anything the team should get ready."
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
