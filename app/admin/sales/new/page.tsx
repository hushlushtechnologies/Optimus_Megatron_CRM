import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/src/lib/supabase/server";
import { getMySalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { getTestDriveFormPrefill } from "@/src/lib/supabase/test-drive-form-queries";
import { AddDealForm } from "@/src/components/sales/form/add-deal-form";

interface NewDealPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
      <div>
        <p className="text-body-sm text-text-primary font-medium">{title}</p>
        <div className="text-body-sm text-text-muted mt-1">{children}</div>
        <Link href="/admin/sales" className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block">
          Back to Sales
        </Link>
      </div>
    </div>
  );
}

export default async function NewDealPage({ searchParams }: NewDealPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const permissions = user ? await getMySalesPermissions(supabase) : null;

  if (!user || !permissions?.create) {
    return (
      <Notice title="You don't have permission to create deals.">Ask an administrator if you need access.</Notice>
    );
  }

  const params = await searchParams;
  const [showrooms, owners, settings, prefill] = await Promise.all([
    supabase.from("locations").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.rpc("list_sales_owners"),
    supabase.from("sales_settings").select("discount_auto_approve_percent, currency").maybeSingle(),
    getTestDriveFormPrefill(params),
  ]);

  if (showrooms.error || owners.error || settings.error || !settings.data) {
    console.error("NewDealPage lookups error:", showrooms.error ?? owners.error ?? settings.error);
    return (
      <Notice title="The form couldn't be loaded.">
        Nothing has been lost. Refresh the page to try again, and let someone know if it keeps happening.
      </Notice>
    );
  }

  if ((showrooms.data ?? []).length === 0) {
    return <Notice title="No showrooms are set up yet.">Add at least one active showroom before creating a deal.</Notice>;
  }

  const ownerRows = (owners.data ?? []) as unknown as { id: string; full_name: string | null }[];

  return (
    <AddDealForm
      lookups={{
        showrooms: showrooms.data ?? [],
        owners: ownerRows.map((owner) => ({ id: owner.id, name: owner.full_name?.trim() || "Unnamed staff" })),
      }}
      prefill={prefill}
      currentUserId={user.id}
      canAssign={permissions.assign}
      settings={{
        autoApprovePercent: Number(settings.data.discount_auto_approve_percent),
        currency: settings.data.currency as string,
      }}
    />
  );
}