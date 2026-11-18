"use client";

import { ReceiptButton } from "@/src/components/sales/documents/receipt-button";
import { PaymentStatusChip } from "@/src/components/sales/payments/payment-status-chip";
import { Button } from "@/src/components/ui/button";
import { useMotion } from "@/src/hooks/use-motion";
import type { PaymentStatusAction } from "@/src/lib/types/sales-payments";
import { cn } from "@/src/lib/utils/cn";
import { formatFils, toFils } from "@/src/lib/utils/sales-money";
import type { PaymentLike } from "@/src/lib/utils/sales-payments";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";
import { formatDateTimeFull, formatDay } from "@/src/lib/utils/test-drive-format";
import { motion } from "motion/react";

interface PaymentRowProps<T extends PaymentLike> {
  payment: T;
  index?: number;
  /** Shown above the payment, such as the customer and deal in the queue. */
  context?: React.ReactNode;
  actions?: React.ReactNode;
  /** A checkbox for bulk work. Omitted everywhere selection makes no sense. */
  selection?: React.ReactNode;
  isSelected?: boolean;
}

export function PaymentRow<T extends PaymentLike>({
  payment,
  index = 0,
  context,
  actions,
  selection,
  isSelected = false,
}: PaymentRowProps<T>) {
  const { fadeUp } = useMotion();
  const refund = payment.direction === "out";

  const body = (
    <>
      {context}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-body-sm text-text-primary font-medium">
            {payment.kind}
            <span className="text-text-subtle font-normal"> · {payment.method}</span>
          </p>
          <p className="text-caption text-text-subtle">
            Paid {formatDay(payment.paid_on)}
            {payment.reference ? ` · ref ${payment.reference}` : ""}
          </p>
          <p className="text-caption text-text-subtle">
            Recorded by {payment.recorded_by_name} on {formatDateTimeFull(payment.recorded_at)}
            {payment.verified_by_name && payment.verified_at
              ? ` · verified by ${payment.verified_by_name} on ${formatDateTimeFull(payment.verified_at)}`
              : ""}
            {payment.reversed_by_name && payment.reversed_at
              ? ` · reversed by ${payment.reversed_by_name} on ${formatDateTimeFull(payment.reversed_at)}`
              : ""}
          </p>
          {payment.status_reason && (
            <p className="text-caption text-text-muted">Reason: {payment.status_reason}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
          <p className="text-text-primary font-semibold whitespace-nowrap tabular-nums">
            {refund ? "− " : ""}
            {formatFils(toFils(payment.amount), payment.currency)}
          </p>
          <PaymentStatusChip status={payment.status} />
        </div>
      </div>
      {actions}
    </>
  );

  return (
    <motion.li
      {...fadeUp(index)}
      className={cn(
        "flex gap-3 px-4 py-3 transition-colors",
        isSelected && "bg-primary/5",
        !selection && "flex-col",
      )}
    >
      {selection && <div className="shrink-0 pt-0.5">{selection}</div>}

      {selection ? <div className="flex min-w-0 flex-1 flex-col gap-3">{body}</div> : body}
    </motion.li>
  );
}

interface PaymentRowActionsProps {
  payment: PaymentLike;
  permissions: SalesPermissions;
  currentUserId: string | null;
  /** null (couldn't be loaded) is treated as "yes". */
  separateVerifier: boolean | null;
  onAction: (payment: PaymentLike, action: PaymentStatusAction) => void;
}

/** The steps this person may take on this payment right now. Renders nothing when there are none. */
export function PaymentRowActions({
  payment,
  permissions,
  currentUserId,
  separateVerifier,
  onAction,
}: PaymentRowActionsProps) {
  const needsOther = separateVerifier !== false;
  const recordedByMe = !!currentUserId && payment.recorded_by === currentUserId;
  const selfBlocked = needsOther && recordedByMe;

  if (payment.status === "Recorded" && (permissions.paymentsVerify || permissions.paymentsReverse)) {
    if (!permissions.paymentsVerify) return null;
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          size="sm"
          variant="secondary"
          className="h-11 sm:h-9"
          disabled={selfBlocked}
          onClick={() => onAction(payment, "verify")}
        >
          Verify
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="h-11 sm:h-9"
          onClick={() => onAction(payment, "reject")}
        >
          Reject
        </Button>
        {selfBlocked && (
          <p className="text-caption text-text-subtle">
            You recorded this payment, so someone else needs to verify it.
          </p>
        )}
      </div>
    );
  }

  if (payment.status === "Verified") {
    const canReceipt = permissions.documents && payment.direction === "in";
    const canReverse = permissions.paymentsReverse;
    if (!canReceipt && !canReverse) return null;

    return (
      <div className="flex flex-wrap gap-2">
        {canReceipt && <ReceiptButton paymentId={payment.id} />}
        {canReverse && (
          <Button
            size="sm"
            variant="destructive"
            className="h-11 sm:h-9"
            onClick={() => onAction(payment, "reverse")}
          >
            Reverse
          </Button>
        )}
      </div>
    );
  }

  return null;
}
