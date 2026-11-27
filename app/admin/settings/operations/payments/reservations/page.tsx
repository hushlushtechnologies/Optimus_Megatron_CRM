import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsLoadError } from "@/src/components/settings/settings-load-error";
import { ReservationSettingsClient } from "@/src/components/settings/reservation-settings-client";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { canOpenSettingsPage, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import { currentUserSalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { getScopedSettingsHistory, getSettingsRow } from "@/src/lib/supabase/settings-section-queries";
import { RESERVATION_HISTORY } from "@/src/lib/utils/settings-history-scope";

export const metadata = {
  title: "Reservation settings · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| RESERVATIONS — PHASE 10
|--------------------------------------------------------------------------
|
| Two permissions, two questions:
|
|   settings.operations   may you open this page
|   sales.settings        may you change what is on it
|
| Someone with the first and not the second sees the real values, read
| only. That is more use than being told the settings exist: "the hold is
| 3 days" is the answer they came for most of the time.
|
| sales.settings is the same key that has guarded these four values since
| Sprint 8, and the database checks it again on write. Moving the page did
| not move the lock.
*/

export default async function ReservationSettingsPage() {
  const page = findSettingsPage("reservations");
  if (!page) throw new Error("Settings registry is missing the 'reservations' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const [permissions, settings, history] = await Promise.all([
    currentUserSalesPermissions(),
    getSettingsRow(),
    getScopedSettingsHistory(RESERVATION_HISTORY),
  ]);

  if (settings.status === "error") {
    return (
      <SettingsPageLayout page={page}>
        <SettingsLoadError what="Reservation settings" />
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote={
        permissions.settings
          ? undefined
          : "You can see these settings but not change them. Changing them needs the sales settings permission."
      }
    >
      <ReservationSettingsClient
        settings={settings.settings}
        history={history}
        canEdit={permissions.settings}
      />
    </SettingsPageLayout>
  );
}
