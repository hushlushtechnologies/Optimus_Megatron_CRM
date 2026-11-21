import { Percent, Tag } from "lucide-react";

import { cn } from "@/src/lib/utils/cn";
import { formatFils } from "@/src/lib/utils/sales-money";
import type { DiscountType } from "@/src/lib/types/offers";
import type { Fils } from "@/src/lib/utils/sales-money";

interface DiscountBadgeProps {
  discountType: DiscountType;
  /** Percent, or whole dirhams for a fixed amount. */
  discountValue: number;
  /** What it works out to against a specific price. */
  resolvedFils?: Fils | null;
  className?: string;
}

/**
 * What a campaign takes off.
 *
 * Shows the rule, and — when a price is in hand — what that rule actually
 * comes to. "7.5%" and "AED 90,000 off this car" are different pieces of
 * information and a salesperson needs the second one.
 */
export function DiscountBadge({
  discountType,
  discountValue,
  resolvedFils,
  className,
}: DiscountBadgeProps) {
  const rule =
    discountType === "percentage"
      ? `${discountValue}%`
      : `AED ${Math.round(discountValue).toLocaleString("en-AE")}`;

  const Icon = discountType === "percentage" ? Percent : Tag;

  return (
    <span
      className={cn(
        "border-primary/25 bg-primary/10 text-primary-text inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {rule} off

      {/* Only worth saying when it differs from the rule above. */}
      {discountType === "percentage" && resolvedFils !== null && resolvedFils !== undefined && (
        <span className="text-text-muted font-normal">= {formatFils(resolvedFils)}</span>
      )}
    </span>
  );
}
