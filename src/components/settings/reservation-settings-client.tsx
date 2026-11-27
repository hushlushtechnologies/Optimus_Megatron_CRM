"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Coins } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { MoneyInput } from "@/src/components/sales/form/money-input";
import { PercentField } from "@/src/components/sales/settings/percent-field";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { SettingsSaveBar } from "@/src/components/settings/settings-save-bar";
import { SettingsHistoryPanel } from "@/src/components/settings/settings-history-panel";
import { updateReservationSettingsAction } from "@/app/admin/settings/operations/settings-actions";
import { reservationSettingsSchema } from "@/src/lib/validation/settings-sections";
import type { FullSalesSettings, SettingsHistoryItem } from "@/src/lib/types/sales-pricing";

/*
|--------------------------------------------------------------------------
| RESERVATIONS — PHASE 10
|--------------------------------------------------------------------------
|
| Four fields, moved off the old combined Sales Settings page. The values
| are the same rows in the same table; what changed is that saving this
| page writes these four columns and nothing else. See
| settings-sections.ts for why that matters.
|
| WHAT A CHANGE HERE AFFECTS — Phase 10 asks for this to be documented,
| and it is documented on the screen rather than only in a file, because
| the question comes up at the moment of changing it:
|
|   New reservations        take the new hold length and deposit rule
|   Open reservations       keep the hold they were given
|   Confirmed reservations  keep their amount and their dates, always
|
| The last one is not a decision this page makes — a reservation stores
| its own duration and deposit when it is created, so changing a default
| cannot reach backwards. The note on screen says so because staff
| reasonably assume the opposite, and a wrong assumption here means
| somebody re-reads a deposit off the settings page instead of off the
| reservation.
|
| Per-vehicle deposit overrides are untouched by this page. A vehicle
| carrying its own reservation token keeps it.
*/

interface Values {
  defaultDays: string;
  maxDays: string;
  depositMode: "none" | "fixed" | "percent";
  depositValue: string;
}

export function ReservationSettingsClient({
  settings,
  history,
  canEdit,
}: {
  settings: FullSalesSettings;
  history: SettingsHistoryItem[] | null;
  canEdit: boolean;
}) {
  const router = useRouter();

  const initial: Values = {
    defaultDays: String(settings.reservationDefaultDays),
    maxDays: String(settings.reservationMaxDays),
    depositMode: settings.reservationDepositMode,
    depositValue:
      settings.reservationDepositMode === "none" ? "" : String(settings.reservationDepositValue),
  };

  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const patch = (change: Partial<Values>) => setValues((previous) => ({ ...previous, ...change }));

  const save = async () => {
    const payload = {
      reservationDefaultDays: Number(values.defaultDays),
      reservationMaxDays: Number(values.maxDays),
      depositMode: values.depositMode,
      depositValue: values.depositMode === "none" ? "0" : values.depositValue,
    };

    const parsed = reservationSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      });
      setErrors(next);
      toast.error("Please fix the highlighted settings.");
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      const result = await updateReservationSettingsAction(parsed.data);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Reservation settings saved");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <SettingsSection
        title="How long a hold lasts"
        icon={CalendarClock}
        description="The hold a new reservation is given, and the longest one anyone can set."
        effect="Only new reservations take these lengths. A reservation already open keeps the hold it was given, and a confirmed one keeps its dates."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Input
              label="Default hold (days)"
              type="number"
              inputMode="numeric"
              min={1}
              max={90}
              disabled={!canEdit}
              value={values.defaultDays}
              onChange={(event) => patch({ defaultDays: event.target.value })}
            />
            {errors.reservationDefaultDays && (
              <p role="alert" className="text-body-sm text-red-500">
                {errors.reservationDefaultDays}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Input
              label="Longest hold (days)"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              disabled={!canEdit}
              value={values.maxDays}
              onChange={(event) => patch({ maxDays: event.target.value })}
            />
            {errors.reservationMaxDays && (
              <p role="alert" className="text-body-sm text-red-500">
                {errors.reservationMaxDays}
              </p>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Deposit to hold a vehicle"
        icon={Coins}
        description="What a customer pays to take a vehicle off the market while they decide."
        effect="A reservation records the deposit it asked for when it was created. Changing this does not change what an existing reservation asked for, and it does not change a per-vehicle override."
      >
        <Select
          label="Deposit type"
          disabled={!canEdit}
          options={[
            { value: "none", label: "No deposit" },
            { value: "fixed", label: "A fixed amount" },
            { value: "percent", label: "A percentage of the listed price" },
          ]}
          value={values.depositMode}
          onChange={(event) => {
            const mode =
              event.target.value === "fixed" || event.target.value === "percent"
                ? event.target.value
                : "none";
            patch({ depositMode: mode, depositValue: "" });
          }}
        />

        {values.depositMode === "fixed" && (
          <MoneyInput
            label="Deposit amount"
            currency={settings.currency}
            value={values.depositValue}
            onChange={(value) => patch({ depositValue: value })}
            error={errors.depositValue}
          />
        )}
        {values.depositMode === "percent" && (
          <PercentField
            label="Deposit percentage"
            value={values.depositValue}
            onChange={(value) => patch({ depositValue: value })}
            error={errors.depositValue}
          />
        )}
        {values.depositMode === "none" && (
          <p className="text-body-sm text-text-subtle">
            Vehicles can be reserved without taking any money.
          </p>
        )}
      </SettingsSection>

      <SettingsHistoryPanel
        items={history}
        emptyNote="No reservation settings have been changed yet."
      />

      {canEdit && (
        <SettingsSaveBar
          dirty={dirty}
          saving={saving}
          onSave={save}
          onReset={() => {
            setValues(initial);
            setErrors({});
          }}
        />
      )}
    </div>
  );
}
