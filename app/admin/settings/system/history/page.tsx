import { History } from "lucide-react";
import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { SettingsLoadError } from "@/src/components/settings/settings-load-error";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { canOpenSettingsPage, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import { getAllSettingsHistory } from "@/src/lib/supabase/system-settings-queries";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";

export const metadata = {
  title: "Configuration history · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| CONFIGURATION CHANGE HISTORY — PHASE 23
|--------------------------------------------------------------------------
|
| The one place to answer "who changed a setting, and when", across every
| settings page rather than scoped to one like the panels from Batch 2.
|
| It is recorded by a database trigger rather than by application code,
| which is the right way round: a change made in the SQL editor is
| recorded the same as one made on a screen. That is also why this page
| can be trusted in a way an application-written log could not.
|
| WHAT IS NOT COVERED, stated because an audit trail with silent gaps is
| worse than one with known gaps:
|
|   lookup lists     Batch 3's editors write brands, stages and the rest
|                    with no history table behind them. A renamed brand
|                    leaves no record of who renamed it.
|   showrooms        same.
|   notification     personal preferences, not business configuration, and
|   preferences      deliberately not audited.
|
| Adding history to the lookup tables means a trigger per table or one
| generic trigger, which is a migration rather than a page.
*/

export default async function SettingsHistoryPage() {
  const page = findSettingsPage("history");
  if (!page) throw new Error("Settings registry is missing the 'history' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const result = await getAllSettingsHistory();

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote="Recorded by the database itself, so a change made directly in SQL appears here too."
    >
      <div className="flex flex-col gap-6 pb-12">
        <SettingsSection
          title="Recent changes"
          icon={History}
          description="Every change to sales, pricing, fee, document and delivery settings."
        >
          {result.status === "error" ? (
            <SettingsLoadError what="The change history" />
          ) : result.status === "absent" ? (
            <p role="alert" className="text-body-sm text-text-muted">
              There is no settings history table in this database, so changes are not being recorded. That
              is worth fixing before relying on this page.
            </p>
          ) : result.items.length === 0 ? (
            <p className="text-body-sm text-text-subtle">
              No settings have been changed yet. This is a real empty list, not a failed read.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {result.items.map((item) => (
                <li key={item.id} className="border-border border-l-2 pl-3">
                  {item.changes.map((change) => (
                    <p key={change} className="text-body-sm text-text-primary">
                      {change}
                    </p>
                  ))}
                  <p className="text-caption text-text-subtle">
                    {formatDateTimeFull(item.changed_at)} · {item.changed_by_name}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </SettingsSection>

        <SettingsSection
          title="What this does not cover"
          description="Known gaps, so the list is not mistaken for everything."
        >
          <p className="text-body-sm text-text-muted">
            The lookup lists added in this sprint — brands, models, lead stages, enquiry sources and the
            rest — have no history behind them. A renamed brand leaves no record of who renamed it.
            Showrooms are the same.
          </p>
          <p className="text-body-sm text-text-muted">
            Closing that means a trigger on each lookup table, or one generic trigger over all of them.
            It is a migration rather than a page, and worth doing if you want lookups audited.
          </p>
          <p className="text-body-sm text-text-muted">
            Personal notification preferences are not recorded, on purpose. They are somebody&apos;s own
            setting rather than business configuration.
          </p>
        </SettingsSection>
      </div>
    </SettingsPageLayout>
  );
}
