"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Modal } from "@/src/components/ui/modal";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { PaymentStatusChip } from "@/src/components/sales/payments/payment-status-chip";
import { setPaymentStatusAction } from "@/app/admin/sales/payment-actions";
import { formatFils, toFils } from "@/src/lib/utils/sales-money";
import type { PaymentStatusAction } from "@/src/lib/types/sales-payments";
import type { PaymentLike } from "@/src/lib/utils/sales-payments";

interface PaymentStatusDialogProps {
  payment: PaymentLike;
  action: PaymentStatusAction;
  onClose: () => void;
  onDone: () => void;
}

const CONFIG: Record<
  PaymentStatusAction,
  { title: string; confirm: string; success: string; destructive: boolean; needsReason: boolean; body: string }
> = {
  verify: {
    title: "Verify payment",
    confirm: "Verify payment",
    success: "Payment verified",
    destructive: false,
    needsReason: false,
    body: "Confirm that this money has arrived, for example by checking the bank statement. Once verified it counts toward the balance and can't be edited.",
  },
  reject: {
    title: "Reject payment",
    confirm: "Reject payment",
    success: "Payment rejected",
    destructive: true,
    needsReason: true,
    body: "Use this when the money did not arrive or the entry is wrong. It never counts toward the balance, and the reference can be used again.",
  },
  reverse: {
    title: "Reverse payment",
    confirm: "Reverse payment",
    success: "Payment reversed",
    destructive: true,
    needsReason: true,
    body: "Use this for a payment that was verified by mistake, or that bounced. It stops counting toward the balance. The record stays, so the history is complete.",
  },
};

export function PaymentStatusDialog({ payment, action, onClose, onDone }: PaymentStatusDialogProps) {
  const cfg = CONFIG[action];
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = !saving && (!cfg.needsReason || reason.trim().length >= 3);
  const refund = payment.direction === "out";

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await setPaymentStatusAction({ id: payment.id, action, reason: reason.trim() });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(cfg.success);
      onDone();
    } catch {
      const message = "Something went wrong. Refresh the page to see the payment's current state.";
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
            <p className="text-caption text-text-subtle">
              {payment.kind} · {payment.method}
            </p>
            <PaymentStatusChip status={payment.status} />
          </div>
          <p className="text-text-primary text-lg font-semibold tabular-nums">
            {refund ? "− " : ""}
            {formatFils(toFils(payment.amount), payment.currency)}
          </p>
          {payment.reference && <p className="text-caption text-text-subtle">Reference: {payment.reference}</p>}
          <p className="text-caption text-text-subtle">Recorded by {payment.recorded_by_name}</p>
        </div>

        <p className="text-body-sm text-text-muted">{cfg.body}</p>

        {cfg.needsReason && (
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
        )}

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