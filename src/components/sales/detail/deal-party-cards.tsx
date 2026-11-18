"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Phone } from "lucide-react";
import { CustomerAvatar } from "@/src/components/customers/customer-avatar";
import { DealNotices } from "@/src/components/sales/form/deal-form-notice";
import { useMotion } from "@/src/hooks/use-motion";
import { formatMoney } from "@/src/lib/utils/sales-format";
import type { ContextMessages } from "@/src/lib/utils/sales-deal-form";
import type { SalesDealDetail } from "@/src/lib/types/sales-detail";

export function DealCustomerCard({ deal }: { deal: SalesDealDetail }) {
  const { fadeUp } = useMotion();

  return (
    <motion.section {...fadeUp(1)} aria-label="Customer" className="surface-card flex flex-col gap-4 p-5">
      <p className="text-label">Customer</p>
      <div className="flex items-center gap-3">
        <CustomerAvatar fullName={deal.customer_name} photoUrl={deal.customer_photo_url} size="md" />
        <div className="min-w-0">
          <Link
            href={`/admin/customers/${deal.customer_id}`}
            className="text-text-primary hover:text-primary-text block truncate font-medium"
          >
            {deal.customer_name}
          </Link>
          <p className="text-caption text-text-subtle truncate">{deal.customer_number}</p>
        </div>
      </div>
      {deal.customer_phone && (
        <a
          href={`tel:${deal.customer_phone}`}
          className="text-body-sm text-text-muted hover:text-text-primary inline-flex min-h-11 items-center gap-2 self-start sm:min-h-0"
        >
          <Phone className="size-4" aria-hidden="true" />
          {deal.customer_phone}
        </a>
      )}
    </motion.section>
  );
}

export function DealVehicleCard({ deal, messages }: { deal: SalesDealDetail; messages: ContextMessages }) {
  const { fadeUp } = useMotion();
  const subtitle = [deal.brand_name, deal.model_name].filter(Boolean).join(" · ");

  return (
    <motion.section {...fadeUp(2)} aria-label="Vehicle" className="surface-card flex flex-col gap-4 p-5">
      <p className="text-label">Vehicle</p>
      <div className="min-w-0">
        <Link
          href={`/admin/inventory/${deal.car_id}`}
          className="text-text-primary hover:text-primary-text block font-medium"
        >
          {deal.vehicle_title}
        </Link>
        <p className="text-caption text-text-subtle">
          {deal.stock_id}
          {subtitle ? ` · ${subtitle}` : ""}
        </p>
      </div>
      <dl className="text-body-sm flex flex-col gap-1.5">
        <div className="flex justify-between gap-3">
          <dt className="text-text-subtle">Showroom</dt>
          <dd className="text-text-primary text-right">{deal.location_name}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-subtle">Price when the deal started</dt>
          <dd className="text-text-primary text-right tabular-nums">
            {formatMoney(deal.listed_price, deal.currency)}
          </dd>
        </div>
      </dl>
      <DealNotices {...messages} />
    </motion.section>
  );
}
