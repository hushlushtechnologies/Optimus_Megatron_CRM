import { Palette } from "lucide-react";
import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { AppearanceClient } from "@/src/components/settings/appearance-client";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { canOpenSettingsPage, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";

export const metadata = {
  title: "Appearance · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| APPEARANCE — PHASE 22
|--------------------------------------------------------------------------
|
| Personal, not company-wide, which is why it needs no permission beyond
| being signed in and why there is no save button: it is stored in this
| browser and applies immediately.
|
| Phase 22 lists table density as a possible setting. It is not here,
| because there is nowhere to put it: no density provider, no stored
| preference, and the tables size themselves from the design tokens. A
| switch would need a second provider threaded through every table, which
| is a real change rather than a settings page. Said plainly below rather
| than left as a gap.
*/

export default async function AppearanceSettingsPage() {
  const page = findSettingsPage("appearance");
  if (!page) throw new Error("Settings registry is missing the 'appearance' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote="These are yours and apply to this browser only. Nobody else's screen changes."
    >
      <div className="flex flex-col gap-6 pb-12">
        <SettingsSection
          title="Theme"
          icon={Palette}
          description="How the app looks for you."
          effect="Applies straight away, in this browser. It does not follow you to another computer."
        >
          <AppearanceClient />
        </SettingsSection>

        <SettingsSection
          title="Table density"
          description="Phase 22 lists this; it is not built."
        >
          <p className="text-body-sm text-text-muted">
            Tables size themselves from the design tokens, and there is no density provider to switch. A
            control here would need one threaded through every table in the app, which is a change to the
            tables rather than a setting. Worth doing if the current spacing is a problem on your screens
            — tell me which tables and I will look at them directly.
          </p>
        </SettingsSection>
      </div>
    </SettingsPageLayout>
  );
}
