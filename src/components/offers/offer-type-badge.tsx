import { Badge } from "@/src/components/ui/badge";
import { PROMOTION_TYPE_LABELS, type PromotionType } from "@/src/lib/types/offers";

interface OfferTypeBadgeProps {
  type: PromotionType | string;
  className?: string;
}

/**
 * What a campaign is aimed at.
 *
 * Deliberately neutral in colour. Status is what somebody scanning a list
 * needs to see at a glance; if the type were coloured too, neither would
 * stand out.
 */
export function OfferTypeBadge({ type, className }: OfferTypeBadgeProps) {
  const label = PROMOTION_TYPE_LABELS[type as PromotionType] ?? type;

  return (
    <Badge status="neutral" className={className}>
      {label}
    </Badge>
  );
}
