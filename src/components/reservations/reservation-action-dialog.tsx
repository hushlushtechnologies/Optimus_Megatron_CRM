"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Modal } from "@/src/components/ui/modal";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import {
  ReservationStatusBadge,
  effectiveReservationStatus,
} from "@/src/components/reservations/reservation-status-badge";
import { convertReservationAction, transitionReservationAction } from "@/app/admin/reservations/actions";
import { useMinuteClock } from "@/src/hooks/use-minute-clock";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type {
  ReservationActionKind,
  ReservationActionResult,
  ReservationListRow,
  ReservationSettings,
} from "@/src/lib/types/reservations";
import { requiredReservationDeposit } from "@/src/lib/utils/reservation-format";
import { formatFils, toFils } from "@/src/lib/utils/sales-money";
import { cn } from "@/src/lib/utils/cn";

interface ReservationActionDialogProps {
  kind: ReservationActionKind;
  row: ReservationListRow;
  settings: ReservationSettings | null;
  onClose: () => void;
  onDone: (result: ReservationActionResult) => void;
}

const CONFIG: Record<
  ReservationActionKind,
  { title: string; confirm: string; success: string; destructive: boolean; needsReason: boolean; needsDays: boolean }
> = {
  confirm: { title: "Confirm reservation", confirm: "Confirm and hold vehicle", success: "Reservation confirmed", destructive: false, needsReason: false, needsDays: true },
  reject: { title: "Reject request", confirm: "Reject request", success: "Request rejected", destructive: true, needsReason: true, needsDays: false },
  cancel: { title: "Cancel request", confirm: "Cancel request", success: "Request cancelled", destructive: true, needsReason: true, needsDays: false },
  release: { title: "Release vehicle", confirm: "Release vehicle", success: "Vehicle released", destructive: true, needsReason: true, needsDays: false },
  extend: { title: "Extend hold", confirm: "Extend hold", success: "Hold extended", destructive: false, needsReason: false, needsDays: true },
  convert: { title: "Create deal", confirm: "Create deal", success: "Deal ready", destructive: false, needsReason: false, needsDays: false },
};

const DAY_MS = 86_400_000;

