"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Car, Copy, Target, UserRound } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { IconButton } from "@/src/components/ui/icon-button";
import { SalesStatusBadge } from "@/src/components/sales/sales-status-badge";
import { SalesPaymentBar } from "@/src/components/sales/sales-payment-bar";
import { DealStepper } from "@/src/components/sales/detail/deal-stepper";
import { useMotion } from "@/src/hooks/use-motion";
import { formatMoney } from "@/src/lib/utils/sales-format";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type { SalesDealStatus } from "@/src/lib/types/sales";
import type { SalesDealDetail } from "@/src/lib/types/sales-detail";

interface DealHeaderProps {
  deal: SalesDealDetail;
  stoppedAt: SalesDealStatus | null;
  visited: Set<SalesDealStatus> | null;
  actions?: ReactNode;
}

export function DealHeader({ deal, stoppedAt, visited, actions }: DealHeaderProps) {
  const { fadeUp } = useMotion();
  const price = deal.agreed_price ?? deal.proposed_price;

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(deal.deal_number);
      toast.success("Deal number copied");
    } catch {
      toast.error("Couldn't copy. Select the number and copy it by hand.");
    }
  };

  return (
    <motion.header {...fadeUp(0)} className="surface-card overflow-hidden">
      <div className="bg-gradient-primary h-1" />

      <div className="flex flex-col gap-6 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-h2 break-all">{deal.deal_number}</h1>
              <IconButton aria-label="Copy deal number" variant="ghost" size="sm" onClick={copyNumber}>
                <Copy className="size-4" aria-hidden="true" />
              </IconButton>
              <SalesStatusBadge status={deal.status} />
            </div>
            <p className="text-body-sm text-text-muted mt-1.5">
              {deal.vehicle_title} for {deal.customer_name}
            </p>
            <p className="text-caption text-text-subtle mt-0.5">
              Created {formatDateTimeFull(deal.created_at)}
              {deal.created_by_name ? ` by ${deal.created_by_name}` : ""}
            </p>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-3 lg:text-right">
            <div>
              <p className="text-caption text-text-subtle">{deal.agreed_price !== null ? "Agreed price" : "Proposed price"}</p>
              <motion.p
                key={String(price)}
                {...fadeUp(1)}
                className="text-text-primary text-xl font-semibold tabular-nums"
              >
                {formatMoney(price, deal.currency)}
              </motion.p>
            </div>
            <div className="lg:flex lg:flex-col lg:items-end">
              <p className="text-caption text-text-subtle mb-1">Payment</p>
              <SalesPaymentBar row={deal} />
            </div>
          </div>
        </div>

        <DealStepper status={deal.status} stoppedAt={stoppedAt} visited={visited} />
        {actions}

        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/customers/${deal.customer_id}`}>
            <Button variant="secondary" size="sm" leftIcon={<UserRound className="size-4" aria-hidden="true" />}>
              Customer
            </Button>
          </Link>
          <Link href={`/admin/inventory/${deal.car_id}`}>
            <Button variant="secondary" size="sm" leftIcon={<Car className="size-4" aria-hidden="true" />}>
              Vehicle
            </Button>
          </Link>
          {deal.lead_id && (
            <Link href={`/admin/leads/${deal.lead_id}`}>
              <Button variant="secondary" size="sm" leftIcon={<Target className="size-4" aria-hidden="true" />}>
                Lead {deal.lead_number}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </motion.header>
  );
}