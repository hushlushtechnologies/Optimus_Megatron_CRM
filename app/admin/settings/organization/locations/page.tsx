import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsLoadError } from "@/src/components/settings/settings-load-error";
import { ShowroomSettingsClient } from "@/src/components/settings/showroom-settings-client";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import {
  canEditCategory,
  canOpenSettingsPage,
  currentSettingsAccess,
} from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import { getShowroomSettings } from "@/src/lib/supabase/settings-section-queries";

export const metadata = {
  title: "Showrooms & locations · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| SHOWROOMS & LOCATIONS — PHASE 6
|--------------------------------------------------------------------------
|
| The write permission here is settings.organization, checked in the
| action and again by the policy sql/13 adds.
|
| That is weaker footing than the other pages in this batch and worth
| being straight about: the other pages reuse sales.settings, which the
| database has enforced since Sprint 8. public.locations predates every
| migration in this repo, so whatever policies it has are in the Supabase
| project and cannot be read from the code. Until sql/13 runs, the only
| thing standing between a signed-in user and this table is the server
| action.
|
| Nothing in the app could write this table before, so nothing gets worse
| by shipping it this way — but it is the one place in Batch 2 where the
| database is not yet backing up what the screen says.
*/

export default async function ShowroomSettingsPage() {
  const page = findSettingsPage("locations");
  if (!page) throw new Error("Settings registry is missing the 'locations' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const canEdit = canEditCategory(access, "organization");
  const result = await getShowroomSettings();

  if (result.status === "error") {
    return (
      <SettingsPageLayout page={page}>
        <SettingsLoadError what="Your showrooms" />
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote={
        canEdit
          ? undefined
          : "You can see your showrooms but not change them. Changing them needs the organization settings permission."
      }
    >
      <ShowroomSettingsClient
        showrooms={result.data.showrooms}
        addressSupported={result.data.addressSupported}
        canEdit={canEdit}
      />
    </SettingsPageLayout>
  );
}
