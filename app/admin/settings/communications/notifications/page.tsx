import Link from "next/link";
import { Bell, Building2, Mail, SlidersHorizontal } from "lucide-react";
import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { NotificationPreferenceList } from "@/src/components/settings/notification-preferences-client";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { canOpenSettingsPage, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import { NOTIFICATION_MODULES, preferenceGroups } from "@/src/lib/types/notification-catalog";
import { getMyNotificationPreferences } from "@/src/lib/supabase/notification-preference-queries";

export const metadata = {
  title: "Notifications · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| NOTIFICATION PREFERENCES — PHASE 18
|--------------------------------------------------------------------------
|
| Phase 18 asks to distinguish three things, and all three are on this
| page because leaving one out would make the other two misleading:
|
|   Personal preferences   the toggles. Yours, nobody else's.
|   Mandatory              shown as statements with their reason, not as
|                          disabled switches.
|   Company-wide rules     NOT BUILT, and the page says so.
|
| The third is the honest one. A company-wide rule needs something to
| enforce it, and every notification in this app is created by application
| code calling createNotification — so a rule that only the settings page
| knew about would be a rule the next helper does not consult. Offering
| the toggle anyway would be a control that does nothing, which the brief
| rules out. Making it real is a small change to the gate once somebody
| wants it; guessing at it now is not.
|
| DELIVERY CHANNELS. Sprint 10: "do not present email/WhatsApp as active
| delivery channels without working integrations." There is no email
| provider and no WhatsApp connection, so there are no channel toggles —
| in-app only, stated plainly, with what connecting one would need.
*/

export default async function NotificationSettingsPage() {
  const page = findSettingsPage("notifications");
  if (!page) throw new Error("Settings registry is missing the 'notifications' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const groups = preferenceGroups();
  const preferences = await getMyNotificationPreferences();

  const gaps = NOTIFICATION_MODULES.filter((module) => module.gap);

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote="These are your own settings. Nobody else's notifications change, and nobody else can change yours."
    >
      <div className="flex flex-col gap-6 pb-12">
        <SettingsSection
          title="What you get told about"
          icon={SlidersHorizontal}
          description="Switch off anything you don't need. Applies to you only."
          effect="Takes effect on the next notification. Anything already in your bell stays there."
        >
          {preferences === null ? (
            <p
              role="alert"
              className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
            >
              Your preferences couldn&apos;t be read, so these switches aren&apos;t showing your real
              settings and changing one now could overwrite something. Refresh the page to try again.
            </p>
          ) : preferences.installed === false ? (
            <p className="border-border bg-card-hover/40 text-body-sm text-text-muted rounded-md border px-3 py-2.5">
              Preferences aren&apos;t set up in the database yet, so everybody currently receives
              everything. Run{" "}
              <code className="text-text-primary">sql/15-sprint-10-notification-preferences.sql</code> in
              Supabase and these switches start working.
            </p>
          ) : (
            <NotificationPreferenceList groups={groups} disabledKeys={preferences.disabledKeys} />
          )}
        </SettingsSection>

        <SettingsSection
          title="How notifications reach you"
          icon={Mail}
          description="Which channels are actually connected."
        >
          <p className="text-body-sm text-text-muted">
            In the app only — the bell in the top bar and the{" "}
            <Link
              href="/admin/notifications"
              className="text-primary focus-visible:ring-primary rounded underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
            >
              notifications page
            </Link>
            . Nothing is emailed and nothing goes to WhatsApp, because no email provider and no WhatsApp
            account are connected.
          </p>
          <p className="text-body-sm text-text-muted">
            There are no channel switches here for that reason. A switch marked Email that quietly sends
            nothing is worse than no switch, because you would believe somebody had been told.
          </p>
        </SettingsSection>

        <SettingsSection
          title="Company-wide rules"
          icon={Building2}
          description="Settings that would apply to everybody rather than just you."
        >
          <p className="text-body-sm text-text-muted">
            Not built. Every notification in the app is created by code calling one shared helper, and a
            company rule stored only for this page to read would be a rule that helper never consults —
            so the setting would appear to work and change nothing.
          </p>
          <p className="text-body-sm text-text-muted">
            Making it real means the same gate that already checks your personal preference checking a
            company rule first. That is a small change, and worth doing when there is a rule you actually
            want. If you tell me the rule, I&apos;ll build it rather than guess at the shape.
          </p>
        </SettingsSection>

        <SettingsSection
          title="What doesn't send anything yet"
          icon={Bell}
          description="Modules with no notifications behind them, so you know what the quiet means."
        >
          <dl className="flex flex-col gap-3">
            {gaps.map((module) => (
              <div key={module.id} className="border-border border-l-2 pl-3">
                <dt className="text-body-sm text-text-primary font-medium">{module.label}</dt>
                <dd className="text-caption text-text-muted">{module.gap}</dd>
              </div>
            ))}
          </dl>
        </SettingsSection>
      </div>
    </SettingsPageLayout>
  );
}
