"use client";

import { ShieldCheck, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

import { verifyPaymentsAction } from "@/app/admin/sales/payment-actions";
import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/ui/modal";
import { useMotion } from "@/src/hooks/use-motion";
import type { PaymentQueueRow } from "@/src/lib/types/sales-payments";
import { addFils, formatFils, toFils } from "@/src/lib/utils/sales-money";

interface PaymentBulkBarProps {
  selected: PaymentQueueRow[];
  /** Payments this person recorded, which someone else has to verify. */
  blockedCount: number;
  onClear: () => void;
  onDone: () => void;
}

/**
 * The bar that appears once payments are selected.
 *
 * Verifying money is the one bulk action offered here. Rejecting and reversing
 * both need a reason written for each payment, and a single reason copied
 * across a dozen records is worse than useless in an audit — so those stay
 * one at a time.
 */
export function PaymentBulkBar({ selected, blockedCount, onClear, onDone }: PaymentBulkBarProps) {
  const { transition } = useMotion();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const count = selected.length;
  const currency = selected[0]?.currency ?? "AED";

  /*
   * Totals are summed in fils, never in floats: adding 0.1 and 0.2 in
   * JavaScript gives 0.30000000000000004, and money on a screen that people
   * reconcile against a bank statement has to be exact.
   */
  const total = addFils(...selected.map((payment) => toFils(payment.amount) ?? BigInt(0)));

  const mixed = selected.some((payment) => payment.currency !== currency);

  const verify = async () => {
    setSaving(true);

    try {
      const result = await verifyPaymentsAction({ ids: selected.map((payment) => payment.id) });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.verified === 0) {
        toast.error("None of those payments could be verified. Refresh the page to see their current state.");
      } else if (result.skipped > 0) {
        toast.success(
          `Verified ${result.verified}. ${result.skipped} ${
            result.skipped === 1 ? "was" : "were"
          } passed over — someone else may have acted on ${result.skipped === 1 ? "it" : "them"} first.`,
        );
      } else {
        toast.success(`Verified ${result.verified} ${result.verified === 1 ? "payment" : "payments"}.`);
      }

      setConfirming(false);
      onDone();
    } catch {
      toast.error("Something went wrong. Check the queue before trying again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={transition(0.22)}
            className="pointer-events-none sticky bottom-4 z-20 flex justify-center"
          >
            <div
              role="status"
              className="border-border bg-card/95 pointer-events-auto flex flex-wrap items-center gap-3 rounded-full border px-4 py-2.5 shadow-lg backdrop-blur"
            >
              <p className="text-body-sm text-text-primary">
                <span className="font-semibold tabular-nums">{count}</span> selected
                <span className="text-text-subtle">
                  {" · "}
                  {mixed ? "mixed currencies" : formatFils(total, currency)}
                </span>
              </p>

              <Button
                size="sm"
                variant="gradient"
                onClick={() => setConfirming(true)}
                leftIcon={<ShieldCheck className="size-4" aria-hidden="true" />}
              >
                Verify {count}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={onClear}
                leftIcon={<X className="size-4" aria-hidden="true" />}
              >
                Clear
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {confirming && (
        <Modal
          isOpen
          onClose={() => {
            if (!saving) setConfirming(false);
          }}
          size="sm"
          title={`Verify ${count} ${count === 1 ? "payment" : "payments"}?`}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={saving}>
                Go back
              </Button>

              <Button onClick={verify} isLoading={saving}>
                Verify {count}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-body-sm text-text-muted">
              Verifying confirms the money has arrived. Each payment then counts toward its deal&apos;s
              balance, and the deal&apos;s paperwork can go ahead.
            </p>

            <p className="text-body-sm text-text-primary">
              {mixed ? (
                <>These payments are in more than one currency, so they are totalled separately.</>
              ) : (
                <>
                  Total: <span className="font-semibold tabular-nums">{formatFils(total, currency)}</span>
                </>
              )}
            </p>

            {blockedCount > 0 && (
              <p className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
                {blockedCount} of the payments on this page {blockedCount === 1 ? "was" : "were"} recorded by
                you, so {blockedCount === 1 ? "it is" : "they are"} not selectable. Someone else needs to
                verify {blockedCount === 1 ? "it" : "them"}.
              </p>
            )}

            <p className="text-caption text-text-subtle">
              A payment verified by mistake can be reversed, which leaves a record of both steps.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
