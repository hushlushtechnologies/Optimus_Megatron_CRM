import Link from "next/link";
import { ArrowLeft, TriangleAlert } from "lucide-react";

import { OfferForm } from "@/src/components/offers/offer-form";
import { currentUserOfferPermissions } from "@/src/lib/supabase/offer-permissions";
import { getOfferDetail, getOfferLookups } from "@/src/lib/supabase/offer-queries";
import { offerDetailToForm } from "@/src/lib/utils/offer-detail-to-form";

export const metadata = {
  title: "Edit Campaign",
};

export default async function EditOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const permissions = await currentUserOfferPermissions();
  const { id } = await params;

  if (!permissions.manage) {
    return (
      <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="text-warning mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-body-sm text-text-primary font-medium">
            You don&apos;t have permission to edit campaigns.
          </p>
          <Link
            href={permissions.view ? `/admin/offers/${id}` : "/admin"}
            className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block"
          >
            {permissions.view ? "Back to the campaign" : "Back to the dashboard"}
          </Link>
        </div>
      </div>
    );
  }

  const [detail, lookups] = await Promise.all([getOfferDetail(id), getOfferLookups()]);

  if (!detail) {
    return (
      <div className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="text-warning mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-body-sm text-text-primary font-medium">
            That campaign couldn&apos;t be found.
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

  /*
   * An archived campaign is read-only. Editing one would mean saving changes
   * to something that cannot apply to anything — and restoring it afterwards
   * would bring back a version nobody reviewed.
   */
  if (detail.archivedAt !== null) {
    return (
      <div className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="text-warning mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-body-sm text-text-primary font-medium">
            This campaign is archived, so it can&apos;t be edited.
          </p>
          <p className="text-body-sm text-text-muted mt-1">
            Restore it first if you need to change it, or duplicate it to start a new campaign from
            the same settings.
          </p>
          <Link
            href={`/admin/offers/${id}`}
            className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block"
          >
            Back to the campaign
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/admin/offers/${id}`}
          className="text-body-sm text-text-muted hover:text-text-primary inline-flex w-fit items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to the campaign
        </Link>

        <div>
          <h1 className="text-h2 text-text-primary">Edit {detail.name}</h1>

          <p className="text-body-sm text-text-muted mt-1 max-w-2xl">
            {detail.totals.appliedCount > 0
              ? `This campaign has been used ${detail.totals.appliedCount} ${detail.totals.appliedCount === 1 ? "time" : "times"}. Changing it here does not alter what those customers were given — each redemption keeps the terms it was made under.`
              : "Changes take effect for new deals from the moment you save."}
          </p>
        </div>
      </div>

      <OfferForm
        initial={offerDetailToForm(detail)}
        lookups={{
          brands: lookups.brands,
          models: lookups.models,
          collections: lookups.collections,
          locations: lookups.locations,
          customerTags: lookups.customerTags,
        }}
        canPublish={permissions.publish}
      />
    </div>
  );
}
