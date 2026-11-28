import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/src/lib/supabase/server";
import { getMySalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { getReservationDetail } from "@/src/lib/supabase/reservation-queries";
import { isUuid } from "@/src/lib/utils/search-term";
import { ReservationDetailClient } from "@/src/components/reservations/reservation-detail-client";
import { getPaymentRules, getReservationPayments } from "@/src/lib/supabase/sales-payment-queries";
import { getAssignableReservationOwners } from "@/src/lib/supabase/reservation-owner-queries";
import { getSalesDocuments } from "@/src/lib/supabase/sales-document-queries";

interface ReservationPageProps {
  params: Promise<{ id: string }>;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
      <div>
        <p className="text-body-sm text-text-primary font-medium">{title}</p>
        <div className="text-body-sm text-text-muted mt-1">{children}</div>
        <Link
          href="/admin/reservations"
          className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block"
        >
          Back to Reservations
        </Link>
      </div>
    </div>
  );
}

export default async function ReservationPage({ params }: ReservationPageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const permissions = user ? await getMySalesPermissions(supabase) : null;

  if (!user || !permissions?.reservationsView) {
    return (
      <Notice title="You don't have permission to view reservations.">
        Ask an administrator if you need access.
      </Notice>
    );
  }

  const [result, payments, rules, assignableOwners] = await Promise.all([
    getReservationDetail(id),
    getReservationPayments(id),
    getPaymentRules(),
    getAssignableReservationOwners(),
  ]);
  if (result.status === "not_found") notFound();

  if (result.status === "error") {
    return (
      <Notice title="This reservation couldn't be loaded.">
        Nothing has been lost. Refresh the page to try again, and let someone know if it keeps happening.
      </Notice>
    );
  }

  const documents = await getSalesDocuments({ dealId: null, reservationId: id });

  return (
    <ReservationDetailClient
      data={result.data}
      permissions={permissions}
      currentUserId={user.id}
      payments={payments}
      separateVerifier={rules.separateVerifier}
      documents={documents}
      assignableOwners={assignableOwners}
    />
  );
}
