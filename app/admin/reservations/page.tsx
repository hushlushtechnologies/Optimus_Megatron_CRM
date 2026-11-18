import Link from "next/link";
import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/src/lib/supabase/server";
import { getMySalesPermissions } from "@/src/lib/supabase/sales-permissions";
import {
  getReservationLookups,
  getReservationRows,
  getReservationSummary,
} from "@/src/lib/supabase/reservation-queries";
import {
  buildReservationSearchParams,
  effectiveReservationSort,
  parseReservationParams,
} from "@/src/lib/utils/reservation-params";
import { ReservationsPageClient } from "@/src/components/reservations/reservations-page-client";

interface ReservationsPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ReservationsPage({ searchParams }: ReservationsPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const permissions = user ? await getMySalesPermissions(supabase) : null;

  if (!user || !permissions?.reservationsView) {
    return (
      <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
        <div>
          <p className="text-body-sm text-text-primary font-medium">
            You don&apos;t have permission to view reservations.
          </p>
          <p className="text-body-sm text-text-muted mt-1">Ask an administrator if you need access.</p>
          <Link
            href="/admin"
            className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block"
          >
            Back to the dashboard
          </Link>
        </div>
      </div>
    );
  }

  const params = parseReservationParams(await searchParams);
  const sort = effectiveReservationSort(params.tab, params.sort);

  const [result, summary, lookupsResult] = await Promise.all([
    getReservationRows({ ...params, sort }),
    getReservationSummary(),
    getReservationLookups(),
  ]);

  // Past the last page (for example after the list shrank): jump to the real last one, keeping everything.
  if (result && result.totalCount > 0 && params.page > Math.ceil(result.totalCount / params.pageSize)) {
    const lastPage = Math.ceil(result.totalCount / params.pageSize);
    redirect(`/admin/reservations?${buildReservationSearchParams({ ...params, page: lastPage }).toString()}`);
  }

  return (
    <ReservationsPageClient
      summary={summary}
      tableData={result}
      page={params.page}
      pageSize={params.pageSize}
      lookups={lookupsResult.lookups}
      lookupsFailed={lookupsResult.failed}
      permissions={permissions}
      currentUserId={user.id}
    />
  );
}
