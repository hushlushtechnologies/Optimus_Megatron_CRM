import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { LookupEditor } from "@/src/components/settings/lookup-editor";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import {
  canEditCategory,
  canOpenSettingsPage,
  currentSettingsAccess,
} from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import { getLookupTablesForGroup } from "@/src/lib/supabase/settings-lookup-queries";
import { unconfigurableFor } from "@/src/lib/types/lookup-registry";

export const metadata = {
  title: "Enquiry settings · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| ENQUIRY LOOKUPS — PHASE 11
|--------------------------------------------------------------------------
|
| Three lists, and two of them are rename-and-reorder only, because the
| Sprint 7 enquiry architecture is a graph rather than a set of dropdowns.
|
| enquiry_status_transitions says which status may follow which, PER TYPE.
| So a status added here would have no transitions into or out of it and
| would be unreachable; a type added here would arrive with no transitions
| at all and an enquiry on it could not be moved anywhere. The brief says
| it directly: "do not replace established workflows with independent
| dropdown values that do not match database constraints."
|
| Sources are the one list with no graph behind them, so they are fully
| editable.
|
| Worth recording what Sprint 7 got right here. The enquiry vocabulary is
| fetched once per request INCLUDING retired values, because validating an
| enquiry that already sits on a retired status needs that status to
| exist — and the active-only helpers (activeTypes, activeSources,
| activeStatuses) are what the pickers use. That is a better arrangement
| than filtering in the query, and check-lookup-active-filter.py checks the
| pages go through those helpers rather than the raw arrays.
*/


export default async function EnquirySettingsPage() {
  const page = findSettingsPage("enquiries");
  if (!page) throw new Error("Settings registry is missing the 'enquiries' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const canEdit = canEditCategory(access, "operations");
  const tables = await getLookupTablesForGroup("enquiries");
  const unconfigurable = unconfigurableFor("enquiries");

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote={
        canEdit
          ? undefined
          : "You can see these lists but not change them. Changing them needs the operations settings permission."
      }
    >
      <div className="flex flex-col gap-6 pb-12">
        {tables.map((table) => (
          <LookupEditor key={table.spec.id} data={table} canEdit={canEdit} />
        ))}

        {unconfigurable.length > 0 && (
          <SettingsSection
            title="Not configurable"
            description="Things that look like lists but are not, and what each one would take."
          >
            <dl className="flex flex-col gap-3">
              {unconfigurable.map((item) => (
                <div key={item.label} className="border-border border-l-2 pl-3">
                  <dt className="text-body-sm text-text-primary font-medium">{item.label}</dt>
                  <dd className="text-caption text-text-muted">{item.reason}</dd>
                </div>
              ))}
            </dl>
          </SettingsSection>
        )}
      </div>
    </SettingsPageLayout>
  );
}
