"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Modal } from "@/src/components/ui/modal";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { MoneyInput } from "@/src/components/sales/form/money-input";
import { saveDealPricingAction } from "@/app/admin/sales/pricing-actions";
import {
  computePricingPreview,
  decimalText,
  describeFeeRule,
  feeAmountFils,
} from "@/src/lib/utils/sales-pricing";
import { formatBasisPoints } from "@/src/lib/utils/sales-deal-form";
import { formatFils, toFils } from "@/src/lib/utils/sales-money";
import type { DealFee, FeeType } from "@/src/lib/types/sales-pricing";
import type { DealSettings, SalesDealDetail } from "@/src/lib/types/sales-detail";
import { cn } from "@/src/lib/utils/cn";

interface DealPricingDialogProps {
  deal: SalesDealDetail;
  settings: DealSettings;
  /** What is charged now. null when it couldn't be loaded. */
  fees: DealFee[] | null;
  /** Active fee types. Empty when fees are switched off. */
  feeTypes: FeeType[];
  feesEnabled: boolean;
  canApprove: boolean;
  onClose: () => void;
  onDone: () => void;
}

function Alert({ tone, children }: { tone: "error" | "warning"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "text-body-sm text-text-primary flex items-start gap-2 rounded-md border px-3 py-2.5",
        tone === "error" ? "border-red-500/40 bg-red-500/10" : "border-amber-500/30 bg-amber-500/10",
      )}
    >
      <TriangleAlert
        className={cn("mt-0.5 size-4 shrink-0", tone === "error" ? "text-red-400" : "text-amber-400")}
        aria-hidden="true"
      />
      <span>{children}</span>
    </p>
  );
}

