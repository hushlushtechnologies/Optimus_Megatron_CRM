"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { Select } from "@/src/components/ui/select";
import { MoneyInput } from "@/src/components/sales/form/money-input";
import { PercentField } from "@/src/components/sales/settings/percent-field";
import { saveFeeTypeAction } from "@/app/admin/sales/settings/actions";
import { decimalText, describeFeeRule } from "@/src/lib/utils/sales-pricing";
import type { FeeMode, FeeType } from "@/src/lib/types/sales-pricing";
import { cn } from "@/src/lib/utils/cn";

interface FeeTypesCardProps {
  feeTypes: FeeType[];
  feesEnabled: boolean;
  currency: string;
}

function feeValueText(fee: FeeType): string {
  return fee.calc_mode === "fixed" ? decimalText(fee.value) : fee.value.toFixed(2);
}

function FeeDialog({
  fee,
  currency,
  onClose,
  onDone,
}: {
  fee: FeeType | null;
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(fee?.name ?? "");
  const [mode, setMode] = useState<FeeMode>(fee?.calc_mode ?? "fixed");
  const [value, setValue] = useState(fee ? feeValueText(fee) : "");
  const [active, setActive] = useState(fee?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await saveFeeTypeAction({
        id: fee?.id ?? null,
        name,
        calcMode: mode,
        value,
        isActive: active,
      });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(fee ? "Fee updated" : "Fee added");
      onDone();
    } catch {
      setError("Something went wrong. Refresh the page and try again.");
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
      title={fee ? "Edit fee" : "Add a fee"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button onClick={submit} isLoading={saving} disabled={name.trim().length < 2 || value === ""}>
            {fee ? "Save fee" : "Add fee"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />

        <Select
          label="Charged as"
          options={[
            { value: "fixed", label: "A fixed amount" },
            { value: "percent", label: "A percentage of the net price" },
          ]}
          value={mode}
          onChange={(event) => {
            setMode(event.target.value === "percent" ? "percent" : "fixed");
            setValue("");
          }}
        />

        {mode === "fixed" ? (
          <MoneyInput label="Amount" currency={currency} value={value} onChange={setValue} />
        ) : (
          <PercentField
            label="Percentage"
            value={value}
            onChange={setValue}
            helper="Taken from the price after the discount, rounded to the nearest fils."
          />
        )}

        <label className="border-border flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            className="accent-primary size-4"
          />
          <span className="text-body-sm text-text-primary">Offer this fee on deals</span>
        </label>

        {error && (
          <p
            role="alert"
            className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function FeeTypesCard({ feeTypes, feesEnabled, currency }: FeeTypesCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<FeeType | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = async (fee: FeeType) => {
    setBusyId(fee.id);
    try {
      const result = await saveFeeTypeAction({
        id: fee.id,
        name: fee.name,
        calcMode: fee.calc_mode,
        value: feeValueText(fee),
        isActive: !fee.is_active,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(fee.is_active ? `${fee.name} switched off` : `${fee.name} switched on`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-label">Fee types</p>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="size-4" aria-hidden="true" />}
          onClick={() => setEditing("new")}
        >
          Add a fee
        </Button>
      </div>

      {!feesEnabled && (
        <p role="status" className="text-caption text-text-subtle">
          Fees are switched off, so none of these are offered on deals. Switch fees on above to use them.
        </p>
      )}

      {feeTypes.length === 0 ? (
        <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-6 text-center">
          No fees yet. Add one if you charge for things like registration or handling.
        </p>
      ) : (
        <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
          {feeTypes.map((fee) => (
            <li
              key={fee.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-body-sm font-medium",
                    fee.is_active ? "text-text-primary" : "text-text-subtle",
                  )}
                >
                  {fee.name}
                  {!fee.is_active && <span className="text-caption ml-2 font-normal">Off</span>}
                </p>
                <p className="text-caption text-text-subtle">{describeFeeRule(fee, currency)}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(fee)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  isLoading={busyId === fee.id}
                  onClick={() => void toggle(fee)}
                >
                  {fee.is_active ? "Switch off" : "Switch on"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <FeeDialog
          key={editing === "new" ? "new" : editing.id}
          fee={editing === "new" ? null : editing}
          currency={currency}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
