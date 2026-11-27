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
  title: "Inventory settings · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| INVENTORY LOOKUPS — PHASE 7
|--------------------------------------------------------------------------
|
| Eleven lists, all from lookup-registry.ts and all rendered by the same
| editor. Nothing here can be deleted: values are switched off, so the
| vehicles that already use one keep it. That is the brief's requirement —
| "when disabling a value, preserve historical vehicles that use it" — and
| the way to be sure of it is that no delete exists to get wrong.
|
| The schema was ready for this. Every one of these tables already carries
| is_active and sort_order, and the vehicle forms already read them with
| .eq("is_active", true).order("sort_order"), so retiring a value works
| today without a single migration.
|
| Vehicle statuses are rename-and-reorder only. Code decides what is
| sellable and what appears on the website by matching slugs, so a new
| status would be one nothing knows how to treat.
|
| The "Not configurable" section covers what the phase lists that is not a
| lookup table — vehicle conditions and regional specs are fixed sets in
| the database, colours are typed per vehicle, and there are no inspection
| tables at all.
*/

export default async function InventorySettingsPage() {
  const page = findSettingsPage("inventory");
  if (!page) throw new Error("Settings registry is missing the 'inventory' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const canEdit = canEditCategory(access, "operations");
  const tables = await getLookupTablesForGroup("inventory");
  const unconfigurable = unconfigurableFor("inventory");

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
