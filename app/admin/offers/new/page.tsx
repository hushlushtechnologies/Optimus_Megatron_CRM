import Link from "next/link";
import { ArrowLeft, TriangleAlert } from "lucide-react";

import { OfferForm } from "@/src/components/offers/offer-form";
import { currentUserOfferPermissions } from "@/src/lib/supabase/offer-permissions";
import { getOfferLookups } from "@/src/lib/supabase/offer-queries";

export const metadata = {
  title: "New Promotion",
};

export default async function NewOfferPage() {
  const permissions = await currentUserOfferPermissions();

  /*
   * Gated on manage, not view. Somebody who can look at campaigns has no
   * business on the create form, and a form that submits and then refuses is
   * a form that wasted their time.
   */
  if (!permissions.manage) {
    return (
      <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="text-warning mt-0.5 size-5 shrink-0" aria-hidden="true" />

        <div>
          <p className="text-body-sm text-text-primary font-medium">
            You don&apos;t have permission to create campaigns.
          </p>

          <p className="text-body-sm text-text-muted mt-1">
            {permissions.view
              ? "You can view campaigns, but creating one needs the manage permission."
              : "Ask an administrator if you need access."}
          </p>

          <Link
            href={permissions.view ? "/admin/offers" : "/admin"}
            className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block"
          >
            {permissions.view ? "Back to offers" : "Back to the dashboard"}
          </Link>
        </div>
      </div>
    );
  }

  const lookups = await getOfferLookups();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/offers?view=all"
          className="text-body-sm text-text-muted hover:text-text-primary inline-flex w-fit items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All campaigns
        </Link>

        <div>
          <h1 className="text-h2 text-text-primary">New campaign</h1>

          <p className="text-body-sm text-text-muted mt-1 max-w-2xl">
            Nothing here goes live until you publish it. Save a draft at any point and come back
            to it.
          </p>
        </div>
      </div>

      <OfferForm
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
