import { Badge } from "@/src/components/ui/badge";
import { ENQUIRY_STATUS_TONES, type EnquiryStatus } from "@/src/lib/types/enquiry";

interface EnquiryStatusBadgeProps {
  status: EnquiryStatus;
  className?: string;
}

/** One place decides what colour a status is, so no two screens disagree. */
export function EnquiryStatusBadge({ status, className }: EnquiryStatusBadgeProps) {
  return (
    <Badge status={ENQUIRY_STATUS_TONES[status]} className={className}>
      {status}
    </Badge>
  );
}
