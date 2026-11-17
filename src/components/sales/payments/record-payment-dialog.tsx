"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Modal } from "@/src/components/ui/modal";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { MoneyInput } from "@/src/components/sales/form/money-input";
import { recordPaymentAction } from "@/app/admin/sales/payment-actions";
import { PAYMENT_METHODS, referenceLabel, referenceRequired } from "@/src/lib/utils/sales-payments";
import { filsToDecimalString, formatFils, toFils } from "@/src/lib/utils/sales-money";
import { getDubaiToday } from "@/src/lib/utils/test-drive-format";
import type { PaymentKind, PaymentMethod } from "@/src/lib/types/sales";

interface RecordPaymentDialogProps {
  mode: "payment" | "refund";
  dealId: string | null;
  reservationId: string | null;
  currency: string;
  /** The kinds of payment that fit here. Ignored for a refund. */
  kinds: PaymentKind[];
  /** A one-tap amount: what is still due, or the deposit asked for. null when there isn't one. */
  suggested: bigint | null;
  suggestedLabel: string;
  /** The most a refund can be right now. */
  maxRefund: bigint;
  onClose: () => void;
  onDone: () => void;
}

// The parent mounts this only while it is open, so every opening starts clean with fresh suggestions.
export function RecordPaymentDialog({
  mode,
  dealId,
  reservationId,
  currency,
  kinds,
  suggested,
  suggestedLabel,
  maxRefund,
  onClose,
  onDone,
}: RecordPaymentDialogProps) {
  const refund = mode === "refund";
  const [kind, setKind] = useState<PaymentKind>(kinds[0] ?? "Deposit");
  const [method, setMethod] = useState<PaymentMethod>("Bank Transfer");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(() => getDubaiToday());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fils = amount === "" ? null : toFils(amount);
  const tooMuch = refund && fils !== null && fils > maxRefund;
  const refRequired = referenceRequired(method);

  const canSubmit =
    !saving &&
    fils !== null &&
    fils > BigInt(0) &&
    !tooMuch &&
    (!refRequired || reference.trim() !== "") &&
    (!refund || notes.trim().length >= 3);

  const quick = refund ? maxRefund : suggested;
  const quickLabel = refund ? "Refund the full amount paid" : suggestedLabel;

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await recordPaymentAction({
        dealId,
        reservationId,
        kind: refund ? "Refund" : kind,
        method,
        amount,
        paidOn,
        reference: reference.trim(),
        notes: notes.trim(),
      });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(refund ? "Refund recorded" : "Payment recorded");
      onDone();
    } catch {
      const message = "Something went wrong. Check the payments list before trying again.";
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
      title={refund ? "Record a refund" : "Record a payment"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button onClick={submit} isLoading={saving} disabled={!canSubmit}>
            {refund ? "Record refund" : "Record payment"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-text-muted">
          {refund
            ? "A refund is recorded here and then verified by someone else. It only changes the balance once it is verified."
            : "A payment only counts toward the balance once someone has verified it."}
        </p>

        {!refund && kinds.length > 1 && (
          <Select
            label="What is it for?"
            options={kinds.map((item) => ({ value: item, label: item }))}
            value={kind}
            onChange={(event) => setKind(event.target.value as PaymentKind)}
          />
        )}

        <Select
          label="How was it paid?"
          options={PAYMENT_METHODS.map((item) => ({ value: item, label: item }))}
          value={method}
          onChange={(event) => setMethod(event.target.value as PaymentMethod)}
        />

        <div className="flex flex-col gap-2">
          <MoneyInput
            label="Amount"
            required
            currency={currency}
            value={amount}
            onChange={setAmount}
            error={tooMuch ? `A refund can't be more than ${formatFils(maxRefund, currency)}.` : undefined}
          />
          {quick !== null && quick > BigInt(0) && (
            <div>
              <Button type="button" size="sm" variant="secondary" onClick={() => setAmount(filsToDecimalString(quick))}>
                {quickLabel}: {formatFils(quick, currency)}
              </Button>
            </div>
          )}
        </div>

        <Input
          label="Date paid"
          type="date"
          max={getDubaiToday()}
          value={paidOn}
          onChange={(event) => setPaidOn(event.target.value)}
        />

        <Input
          label={referenceLabel(method)}
          required={refRequired}
          maxLength={80}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />

        <Textarea
          label={refund ? "Why is it being refunded?" : "Note (optional)"}
          required={refund}
          rows={2}
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