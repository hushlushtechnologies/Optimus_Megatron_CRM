"use client";

import Link from "next/link";
import { ArrowRight, Info, Store } from "lucide-react";

import { EnquirySection } from "@/src/components/enquiries/enquiry-detail-section";
import type { EnquiryStockCar } from "@/src/lib/types/enquiry-details";
import { formatMoney } from "@/src/lib/utils/sales-format";

interface EnquiryTradeComparisonProps {
  /** What the customer hopes their car takes off the price. */
  expected: number | null;
  /** Ours. null when they described something not in stock. */
  car: EnquiryStockCar | null;
  /** What they described, when no stock car was picked. */
  wanted: string | null;
  index?: number;
}

/**
 * The other half of a trade-in: the car from stock.
 *
 * Deliberately a second card rather than more rows on the first. The one
 * mistake this screen must never allow is reading a figure from the
 * customer's car as if it belonged to ours, and a shared table invites
 * exactly that. This card carries the stock number and the listed price;
 * the card above it carries neither.
 */
export function EnquiryTradeComparison({ expected, car, wanted, index = 0 }: EnquiryTradeComparisonProps) {
  const listed = car?.listedPrice ?? null;
  const balance = listed !== null && expected !== null ? listed - expected : null;

  return (
    <EnquirySection
      title="Against our"
      index={index}
      icon={<Store className="size-4" aria-hidden="true" />}
      description={car ? car.title : (wanted ?? "Nothing picked from stock yet")}
    >
      {car ? (
        <dl className="divide-border divide-y">
          <div className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-body-sm text-text-muted">Listed at</dt>
            <dd className="text-body-sm text-text-primary font-medium">
              {listed === null ? "No price set" : formatMoney(listed)}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-body-sm text-text-muted">Showroom</dt>
            <dd className="text-body-sm text-text-primary">{car.locationName ?? "Not set"}</dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-body-sm text-text-muted">Stock number</dt>
            <dd className="text-body-sm text-text-primary tabular-nums">
              <Link href={`/admin/inventory/${car.id}`} className="hover:text-primary-text">
                {car.stockId}
              </Link>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-body-sm text-text-muted">
          {wanted
            ? "They described what they want rather than picking something in stock."
            : "No vehicle has been chosen yet."}
        </p>
      )}

      {/* ---- The sum, when both halves are known ---- */}

      {balance !== null && (
        <p className="text-body-sm text-text-muted bg-card-hover flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-2.5">
          <span className="text-text-primary font-medium">{formatMoney(listed ?? 0)}</span>
          <span>less</span>
          <span className="text-text-primary font-medium">{formatMoney(expected ?? 0)}</span>
          <ArrowRight className="text-text-subtle size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="text-text-primary font-medium">{formatMoney(Math.max(0, balance))}</span> to pay
          </span>

          {balance < 0 && <span className="text-amber-400">— they expect more than the car costs.</span>}
        </p>
      )}

      <p className="text-caption text-text-subtle flex items-start gap-2">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        The listed price is live from stock. The amount off it is what the customer hopes for, not a
        valuation, and nothing here reserves the car.
      </p>
    </EnquirySection>
  );
}
