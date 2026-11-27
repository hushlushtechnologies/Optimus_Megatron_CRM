import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsUnavailable } from "@/src/components/settings/settings-unavailable";
import { SettingsHistoryPanel } from "@/src/components/settings/settings-history-panel";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { CompanyProfileCard } from "@/src/components/sales/settings/company-profile-card";
import {
  canOpenSettingsPage,
  currentSettingsAccess,
} from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import { currentUserSalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { getCompanyProfile } from "@/src/lib/supabase/sales-document-queries";
import { getScopedSettingsHistory } from "@/src/lib/supabase/settings-section-queries";
import { COMPANY_HISTORY } from "@/src/lib/utils/settings-history-scope";

export const metadata = {
  title: "Company profile · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| COMPANY PROFILE — PHASE 5
|--------------------------------------------------------------------------
|
| CompanyProfileCard is rendered here, not copied. It holds its own form
| state and calls saveCompanyProfileAction directly, which is why moving
| it was only a matter of rendering it somewhere else.
|
| As of Batch 2 this is the ONLY place these fields can be edited. The
| Sales settings page used to carry the same card; it now links here
| instead. One form, one save path, one row — Sprint 10 rules out "two
| forms writing different values" and the way to honour that is to have
| one form.
|
| The fields reach further than sales. The legal name, address and tax
| registration number appear on quotations, invoices, receipts and the
| enquiry documents too, which is why they are company-wide rather than a
| sales setting. The note on the page says what changing them does and,
| importantly, what it does not do: a document already issued keeps the
| details it was issued with.
|
| The logo is NOT here, because it is not in this table or any other. See
| organization/branding for which file feeds what, and what making it
| configurable would actually take.
*/

export default async function CompanyProfileSettingsPage() {
  const page = findSettingsPage("company");
  if (!page) throw new Error("Settings registry is missing the 'company' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const permissions = await currentUserSalesPermissions();

  if (!permissions.settings) {
    return (
      <SettingsPageLayout page={page}>
        <SettingsUnavailable
          page={{
            ...page,
            note: "You can see that the company profile exists, but changing it needs the sales settings permission. These details appear on every quotation, invoice and receipt.",
          }}
        />
      </SettingsPageLayout>
    );
  }

  const [company, history] = await Promise.all([
    getCompanyProfile(),
    getScopedSettingsHistory(COMPANY_HISTORY),
  ]);

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote="These details are printed on quotations, invoices and receipts. Changing them affects documents generated from now on; documents already issued keep what they were issued with."
    >
      <div className="flex flex-col gap-6">
        <CompanyProfileCard company={company} />
        <SettingsHistoryPanel
          items={history}
          emptyNote="No company details have been changed yet."
        />
      </div>
    </SettingsPageLayout>
  );
}
