import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/src/lib/supabase/server";
import { currentUserSalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { getSalesDealDetail } from "@/src/lib/supabase/sales-detail-queries";
import { getDealPricingExtras } from "@/src/lib/supabase/sales-pricing-queries";
import { getDealAssignmentHistory } from "@/src/lib/supabase/sales-owner-queries";
import { isUuid } from "@/src/lib/utils/search-term";
import { SalesDetailClient } from "@/src/components/sales/detail/sales-detail-client";
import { getPaymentRules } from "@/src/lib/supabase/sales-payment-queries";
import { getSalesDocuments } from "@/src/lib/supabase/sales-document-queries";
import { getDealDelivery, getDeliveryLookups } from "@/src/lib/supabase/sales-delivery-queries";
import { getTestDrivesForPanel } from "@/src/lib/supabase/test-drive-panel-queries";
import { getSourceTestDriveForDeal } from "@/src/lib/supabase/test-drive-sales-queries";
import { getDealNotes } from "@/src/lib/supabase/sales-notes-queries";

interface SalesDealPageProps {
  params: Promise<{ id: string }>;
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

export default async function SalesDealPage({ params }: SalesDealPageProps) {
  const { id } = await params;

  // Anything that isn't a real ID can't exist, so don't even ask the database.
  if (!isUuid(id)) notFound();

  const permissions = await currentUserSalesPermissions();
  if (!permissions.view) {
    return <Notice title="You don't have permission to view deals.">Ask an administrator if you need access.</Notice>;
  }

  const supabase = await createClient();
    const [result, pricingExtras, assignments, userResult, paymentRules] = await Promise.all([
    getSalesDealDetail(id),
    getDealPricingExtras(id),
    getDealAssignmentHistory(id),
    supabase.auth.getUser(),
    getPaymentRules(),
  ]);

  if (result.status === "not_found") notFound();

  if (result.status === "error") {
    return (
      <Notice title="This deal couldn't be loaded.">
        Nothing has been lost. Refresh the page to try again, and let someone know if it keeps happening.
      </Notice>
    );
    
  }

    const documents = await getSalesDocuments({ dealId: id, reservationId: result.data.deal.reservation_id });

                 const [delivery, deliveryLookups, testDrives, sourceTestDriveNumber, notes] = await Promise.all([
    getDealDelivery(id),
    permissions.complete ? getDeliveryLookups() : Promise.resolve(null),
    getTestDrivesForPanel({
      customerId: result.data.deal.customer_id,
      carId: result.data.deal.car_id,
    }),
    getSourceTestDriveForDeal(id),
    getDealNotes(id),
  ]);

  return (
    <SalesDetailClient
      data={result.data}
      permissions={permissions}
      pricingExtras={pricingExtras}
      assignments={assignments}

            delivery={delivery}
      deliveryLookups={deliveryLookups}
      testDrives={testDrives}
      sourceTestDriveNumber={sourceTestDriveNumber}
       notes={notes}
      currentUserId={userResult.data.user?.id ?? null}
            separateVerifier={paymentRules.separateVerifier}
            documents={documents}
    />
  );
}