import { Badge } from "@/src/components/ui/badge";
import { PROMOTION_STATUS_TONES, type PromotionStatus } from "@/src/lib/types/offers";

interface OfferStatusBadgeProps {
  status: PromotionStatus | string;
  className?: string;
}

/** One place decides what colour a campaign status is, so no two screens disagree. */
export function OfferStatusBadge({ status, className }: OfferStatusBadgeProps) {
  const tone = PROMOTION_STATUS_TONES[status as PromotionStatus] ?? "neutral";

  /*
   * Capitalised here rather than stored capitalised: the database value is
   * the lowercase key the constraint checks, and two spellings of the same
   * status is how a filter quietly stops matching.
   */
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <Badge status={tone} className={className}>
      {label}
    </Badge>
  );
}
