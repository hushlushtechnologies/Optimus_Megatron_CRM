"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Undo2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { PaymentRow, PaymentRowActions } from "@/src/components/sales/payments/payment-row";
import { RecordPaymentDialog } from "@/src/components/sales/payments/record-payment-dialog";
import { PaymentStatusDialog } from "@/src/components/sales/payments/payment-status-dialog";
import { activeNetFils, refundableFils, type PaymentLike } from "@/src/lib/utils/sales-payments";
import type { PaymentKind } from "@/src/lib/types/sales";
import type { PaymentStatusAction } from "@/src/lib/types/sales-payments";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";

interface PaymentsPanelProps {
  dealId: string | null;
  reservationId: string | null;
  /** null means the list couldn't be loaded, which is different from "no payments". */
  payments: PaymentLike[] | null;
  currency: string;
  permissions: SalesPermissions;
  currentUserId: string | null;
  separateVerifier: boolean | null;
  /** Whether new payments can still be added (not for a cancelled deal or a closed reservation). */
  acceptsPayments: boolean;
  kinds: PaymentKind[];
  /** What is expected in total: the deal's total due, or the reservation deposit. null when not known. */
  expected: bigint | null;
  expectedLabel: string;
  intro: string;
}

type Open =
  { type: "record" } | { type: "refund" } | { type: "status"; payment: PaymentLike; action: PaymentStatusAction } | null;

export function PaymentsPanel({
  dealId,
  reservationId,
  payments,
  currency,
  permissions,
  currentUserId,
  separateVerifier,
  acceptsPayments,
  kinds,
  expected,
  expectedLabel,
  intro,
}: PaymentsPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);

  const list = payments ?? [];
  const remaining = expected !== null ? expected - activeNetFils(list) : null;
  const maxRefund = refundableFils(list);

  const canRecord = permissions.paymentsRecord && acceptsPayments;
  const canRefund = permissions.paymentsReverse && maxRefund > BigInt(0);

  const done = () => {
    setOpen(null);
    router.refresh();
  };

  return (
    <section aria-label="Payments" className="surface-card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-label">Payment history</p>
          <p className="text-caption text-text-subtle mt-1">{intro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRecord && (
            <Button
              size="sm"
              variant="gradient"
              leftIcon={<Plus className="size-4" aria-hidden="true" />}
              onClick={() => setOpen({ type: "record" })}
            >
              Record payment
            </Button>
          )}
          {canRefund && (
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Undo2 className="size-4" aria-hidden="true" />}
              onClick={() => setOpen({ type: "refund" })}
            >
              Record refund
            </Button>
          )}
        </div>
      </div>

      {payments === null ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          The payments couldn&apos;t be loaded. Refresh the page to try again.
        </p>
      ) : payments.length === 0 ? (
        <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-8 text-center">
          No payments have been recorded yet.
        </p>
      ) : (
        <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
          {payments.map((payment, index) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              index={index}
              actions={
                <PaymentRowActions
                  payment={payment}
                  permissions={permissions}
                  currentUserId={currentUserId}
                  separateVerifier={separateVerifier}
                  onAction={(target, action) => setOpen({ type: "status", payment: target, action })}
                />
              }
            />
          ))}
        </ul>
      )}

      {(open?.type === "record" || open?.type === "refund") && (
        <RecordPaymentDialog
          mode={open.type === "refund" ? "refund" : "payment"}
          dealId={dealId}
          reservationId={reservationId}
          currency={currency}
          kinds={kinds}
          suggested={remaining !== null && remaining > BigInt(0) ? remaining : null}
          suggestedLabel={expectedLabel}
          maxRefund={maxRefund}
          onClose={() => setOpen(null)}
          onDone={done}
        />
      )}

      {open?.type === "status" && (
        <PaymentStatusDialog payment={open.payment} action={open.action} onClose={() => setOpen(null)} onDone={done} />
      )}
    </section>
  );
}