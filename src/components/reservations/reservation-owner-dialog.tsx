"use client";

import { useState, useTransition } from "react";

import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/ui/modal";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";

import { reassignReservationAction } from "@/app/admin/reservations/owner-actions";
import type { AssignableStaff } from "@/src/lib/supabase/reservation-owner-queries";

/*
| Handing a reservation to somebody else.
|
| WHO IS IN THE LIST
|
| Only active staff who hold reservations.request, which is the same rule
| createReservationAction() has always applied to the owner. Before Sprint 11
| every role appeared in assignment pickers, so a Finance user could be offered
| work they have no permission to do.
|
| THE CURRENT OWNER IS ALWAYS LISTED
|
| Even when they no longer qualify — someone suspended, or moved to a role
| without the key. Dropping them would make the dialog claim the reservation is
| unassigned, and saving would silently hand it to whoever happened to be first
| in the list. Narrowing a picker must never reassign live work as a side
| effect.
|
| "Nobody" is an option on purpose. An unowned reservation is a real state the
| list page already filters for, and it is the honest thing to set when
| somebody leaves and nobody has picked the work up yet.
*/

interface ReservationOwnerDialogProps {
  open: boolean;
  onClose: () => void;
  reservationId: string;
  currentOwnerId: string | null;
  currentOwnerName: string | null;
  /** Read on the server. See getAssignableReservationOwners() for why. */
  assignable: AssignableStaff[];
}

export function ReservationOwnerDialog({
  open,
  onClose,
  reservationId,
  currentOwnerId,
  currentOwnerName,
  assignable,
}: ReservationOwnerDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);

    const raw = String(formData.get("newOwnerId") ?? "");

    startTransition(async () => {
      const result = await reassignReservationAction({
        id: reservationId,
        newOwnerId: raw === "" ? null : raw,
        reason: String(formData.get("reason") ?? "") || undefined,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      onClose();
    });
  }

  const loaded = assignable;
  const currentIsListed = currentOwnerId !== null && loaded.some((option) => option.id === currentOwnerId);

  const choices = [
    { value: "", label: "Nobody — leave it unassigned" },
    // The current owner first, and added explicitly when the permission filter
    // would otherwise have dropped them.
    ...(currentOwnerId && !currentIsListed
      ? [{ value: currentOwnerId, label: `${currentOwnerName ?? "Current owner"} (current)` }]
      : []),
    ...loaded.map((option) => ({
      value: option.id,
      label:
        (option.id === currentOwnerId ? `${option.name} (current)` : option.name) +
        (option.department ? ` · ${option.department}` : ""),
    })),
  ];

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="md"
      title="Hand over this reservation"
      description={
        currentOwnerName ? `Currently owned by ${currentOwnerName}.` : "This reservation has no owner yet."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="reservation-owner-form" isLoading={isPending}>
            Hand over
          </Button>
        </>
      }
    >
      <form id="reservation-owner-form" action={submit} className="space-y-4">
        <Select
          label="New owner"
          name="newOwnerId"
          defaultValue={currentOwnerId ?? ""}
          options={choices}
        />

        {loaded.length === 0 && (
          <p className="text-text-muted text-[12px]">
            Nobody currently holds <code className="text-text-primary">reservations.request</code>, so there is
            nobody to hand this to. Grant it to a role on the roles screen.
          </p>
        )}

        {currentOwnerId && !currentIsListed && (
          <p className="text-text-muted text-[12px]">
            The current owner no longer holds the permission to own reservations — they are listed so you can
            leave things as they are, but they cannot be given new ones.
          </p>
        )}

        <Textarea
          label="Why (optional)"
          name="reason"
          rows={2}
          maxLength={400}
          showCharacterCount
          placeholder="Fatima is on leave until the 15th"
          hint="Goes into this reservation's handover history."
        />

        {error && (
          <p
            role="alert"
            className="border-danger/30 bg-danger/[0.04] text-danger rounded-xl border px-3 py-2 text-[12px]"
          >
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
