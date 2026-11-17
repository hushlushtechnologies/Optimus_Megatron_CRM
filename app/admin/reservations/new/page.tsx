import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/src/lib/supabase/server";
import { getMySalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { getReservationLookups } from "@/src/lib/supabase/reservation-queries";
import { getTestDriveFormPrefill } from "@/src/lib/supabase/test-drive-form-queries";
import { AddReservationForm } from "@/src/components/reservations/add-reservation-form";

interface NewReservationPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
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

export default async function NewReservationPage({ searchParams }: NewReservationPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const permissions = user ? await getMySalesPermissions(supabase) : null;

  if (!user || !permissions?.reservationsRequest) {
    return (
      <Notice title="You don't have permission to request reservations.">Ask an administrator if you need access.</Notice>
    );
  }

  const params = await searchParams;
  const [lookupsResult, prefill] = await Promise.all([getReservationLookups(), getTestDriveFormPrefill(params)]);
  const { lookups } = lookupsResult;

  if (!lookups.settings || lookups.showrooms.length === 0) {
    return (
      <Notice title="The form couldn't be loaded.">
        {lookups.showrooms.length === 0 && lookups.settings
          ? "No showrooms are set up yet."
          : "Nothing has been lost. Refresh the page to try again, and let someone know if it keeps happening."}
      </Notice>
    );
  }

  return (
    <AddReservationForm
      lookups={{ showrooms: lookups.showrooms, owners: lookups.owners }}
      settings={lookups.settings}
      prefill={prefill}
      currentUserId={user.id}
      canConfirm={permissions.reservationsConfirm}
    />
  );
}