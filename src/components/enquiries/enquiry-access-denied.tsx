import Link from "next/link";
import { TriangleAlert } from "lucide-react";

interface EnquiryAccessDeniedProps {
  /** What they were trying to do, e.g. "view enquiries". */
  action: string;
  /** One sentence on why access is restricted and what to do about it. */
  reason: string;
  backHref?: string;
  backLabel?: string;
}

/**
 * The permission-denied state for every enquiry screen.
 *
 * Says what was refused and what to do next, rather than only that something
 * was refused. The generic UnauthorizedState is right for a whole section;
 * this one is for a page that can explain itself.
 */
export function EnquiryAccessDenied({
  action,
  reason,
  backHref = "/admin",
  backLabel = "Back to the dashboard",
}: EnquiryAccessDeniedProps) {
  return (
    <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />

      <div>
        <p className="text-body-sm text-text-primary font-medium">
          You don&apos;t have permission to {action}.
        </p>

        <p className="text-body-sm text-text-muted mt-1">{reason}</p>

        <Link
          href={backHref}
          className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block"
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
