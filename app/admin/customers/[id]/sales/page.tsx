import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { currentUserSalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { getCustomerSales } from "@/src/lib/supabase/customer-sales-queries";
import { getCustomerById } from "@/src/lib/supabase/test-drive-form-queries";
import { isUuid } from "@/src/lib/utils/search-term";
import { CustomerSalesPanel } from "@/src/components/customers/customer-sales-panel";

interface CustomerSalesPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerSalesPage({ params }: CustomerSalesPageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const permissions = await currentUserSalesPermissions();
  if (!permissions.view && !permissions.reservationsView) {
    return (
      <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
        <div>
          <p className="text-body-sm text-text-primary font-medium">
            You don&apos;t have permission to view sales.
          </p>
          <p className="text-body-sm text-text-muted mt-1">Ask an administrator if you need access.</p>
          <Link
            href={`/admin/customers/${id}`}
            className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block"
          >
            Back to the customer
          </Link>
        </div>
      </div>
    );
  }

  const [customer, data] = await Promise.all([getCustomerById(id), getCustomerSales(id)]);
  if (!customer) notFound();

  return (
    <CustomerSalesPanel
      customer={customer}
      data={data}
      showDeals={permissions.view}
      showReservations={permissions.reservationsView}
      canCreateDeal={permissions.create}
      canRequestReservation={permissions.reservationsRequest}
    />
  );
}
