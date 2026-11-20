import Link from "next/link";
import { ArrowUpRight, MailQuestion } from "lucide-react";

import { getCustomerEnquiries } from "@/src/lib/supabase/enquiry-link-queries";
import { currentUserEnquiryPermissions } from "@/src/lib/supabase/enquiry-permissions";

import { EnquiryPriorityBadge } from "@/src/components/enquiries/enquiry-priority-badge";
import { EnquiryStatusBadge } from "@/src/components/enquiries/enquiry-status-badge";
import { EnquiryTypeBadge } from "@/src/components/enquiries/enquiry-type-badge";
import { formatDay } from "@/src/lib/utils/test-drive-format";

/**
 * Every enquiry this customer has sent, newest first.
 *
 * Read from the same view the enquiries module uses, so a status here is
 * the status there — including the labels and tones configured in the
 * workflow rather than a second set hard-coded for this tab.
 *
 * Someone without permission to view enquiries sees a line saying so. That
 * is different from a customer who has sent none, and conflating the two
 * would have staff tell a customer there is no record of their enquiry.
 */
export async function CustomerEnquiriesTab({ customerId }: { customerId: string }) {
  const permissions = await currentUserEnquiryPermissions();

  if (!permissions.view) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="bg-card-hover text-text-subtle flex size-14 items-center justify-center rounded-full">
          <MailQuestion className="size-6" aria-hidden="true" />
        </span>
        <div className="max-w-sm">
          <p className="text-body-lg text-text-primary">You can&apos;t view enquiries</p>
          <p className="text-body-sm text-text-muted mt-1">
            This customer may well have sent some. Ask an administrator for access to the enquiries module.
          </p>
        </div>
      </div>
    );
  }

  const enquiries = await getCustomerEnquiries(customerId);

  if (enquiries === null) {
    return (
      <p className="text-body-sm text-text-muted py-8 text-center">
        Their enquiries couldn&apos;t be loaded. Refresh the page to try again.
      </p>
    );
  }

  if (enquiries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="bg-card-hover text-text-subtle flex size-14 items-center justify-center rounded-full">
          <MailQuestion className="size-6" aria-hidden="true" />
        </span>
        <div className="max-w-sm">
          <p className="text-body-lg text-text-primary">No enquiries from this customer yet</p>
          <p className="text-body-sm text-text-muted mt-1">
            Anything they send through the website, or that staff log for them, appears here.
          </p>
        </div>
      </div>
    );
  }

  const open = enquiries.filter((item) => item.status_is_open).length;

  return (
    <div className="flex flex-col gap-4 pt-4">
      <p className="text-body-sm text-text-muted">
        {enquiries.length === 1 ? "One enquiry" : `${enquiries.length} enquiries`}
        {open > 0 && `, ${open} still open`}.
      </p>

      <ul className="flex flex-col gap-2">
        {enquiries.map((enquiry) => (
          <li key={enquiry.id}>
            <Link
              href={`/admin/enquiries/${enquiry.id}`}
              className="surface-card hover:bg-card-hover focus-visible:ring-primary flex flex-col gap-2 rounded-lg p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <div className="flex flex-wrap items-center gap-2">
                <EnquiryTypeBadge type={enquiry.enquiry_type} label={enquiry.type_label} />

                <EnquiryStatusBadge
                  status={enquiry.status}
                  label={enquiry.status_label}
                  tone={enquiry.status_tone}
                />

                <EnquiryPriorityBadge priority={enquiry.priority} hideNormal />

                <span className="text-caption text-text-subtle ml-auto inline-flex items-center gap-1">
                  {enquiry.enquiry_number}
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </span>
              </div>

              <p className="text-body-sm text-text-primary">
                {enquiry.subject ?? enquiry.vehicle_title ?? enquiry.vehicle_text ?? "No subject"}
              </p>

              <p className="text-caption text-text-muted">
                {[
                  formatDay(enquiry.created_at),
                  enquiry.assigned_to ? `with ${enquiry.assigned_to_name}` : "unassigned",
                  enquiry.next_follow_up_at ? `follow-up ${formatDay(enquiry.next_follow_up_at)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
