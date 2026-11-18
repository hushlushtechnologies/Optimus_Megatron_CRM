"use client";

import { motion } from "motion/react";
import { PaymentsPanel } from "@/src/components/sales/payments/payments-panel";
import { useMotion } from "@/src/hooks/use-motion";
import { DEAL_PAYMENT_KINDS } from "@/src/lib/utils/sales-payments";
import { formatFils, toFils } from "@/src/lib/utils/sales-money";
import type { DealPayment, SalesDealDetail } from "@/src/lib/types/sales-detail";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";

interface DealPaymentsTabProps {
  deal: SalesDealDetail;
  payments: DealPayment[] | null;
  permissions: SalesPermissions;
  currentUserId: string | null;
  separateVerifier: boolean | null;
}

function Tile({ label, value, hint, index }: { label: string; value: string; hint: string; index: number }) {
  const { fadeUp } = useMotion();
  return (
    <motion.div {...fadeUp(index)} className="surface-card flex flex-col gap-1 p-4">
      <p className="text-caption text-text-subtle">{label}</p>
      <p className="text-text-primary text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-caption text-text-subtle">{hint}</p>
    </motion.div>
  );
}

export function DealPaymentsTab({
  deal,
  payments,
  permissions,
  currentUserId,
  separateVerifier,
}: DealPaymentsTabProps) {
  const currency = deal.currency;
  const fmt = (value: number | null) => (value === null ? "—" : formatFils(toFils(value), currency));

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Payment totals" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Tile index={0} label="Total due" value={fmt(deal.total_due)} hint="Agreed price, fees and tax" />
        <Tile
          index={1}
          label="Verified paid"
          value={fmt(deal.verified_paid ?? 0)}
          hint="Counts toward the balance"
        />
        <Tile
          index={2}
          label="Awaiting verification"
          value={fmt(deal.awaiting_verification ?? 0)}
          hint="Recorded, not yet confirmed"
        />
        <Tile
          index={3}
          label="Balance due"
          value={fmt(deal.balance_due)}
          hint="Total due minus verified paid"
        />
      </section>

      <PaymentsPanel
        dealId={deal.id}
        reservationId={null}
        payments={payments}
        currency={currency}
        permissions={permissions}
        currentUserId={currentUserId}
        separateVerifier={separateVerifier}
        acceptsPayments={deal.status !== "Cancelled"}
        kinds={DEAL_PAYMENT_KINDS}
        expected={toFils(deal.total_due)}
        expectedLabel="Pay the remaining balance"
        intro="Only verified payments count toward the balance. Recorded payments are never edited: a mistake is reversed and recorded again."
      />
    </div>
  );
}
