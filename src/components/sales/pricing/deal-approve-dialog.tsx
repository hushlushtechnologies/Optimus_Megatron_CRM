"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Modal } from "@/src/components/ui/modal";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { approveDealDiscountAction } from "@/app/admin/sales/pricing-actions";
import { formatBasisPoints } from "@/src/lib/utils/sales-deal-form";
import { formatFils, toFils } from "@/src/lib/utils/sales-money";
import type { DealSettings, SalesDealDetail } from "@/src/lib/types/sales-detail";

interface DealApproveDialogProps {
  deal: SalesDealDetail;
  settings: DealSettings;
  onClose: () => void;
  onDone: () => void;
}

export function DealApproveDialog({ deal, settings, onClose, onDone }: DealApproveDialogProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const currency = deal.currency;
  const proposed = toFils(deal.proposed_price);
  const ZERO_FILS = BigInt(0);
  const BASIS_POINTS_SCALE = BigInt(10_000);

  const discount = toFils(deal.discount_amount) ?? ZERO_FILS;

  const bps =
    proposed !== null && proposed > ZERO_FILS ? Number((discount * BASIS_POINTS_SCALE) / proposed) : null;
  const limitBps = Math.max(0, Math.round(settings.autoApprovePercent * 100));

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await approveDealDiscountAction({
        id: deal.id,
        expectedUpdatedAt: deal.updated_at,
        note: note.trim(),
      });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Discount approved");
      onDone();
    } catch {
      const message = "Something went wrong. Refresh the page to see the deal's current state.";
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
      title="Approve discount"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button onClick={submit} isLoading={saving}>
            Approve discount
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

        <dl className="border-border divide-border divide-y rounded-md border">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <dt className="text-caption text-text-subtle">Proposed price</dt>
            <dd className="text-body-sm text-text-primary tabular-nums">{formatFils(proposed, currency)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <dt className="text-caption text-text-subtle">Discount</dt>
            <dd className="text-body-sm text-text-primary tabular-nums">
              {formatFils(discount, currency)}
              {bps !== null && <span className="text-text-subtle"> ({formatBasisPoints(bps)})</span>}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <dt className="text-caption text-text-subtle">Limit with no approval</dt>
            <dd className="text-body-sm text-text-primary tabular-nums">{formatBasisPoints(limitBps)}</dd>
          </div>
        </dl>

        <p className="text-body-sm text-text-muted">
          Your approval is recorded with your name and the time. If the price or the discount is changed
          afterwards, the approval is withdrawn and needs to be given again.
        </p>

        <Textarea
          label="Note (optional)"
          placeholder="Why this discount is fine."
          rows={2}
          maxLength={300}
          showCharacterCount
          value={note}
          onChange={(event) => setNote(event.target.value)}
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
