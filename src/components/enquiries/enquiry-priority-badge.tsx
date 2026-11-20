import { ArrowDown, ArrowUp, Equal, Flame } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { ENQUIRY_PRIORITY_TONES, type EnquiryPriority } from "@/src/lib/types/enquiry";

const ICONS: Record<EnquiryPriority, typeof Flame> = {
  Urgent: Flame,
  High: ArrowUp,
  Normal: Equal,
  Low: ArrowDown,
};

interface EnquiryPriorityBadgeProps {
  priority: EnquiryPriority;
  /** Normal is the ordinary case; a list of forty doesn't need it labelled. */
  hideNormal?: boolean;
  className?: string;
}

/**
 * How urgent this enquiry is.
 *
 * Carries an icon as well as a colour, because colour alone fails anyone who
 * can't distinguish amber from red — and on a printed list it fails everyone.
 */
export function EnquiryPriorityBadge({ priority, hideNormal = false, className }: EnquiryPriorityBadgeProps) {
  if (hideNormal && priority === "Normal") return null;

  const Icon = ICONS[priority];

  return (
    <Badge status={ENQUIRY_PRIORITY_TONES[priority]} className={className}>
      <Icon className="size-3.5" aria-hidden="true" />
      {priority}
    </Badge>
  );
}
