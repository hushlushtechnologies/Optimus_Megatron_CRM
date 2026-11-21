"use client";

import { Info } from "lucide-react";

import { cn } from "@/src/lib/utils/cn";
import { formatFils } from "@/src/lib/utils/sales-money";
import type { Fils } from "@/src/lib/utils/sales-money";

interface DiscountPreviewProps {
  /** What the vehicle is listed at. */
  originalFils: Fils | null;
  /** What the campaign takes off. */
  discountFils: Fils;
  /** A label for where the figure came from, e.g. the campaign's name. */
  sourceLabel?: string;
  className?: string;
}

/**
 * What a discount does to a price.
 *
 * Three figures and a line saying this is not a quote. That last part is
 * load-bearing: this component is a preview computed for display, and the
 * price a customer is actually charged is settled server-side when the deal
 * is written. Showing a number without saying which of the two it is, is how
 * a salesperson quotes a figure the system then refuses.
 */
export function DiscountPreview({
  originalFils,
  discountFils,
  sourceLabel,
  className,
}: DiscountPreviewProps) {
  if (originalFils === null) {
    return (
      <p className={cn("text-body-sm text-text-subtle", className)}>
        Enter a price to see what this takes off.
      </p>
    );
  }

  const zero = BigInt(0);
  const finalFils = discountFils >= originalFils ? zero : originalFils - discountFils;

  /* Share of the original, to one decimal place, worked out in integers. */
  const percentOff =
    originalFils > zero
      ? Number((discountFils * BigInt(1000)) / originalFils) / 10
      : 0;

  return (
    <div className={cn("surface-card flex flex-col gap-3 rounded-lg p-4", className)}>
      <dl className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-body-sm text-text-muted">Listed</dt>
          <dd className="text-body-sm text-text-primary tabular-nums">
            {formatFils(originalFils)}
          </dd>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-body-sm text-text-muted">
            Discount
            {percentOff > 0 && (
              <span className="text-text-subtle"> ({percentOff.toFixed(1)}%)</span>
            )}
          </dt>
          <dd className="text-body-sm text-primary-text tabular-nums font-medium">
            −{formatFils(discountFils)}
          </dd>
        </div>

        <div className="border-border flex items-baseline justify-between gap-4 border-t pt-2">
          <dt className="text-body text-text-primary font-medium">After discount</dt>
          <dd className="text-h4 text-text-primary tabular-nums">{formatFils(finalFils)}</dd>
        </div>
      </dl>

      <p className="text-caption text-text-subtle flex items-start gap-1.5">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {sourceLabel ? `From ${sourceLabel}. ` : ""}
        An estimate for display. The price on a deal is worked out and checked when the deal is
        saved, and it still goes through the usual discount approval.
      </p>
    </div>
  );
}
