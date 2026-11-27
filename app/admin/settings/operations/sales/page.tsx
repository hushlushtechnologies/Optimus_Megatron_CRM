import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsLoadError } from "@/src/components/settings/settings-load-error";
import { SalesSettingsSections } from "@/src/components/settings/sales-settings-sections";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { canOpenSettingsPage, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import { currentUserSalesPermissions } from "@/src/lib/supabase/sales-permissions";
import {
  getDiscountApproverRoles,
  getFeeTypes,
  getScopedSettingsHistory,
  getSettingsRow,
} from "@/src/lib/supabase/settings-section-queries";
import { SALES_HISTORY } from "@/src/lib/utils/settings-history-scope";
import { getDeliveryTemplates } from "@/src/lib/supabase/sales-delivery-queries";

export const metadata = {
  title: "Sales & Pricing settings · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| SALES & PRICING — PHASE 12
|--------------------------------------------------------------------------
|
| Batch 1 put the whole Sales Settings form on this route unchanged, which
| got the consolidation done without touching any business logic. Batch 2
| does the part that was left: the one form becomes four pages, and the
| save that wrote every column becomes three saves that each write their
| own.
|
| What moved off this page:
|
|   hold length, reservation deposit  -> operations/reservations
|   deposit to confirm, verifier      -> operations/payments
|   company and document details      -> organization/company
|
| What stayed: the discount threshold, the fees switch, the fee types, the
| delivery checklists, and the note about tax not being calculated.
|
| Fee types and delivery checklists keep their own components and their
| own save actions from Sprint 8, untouched. They were already per-row
| saves, which is why they were never part of the problem.
*/

export default async function SalesSettingsPage() {
  const page = findSettingsPage("sales");
  if (!page) throw new Error("Settings registry is missing the 'sales' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const [permissions, settings, feeTypes, approverRoles, templates, history] = await Promise.all([
    currentUserSalesPermissions(),
    getSettingsRow(),
    getFeeTypes(),
    getDiscountApproverRoles(),
    getDeliveryTemplates(),
    getScopedSettingsHistory(SALES_HISTORY),
  ]);

  if (settings.status === "error") {
    return (
      <SettingsPageLayout page={page}>
        <SettingsLoadError what="Sales settings" />
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
      <SalesSettingsSections
        settings={settings.settings}
        feeTypes={feeTypes}
        approverRoles={approverRoles}
        templates={templates}
        history={history}
        canEdit={permissions.settings}
      />
    </SettingsPageLayout>
  );
}
