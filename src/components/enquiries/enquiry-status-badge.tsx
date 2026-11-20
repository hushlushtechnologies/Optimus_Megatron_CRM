import { Badge } from "@/src/components/ui/badge";
import { ENQUIRY_STATUS_TONES, type EnquiryStatus, type EnquiryStatusTone } from "@/src/lib/types/enquiry";

interface EnquiryStatusBadgeProps {
  status: EnquiryStatus | string;
  /**
   * The label and tone configured for this status, which enquiry_list already
   * resolves. Passing them means a status added in settings renders correctly
   * without this component knowing it exists.
   */
  label?: string | null;
  tone?: EnquiryStatusTone | null;
  className?: string;
}

/** One place decides what colour a status is, so no two screens disagree. */
export function EnquiryStatusBadge({ status, label, tone, className }: EnquiryStatusBadgeProps) {
  const resolved = tone ?? ENQUIRY_STATUS_TONES[status as EnquiryStatus] ?? "neutral";

  return (
    <Badge status={resolved} className={className}>
      {label?.trim() || status}
    </Badge>
  );
}