// The parent mounts this only while it is open, so every opening starts from the deal's current figures.
export function DealPricingDialog({
  deal,
  settings,
  fees,
  feeTypes,
  feesEnabled,
  canApprove,
  onClose,
  onDone,
}: DealPricingDialogProps) {
  const currency = deal.currency;
  const showFees = feesEnabled && feeTypes.length > 0;

  const [proposed, setProposed] = useState(decimalText(deal.proposed_price));
  const [discount, setDiscount] = useState(deal.discount_amount > 0 ? decimalText(deal.discount_amount) : "");
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        (fees ?? [])
          .map((fee) => fee.fee_type_id)
          .filter((id): id is string => !!id && feeTypes.some((type) => type.id === id)),
      ),
  );
  const [note, setNote] = useState("");
  const [approveNow, setApproveNow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const retiredFees = showFees
    ? (fees ?? []).filter((fee) => !fee.fee_type_id || !feeTypes.some((type) => type.id === fee.fee_type_id))
    : [];

  const preview = useMemo(
    () =>
      computePricingPreview({
        proposed,
        discount,
        selectedFeeIds: showFees ? selected : new Set<string>(),
        feeTypes: showFees ? feeTypes : [],
        autoApprovePercent: settings.autoApprovePercent,
        currencyLabel: currency,
      }),
    [proposed, discount, selected, feeTypes, showFees, settings.autoApprovePercent, currency],
  );

  const listed = deal.listed_price;

  const toggleFee = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await saveDealPricingAction({
        id: deal.id,
        expectedUpdatedAt: deal.updated_at,
        proposedPrice: proposed,
        discountAmount: discount,
        feeTypeIds: showFees ? Array.from(selected) : [],
        note: note.trim(),
        approveNow: canApprove && preview.needsApproval && approveNow,
      });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success("Pricing saved");
      if (result.warning) toast.warning(result.warning, { duration: 8000 });
      onDone();
    } catch {
      const message = "Something went wrong. Refresh the page to see the deal's current pricing.";
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
      size="lg"
      title="Edit pricing"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button onClick={submit} isLoading={saving} disabled={!preview.valid || saving}>
            Save pricing
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="border-border bg-card-hover/40 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <div>
            <p className="text-caption text-text-subtle">Price when the deal started</p>
            <p className="text-body text-text-primary font-medium tabular-nums">
              {listed !== null ? formatFils(toFils(listed), currency) : "Not set on the vehicle"}
            </p>
          </div>
          {listed !== null && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setProposed(decimalText(listed))}
            >
              Use this price
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MoneyInput
            label="Proposed selling price"
            required
            currency={currency}
            value={proposed}
            onChange={setProposed}
            error={preview.errors.proposed && proposed !== "" ? preview.errors.proposed : undefined}
            helper="The price you are offering the customer."
          />
          <MoneyInput
            label="Discount"
            currency={currency}
            value={discount}
            onChange={setDiscount}
            error={preview.errors.discount}
            helper="Taken off the proposed price."
          />
        </div>

        {showFees && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label mb-1">Fees</legend>
            {feeTypes.map((fee) => {
              const checked = selected.has(fee.id);
              const amount = preview.netFils !== null ? feeAmountFils(fee, preview.netFils) : null;
              return (
                <label
                  key={fee.id}
                  className="border-border bg-card hover:border-primary/40 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-primary flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFee(fee.id)}
                    className="accent-primary size-4"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-body-sm text-text-primary block font-medium">{fee.name}</span>
                    <span className="text-caption text-text-subtle block">
                      {describeFeeRule(fee, currency)}
                    </span>
                  </span>
                  <span className="text-body-sm text-text-primary tabular-nums">
                    {amount !== null ? formatFils(amount, currency) : "—"}
                  </span>
                </label>
              );
            })}
            {retiredFees.length > 0 && (
              <Alert tone="warning">
                {retiredFees.map((fee) => fee.name).join(", ")} {retiredFees.length === 1 ? "has" : "have"}{" "}
                been switched off and will be removed from this deal when you save.
              </Alert>
            )}
          </fieldset>
        )}

        <dl className="border-border divide-border divide-y overflow-hidden rounded-md border">
          {[
            [
              "Proposed price",
              preview.proposedFils !== null ? formatFils(preview.proposedFils, currency) : "—",
            ],
            [
              "Discount",
              preview.discountFils > BigInt(0) ? `− ${formatFils(preview.discountFils, currency)}` : "None",
            ],
            ["Net price", preview.netFils !== null ? formatFils(preview.netFils, currency) : "—"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-caption text-text-subtle">{label}</dt>
              <dd className="text-body-sm text-text-primary tabular-nums">{value}</dd>
            </div>
          ))}
          {preview.feeLines.map((line) => (
            <div key={line.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-caption text-text-subtle">{line.name}</dt>
              <dd className="text-body-sm text-text-primary tabular-nums">
                {formatFils(line.amountFils, currency)}
              </dd>
            </div>
          ))}
          <div className="bg-primary/5 flex items-center justify-between gap-3 px-3 py-3">
            <dt className="text-body-sm text-text-primary font-medium">Estimated total</dt>
            <dd className="text-text-primary text-base font-semibold tabular-nums">
              {preview.estimatedTotalFils !== null ? formatFils(preview.estimatedTotalFils, currency) : "—"}
            </dd>
          </div>
        </dl>
        <p className="text-caption text-text-subtle -mt-3">
          Tax isn&apos;t added yet. The total is confirmed when the deal is confirmed.
        </p>

        {preview.discountBps !== null && preview.discountFils > BigInt(0) && (
          <div className="flex flex-col gap-2">
            <Alert tone={preview.needsApproval ? "warning" : "error"}>
              {preview.needsApproval
                ? `The discount is ${formatBasisPoints(preview.discountBps)} of the proposed price, above the ${formatBasisPoints(Number(preview.thresholdBps))} limit. A manager or admin must approve it before the deal can be confirmed.`
                : `The discount is ${formatBasisPoints(preview.discountBps)}, within the ${formatBasisPoints(Number(preview.thresholdBps))} limit that needs no approval.`}
            </Alert>

            {preview.needsApproval && canApprove && (
              <label className="border-border flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={approveNow}
                  onChange={(event) => setApproveNow(event.target.checked)}
                  className="accent-primary size-4"
                />
                <span className="text-body-sm text-text-primary">Approve this discount now</span>
              </label>
            )}
          </div>
        )}

        <Textarea
          label="Note (optional)"
          placeholder="Why the price changed, for the record."
          rows={2}
          maxLength={300}
          showCharacterCount
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
