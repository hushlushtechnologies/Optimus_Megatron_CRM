import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { OfferDetailClient } from "@/src/components/offers/detail/offer-detail-client";
import { currentUserOfferPermissions } from "@/src/lib/supabase/offer-permissions";
import { getOfferDetail } from "@/src/lib/supabase/offer-queries";

export const metadata = {
  title: "Campaign",
};

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const permissions = await currentUserOfferPermissions();

  if (!permissions.view) {
    return (
      <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="text-warning mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-body-sm text-text-primary font-medium">
            You don&apos;t have permission to view offers.
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

  const { id } = await params;
  const detail = await getOfferDetail(id);

  /*
   * Not found rather than a thrown 404: an archived campaign is still
   * readable, so the only way here is a bad id or a campaign somebody else
   * deleted. Saying so beats a blank error page.
   */
  if (!detail) {
    return (
      <div className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="text-warning mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-body-sm text-text-primary font-medium">
            That campaign couldn&apos;t be found.
          </p>
          <p className="text-body-sm text-text-muted mt-1">
            It may have been deleted, or the link may be wrong.
          </p>
          <Link
            href="/admin/offers?view=all"
            className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block"
          >
            All campaigns
          </Link>
        </div>
      </div>
    );
  }

  return <OfferDetailClient detail={detail} permissions={permissions} />;
}
