import { Badge } from "@/src/components/ui/badge";

interface EnquiryTypeBadgeProps {
  /** The type key, e.g. "Sell My Car". */
  type: string;
  /** The configured label, when the row carries one. Falls back to the key. */
  label?: string | null;
  className?: string;
}

/**
 * What kind of request this is.
 *
 * Neutral on purpose. Type is a category, not a state, and five coloured
 * categories beside a coloured status and a coloured priority turns a list
 * into a sweet-shop where nothing stands out.
 */
export function EnquiryTypeBadge({ type, label, className }: EnquiryTypeBadgeProps) {
  return (
    <Badge status="neutral" className={className}>
      {label?.trim() || type}
    </Badge>
  );
}
