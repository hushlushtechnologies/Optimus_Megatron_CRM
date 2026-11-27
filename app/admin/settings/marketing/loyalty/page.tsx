import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { LoyaltySettingsForm } from "@/src/components/offers/loyalty-settings-form";
import {
  canOpenSettingsPage,
  currentSettingsAccess,
} from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import { currentUserOfferPermissions } from "@/src/lib/supabase/offer-permissions";
import { getLoyaltySettings } from "@/src/lib/supabase/loyalty-queries";

export const metadata = {
  title: "Loyalty settings · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| LOYALTY, NOW UNDER SETTINGS
|--------------------------------------------------------------------------
|
| The existing LoyaltySettingsForm, the existing query, the existing save
| actions, the existing database audit trigger. Nothing copied, nothing
| reimplemented.
|
| The read/edit split that was already here is preserved exactly:
| loyaltyView opens the page, loyaltySettings authorises a change, and the
| form takes `canEdit` and disables itself. A sales manager can see what a
| point is worth without being able to change it — which is the behaviour
| Sprint 8 built, and Sprint 10 has no business widening.
|
| /admin/offers/settings now redirects here.
*/

export default async function LoyaltySettingsPage() {
  const page = findSettingsPage("loyalty");
  if (!page) throw new Error("Settings registry is missing the 'loyalty' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const permissions = await currentUserOfferPermissions();

  if (!permissions.loyaltyView && !permissions.loyaltySettings) {
    return <UnauthorizedState />;
  }

  const data = await getLoyaltySettings();

  if (!data) {
    return (
      <SettingsPageLayout page={page}>
        <div role="alert" className="surface-card flex max-w-2xl flex-col gap-2 p-5">
          <p className="text-body-sm text-text-primary font-medium">
            The loyalty settings couldn&apos;t be loaded.
          </p>
          <p className="text-body-sm text-text-muted">
            The loyalty migration may not have been run yet. Nothing has been lost.
          </p>
        </div>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote={
        permissions.loyaltySettings
          ? undefined
          : "You can see these values but not change them. Changing what a point is worth needs the loyalty settings permission."
      }
    >
      <LoyaltySettingsForm
        settings={data.settings}
        rules={data.rules}
        canEdit={permissions.loyaltySettings}
      />
    </SettingsPageLayout>
  );
}
