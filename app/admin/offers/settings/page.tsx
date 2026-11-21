import Link from "next/link";
import { ArrowLeft, TriangleAlert } from "lucide-react";

import { LoyaltySettingsForm } from "@/src/components/offers/loyalty-settings-form";
import { currentUserOfferPermissions } from "@/src/lib/supabase/offer-permissions";
import { getLoyaltySettings } from "@/src/lib/supabase/loyalty-queries";

export const metadata = {
  title: "Loyalty Settings",
};

export default async function LoyaltySettingsPage() {
  const permissions = await currentUserOfferPermissions();

  /*
   * Readable with loyaltyView, editable only with loyaltySettings. A sales
   * manager should be able to see what the earn rate is without being able
   * to change what points are worth.
   */
  if (!permissions.loyaltyView && !permissions.loyaltySettings) {
    return (
      <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="text-warning mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-body-sm text-text-primary font-medium">
            You don&apos;t have permission to view the loyalty program.
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

  const data = await getLoyaltySettings();

  if (!data) {
    return (
      <div className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="text-warning mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-body-sm text-text-primary font-medium">
            The loyalty settings couldn&apos;t be loaded.
          </p>
          <p className="text-body-sm text-text-muted mt-1">
            The loyalty migration may not have been run yet. Nothing has been lost.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/offers"
          className="text-body-sm text-text-muted hover:text-text-primary inline-flex w-fit items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Offers &amp; Promotions
        </Link>

        <div>
          <h1 className="text-h2 text-text-primary">Loyalty settings</h1>

          <p className="text-body-sm text-text-muted mt-1 max-w-2xl">
            The earn rate and what points are worth. Both start blank on purpose — the program
            can&apos;t run until you decide them, and changing them later affects future sales
            only.
          </p>
        </div>
      </div>

      <LoyaltySettingsForm
        settings={data.settings}
        rules={data.rules}
        canEdit={permissions.loyaltySettings}
      />
    </div>
  );
}
