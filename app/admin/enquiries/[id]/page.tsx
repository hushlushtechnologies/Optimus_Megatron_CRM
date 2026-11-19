import Link from "next/link";
import { notFound } from "next/navigation";

import { TriangleAlert } from "lucide-react";

import { getMyEnquiryPermissions } from "@/src/lib/supabase/enquiry-permissions";
import {
  findCustomerMatches,
  getEnquiry,
  getEnquiryActivity,
  getEnquiryLookups,
} from "@/src/lib/supabase/enquiry-queries";
import { createClient } from "@/src/lib/supabase/server";

import { EnquiryDetailClient } from "@/src/components/enquiries/enquiry-detail-client";

interface EnquiryDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function EnquiryDetailPage({ params }: EnquiryDetailPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const permissions = user ? await getMyEnquiryPermissions(supabase) : null;

  if (!user || !permissions || !permissions.view) {
    return (
      <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />

        <div>
          <p className="text-body-sm text-text-primary font-medium">
            You don&apos;t have permission to view enquiries.
          </p>

          <Link
            href="/admin"
            className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block"
          >
            Back to the dashboard
          </Link>
        </div>
      </div>
    );
  }

  const enquiry = await getEnquiry(id);

  if (!enquiry) notFound();

  /*
   * The matches lookup is skipped once a customer is attached: the question it
   * answers — "is this somebody we know?" — has already been answered.
   */
  const [activity, lookups, matches] = await Promise.all([
    getEnquiryActivity(id),
    getEnquiryLookups(),
    enquiry.customer_id ? Promise.resolve([]) : findCustomerMatches(enquiry.email, enquiry.phone),
  ]);

  return (
    <EnquiryDetailClient
      enquiry={enquiry}
      activity={activity}
      matches={matches}
      stages={lookups.stages}
      staff={lookups.staff}
      permissions={permissions}
      currentUserId={user.id}
    />
  );
}
