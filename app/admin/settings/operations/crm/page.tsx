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
  title: "Customer & lead settings · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| CUSTOMER & LEAD LOOKUPS — PHASE 8
|--------------------------------------------------------------------------
|
| Six lists: customer sources, customer tags, lead stages, lead tags, lost
| reasons and follow-up actions. Same editor, same rule — values are
| switched off, never deleted, so every customer and lead that used one
| keeps it.
|
| Lead stages are rename-and-reorder only, and this is the one worth
| understanding. The dashboard's conversion figures and the Sprint 9 lead
| report compute won, lost and open totals from stage_type, and code finds
| the stage a lead starts in by slug. Renaming "Qualified" to "Contacted"
| is harmless. Changing a stage's TYPE moves leads between won and lost in
| every report at once, with nothing on any screen to show it happened.
| That is why the type is fixed here even though the name is not — the
| brief's "do not change pipeline status constraints without understanding
| downstream transitions" in practical terms.
|
| One bug fixed on the way in: getLeadSourceOptions, which feeds the
| source picker on the lead detail page, had no is_active filter while
| every sibling in the same file did. It made no difference until now
| because nothing could retire a source. From this page on, it would have.
*/


export default async function CrmSettingsPage() {
  const page = findSettingsPage("crm");
  if (!page) throw new Error("Settings registry is missing the 'crm' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const canEdit = canEditCategory(access, "operations");
  const tables = await getLookupTablesForGroup("crm");
  const unconfigurable = unconfigurableFor("crm");

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