// The parent mounts this only while it is open, so every opening starts clean and reads the freshest version.
export function ReservationActionDialog({ kind, row, settings, onClose, onDone }: ReservationActionDialogProps) {
  const cfg = CONFIG[kind];
  const now = useMinuteClock();

  const [days, setDays] = useState(() =>
    settings ? String(kind === "extend" ? 1 : settings.defaultDays) : "",
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const settingsMissing = cfg.needsDays && !settings;
  const maxDays = settings?.maxDays ?? 0;
  const daysNumber = Number(days);
  const daysValid = Number.isInteger(daysNumber) && daysNumber >= 1 && daysNumber <= maxDays;
  const reasonValid = reason.trim().length >= 3;
    // The deposit your settings ask for. If it isn't covered by verified money, confirming needs a reason to waive it.
  const requiredDeposit = kind === "confirm" && settings ? requiredReservationDeposit(settings, row.listed_price) : null;
  const verifiedDeposit = toFils(row.deposit_verified) ?? BigInt(0);
  const depositShort = requiredDeposit !== null && verifiedDeposit < requiredDeposit;

    const canSubmit =
    !saving &&
    !settingsMissing &&
    (!cfg.needsDays || daysValid) &&
    (!cfg.needsReason || reasonValid) &&
    (!depositShort || reasonValid);

  // What the new expiry would be. Shown only once the clock is available in the browser.
  let preview: string | null = null;
  if (cfg.needsDays && daysValid && now !== 0) {
    const base = kind === "extend" && row.expires_at ? Math.max(Date.parse(row.expires_at), now) : now;
    preview = formatDateTimeFull(new Date(base + daysNumber * DAY_MS).toISOString());
  }

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result =
        kind === "convert"
          ? await convertReservationAction({ id: row.id, expectedUpdatedAt: row.updated_at })
          : await transitionReservationAction({
              id: row.id,
              action: kind,
              expectedUpdatedAt: row.updated_at,
                            reason: cfg.needsReason || depositShort ? reason.trim() : "",
              days: cfg.needsDays ? daysNumber : null,
            });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(
        kind === "convert" && result.dealNumber
          ? result.linkedExisting
            ? `Linked to deal ${result.dealNumber}`
            : `Draft deal ${result.dealNumber} created`
          : cfg.success,
      );
      onDone(result);
    } catch {
      const message = "Something went wrong. Refresh the page to see the reservation's current state.";
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
      title={cfg.title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button
            variant={cfg.destructive ? "destructiveSolid" : "primary"}
            onClick={submit}
            isLoading={saving}
            disabled={!canSubmit}
          >
            {cfg.confirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="border-border bg-card-hover/40 flex flex-col gap-1 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-caption text-text-subtle">{row.reservation_number}</p>
            <ReservationStatusBadge status={effectiveReservationStatus(row)} size="sm" />
          </div>
          <p className="text-text-primary font-medium">{row.customer_name}</p>
          <p className="text-body-sm text-text-muted">{row.vehicle_title}</p>
          <p className="text-caption text-text-subtle">{row.location_name}</p>
        </div>

        {kind === "confirm" && (
          <p className="text-body-sm text-text-muted">
            Confirming holds this vehicle for the customer until the time below. No one else can reserve or confirm it
            until the hold ends. A request on its own never holds a vehicle.
          </p>
        )}
                {kind === "confirm" && requiredDeposit !== null && settings && (
          <div className="flex flex-col gap-3">
            <p
              role="status"
              className="border-border bg-card-hover/40 text-body-sm text-text-primary rounded-md border px-3 py-2.5"
            >
              Deposit needed: <span className="font-semibold tabular-nums">{formatFils(requiredDeposit, settings.currency)}</span>
              {" · "}verified so far:{" "}
              <span className="font-semibold tabular-nums">{formatFils(verifiedDeposit, settings.currency)}</span>
            </p>
            {depositShort && (
              <Textarea
                label="Reason for waiving the deposit"
                required
                placeholder="For example: repeat customer, deposit to follow."
                rows={2}
                maxLength={500}
                showCharacterCount
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError(null);
                }}
              />
            )}
          </div>
        )}
        {kind === "extend" && (
          <p className="text-body-sm text-text-muted">
            Adds days to the current hold. There is a limit on how long a vehicle can be held in total
            {settings ? ` (${settings.maxDays} days from when the hold began)` : ""}.
          </p>
        )}
        {kind === "reject" && (
          <p className="text-body-sm text-text-muted">The request is declined and the requester is told why. This can&apos;t be undone.</p>
        )}
        {kind === "cancel" && (
          <p className="text-body-sm text-text-muted">The request is withdrawn. This can&apos;t be undone. A new request would be needed.</p>
        )}
        {kind === "release" && (
          <p className="text-body-sm text-text-muted">
            The vehicle is freed straight away for other customers. A deal that was reserved on it goes back to
            negotiation. This can&apos;t be undone.
          </p>
        )}
        {kind === "convert" && (
          <p className="text-body-sm text-text-muted">
            If this customer already has an open deal on this vehicle, the reservation is linked to it. Otherwise a new
            draft deal is created from the reservation. You&apos;ll go to the deal to set the price and carry on.
          </p>
        )}

        {cfg.needsDays && settings && (
          <div className="flex flex-col gap-2">
            <Input
              label={kind === "extend" ? "Add (days)" : "Hold for (days)"}
              type="number"
              inputMode="numeric"
              min={1}
              max={settings.maxDays}
              value={days}
              onChange={(event) => {
                setDays(event.target.value);
                setError(null);
              }}
            />
            {!daysValid && days !== "" && (
              <p role="alert" className="text-body-sm text-red-500">
                Enter a whole number from 1 to {settings.maxDays}.
              </p>
            )}
            {preview && (
              <p role="status" className="text-body-sm text-text-primary">
                {kind === "extend" ? "New expiry" : "The hold lasts until"}: <span className="font-medium">{preview}</span>
              </p>
            )}
          </div>
        )}

        {cfg.needsReason && (
          <Textarea
            label="Reason"
            required
            placeholder="Tell the team why."
            rows={3}
            maxLength={500}
            showCharacterCount
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
          />
        )}

        {settingsMissing && (
          <p
            role="alert"
            className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
            The hold rules couldn&apos;t be loaded, so this step is paused. Close this and refresh the page.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className={cn(
              "text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5",
            )}
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}