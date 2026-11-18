import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { currentUserSalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { getSalesSettingsPageData } from "@/src/lib/supabase/sales-settings-queries";
import { SalesSettingsClient } from "@/src/components/sales/settings/sales-settings-client";
import { getCompanyProfile } from "@/src/lib/supabase/sales-document-queries";
import { getDeliveryTemplates } from "@/src/lib/supabase/sales-delivery-queries";

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
      <div>
        <p className="text-body-sm text-text-primary font-medium">{title}</p>
        <div className="text-body-sm text-text-muted mt-1">{children}</div>
        <Link
          href="/admin/sales"
          className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block"
        >
          Back to Sales
        </Link>
      </div>
    </div>
  );
}

export default async function SalesSettingsPage() {
  const permissions = await currentUserSalesPermissions();
  if (!permissions.settings) {
    return (
      <Notice title="You don't have permission to change sales settings.">
        Ask an administrator if you need access.
      </Notice>
    );
  }

  const [result, company, templates] = await Promise.all([
    getSalesSettingsPageData(),
    getCompanyProfile(),
    getDeliveryTemplates(),
  ]);
  if (result.status === "error") {
    return (
      <Notice title="The settings couldn't be loaded.">
        Nothing has been lost. Refresh the page to try again, and let someone know if it keeps happening.
      </Notice>
    );
  }

  return <SalesSettingsClient data={result.data} company={company} templates={templates} />;
}
