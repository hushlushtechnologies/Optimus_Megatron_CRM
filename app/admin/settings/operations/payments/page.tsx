import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsLoadError } from "@/src/components/settings/settings-load-error";
import { PaymentSettingsClient } from "@/src/components/settings/payment-settings-client";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { canOpenSettingsPage, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import { currentUserSalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { getScopedSettingsHistory, getSettingsRow } from "@/src/lib/supabase/settings-section-queries";
import { PAYMENT_HISTORY } from "@/src/lib/utils/settings-history-scope";

export const metadata = {
  title: "Payment settings · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| PAYMENTS & FINANCIAL CONTROL — PHASE 13
|--------------------------------------------------------------------------
|
| Both settings here are safeguards, so this page carries the strictest
| handling in the batch: a confirmation that names the previous value and
| says what the change does, a permission the database enforces too, and a
| history list scoped to these two fields so a change to either is easy to
| find afterwards.
|
| Read-only access shows the values. Somebody checking whether the
| separate-verifier rule is on should not have to ask for edit rights to
| find out, and they should not have to take a colleague's word for it.
*/

export default async function PaymentSettingsPage() {
  const page = findSettingsPage("payments");
  if (!page) throw new Error("Settings registry is missing the 'payments' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const [permissions, settings, history] = await Promise.all([
    currentUserSalesPermissions(),
    getSettingsRow(),
    getScopedSettingsHistory(PAYMENT_HISTORY),
  ]);

  if (settings.status === "error") {
    return (
      <SettingsPageLayout page={page}>
        <SettingsLoadError what="Payment settings" />
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote={
        permissions.settings
          ? undefined
          : "You can see these controls but not change them. Changing them needs the sales settings permission."
      }
    >
      <PaymentSettingsClient
        settings={settings.settings}
        history={history}
        canEdit={permissions.settings}
      />
    </SettingsPageLayout>
  );
}
