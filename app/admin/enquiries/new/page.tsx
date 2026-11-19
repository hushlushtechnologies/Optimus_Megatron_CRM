import Link from "next/link";

import { TriangleAlert } from "lucide-react";

import { getMyEnquiryPermissions } from "@/src/lib/supabase/enquiry-permissions";
import { getEnquiryLookups } from "@/src/lib/supabase/enquiry-queries";
import { createClient } from "@/src/lib/supabase/server";

import { ManualEnquiryForm } from "@/src/components/enquiries/manual-enquiry-form";

export default async function NewEnquiryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const permissions = user ? await getMyEnquiryPermissions(supabase) : null;

  if (!user || !permissions || !permissions.manage) {
    return (
      <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />

        <div>
          <p className="text-body-sm text-text-primary font-medium">
            You don&apos;t have permission to add an enquiry.
          </p>

          <p className="text-body-sm text-text-muted mt-1">
            Ask an administrator if you take enquiries by phone or at the showroom.
          </p>

          <Link
            href="/admin/enquiries"
            className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block"
          >
            Back to enquiry requests
          </Link>
        </div>
      </div>
    );
  }

  const lookups = await getEnquiryLookups();

  return <ManualEnquiryForm staff={lookups.staff} cars={lookups.cars} currentUserId={user.id} />;
}
