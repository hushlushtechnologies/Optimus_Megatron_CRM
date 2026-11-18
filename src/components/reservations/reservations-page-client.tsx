"use client";

import { useMemo, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, Clock, Plus, ShieldCheck, Timer, TriangleAlert } from "lucide-react";
import { MetricCard } from "@/src/components/shared/metric-card";
import { Button } from "@/src/components/ui/button";
import { ReservationsToolbar } from "@/src/components/reservations/reservations-toolbar";
import { ReservationsTable } from "@/src/components/reservations/reservations-table";
import { parseReservationParams } from "@/src/lib/utils/reservation-params";
import type {
  ReservationListRow,
  ReservationLookups,
  ReservationSummary,
} from "@/src/lib/types/reservations";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";

interface ReservationsPageClientProps {
  /** null when the summary query failed. */
  summary: ReservationSummary | null;
  /** null when the list query failed. */
  tableData: { rows: ReservationListRow[]; totalCount: number } | null;
  page: number;
  pageSize: number;
  lookups: ReservationLookups;
  lookupsFailed: boolean;
  permissions: SalesPermissions;
  currentUserId: string;
}

const ZERO: ReservationSummary = { requestsWaiting: 0, activeHolds: 0, expiringSoon: 0, convertedMonth: 0 };

export function ReservationsPageClient({
  summary,
  tableData,
  page,
  pageSize,
  lookups,
  lookupsFailed,
  permissions,
  currentUserId,
}: ReservationsPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const s = summary ?? ZERO;

  const query = useMemo(
    () => parseReservationParams(Object.fromEntries(searchParams.entries())),
    [searchParams],
  );
  const hasActiveQuery = !!(query.search || query.showroom || query.owner || query.source);

  const go = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  };

  const clearSearchAndFilters = () =>
    go((params) => {
      ["q", "showroom", "owner", "source"].forEach((key) => params.delete(key));
      params.set("page", "1");
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h3">Reservations</h1>
          <p className="text-body-sm text-text-muted">
            Review requests and hold vehicles for customers. A request never holds a vehicle. Only a confirmed
            reservation does.
          </p>
        </div>
        {permissions.reservationsRequest && (
          <Link href="/admin/reservations/new">
            <Button variant="gradient" size="sm" leftIcon={<Plus className="size-4" />}>
              New Reservation
            </Button>
          </Link>
        )}
      </div>

      {!summary && (
        <div
          role="alert"
          className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
          The summary numbers couldn&apos;t be loaded, so the cards below show zeros for now. Refresh the page
          to try again.
        </div>
      )}

      <section aria-label="Reservation summary" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard
          label="Requests waiting"
          value={s.requestsWaiting}
          icon={<Clock />}
          caption="Not holding a vehicle"
        />
        <MetricCard
          label="Active holds"
          value={s.activeHolds}
          icon={<ShieldCheck />}
          caption="Vehicles held now"
        />
        <MetricCard
          label="Expiring soon"
          value={s.expiringSoon}
          icon={<Timer />}
          caption="Ending in 24 hours"
        />
        <MetricCard
          label="Converted"
          value={s.convertedMonth}
          icon={<BadgeCheck />}
          caption="Became deals this month"
        />
      </section>

      <div className="flex flex-col gap-4">
        <ReservationsToolbar
          resultCount={tableData?.totalCount ?? 0}
          lookups={lookups}
          lookupsFailed={lookupsFailed}
          summary={summary}
        />

        <div
          className={isPending ? "opacity-60 transition-opacity" : "transition-opacity"}
          aria-busy={isPending}
        >
          {tableData ? (
            <ReservationsTable
              rows={tableData.rows}
              totalCount={tableData.totalCount}
              page={page}
              pageSize={pageSize}
              tab={query.tab}
              onPageChange={(p) => go((params) => params.set("page", String(p)))}
              onPageSizeChange={(size) =>
                go((params) => {
                  params.set("pageSize", String(size));
                  params.set("page", "1");
                })
              }
              hasActiveQuery={hasActiveQuery}
              onClearQuery={clearSearchAndFilters}
              permissions={permissions}
              currentUserId={currentUserId}
              settings={lookups.settings}
            />
          ) : (
            <div role="alert" className="surface-card flex items-start gap-3 p-5">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
              <div>
                <p className="text-body-sm text-text-primary font-medium">
                  The reservations couldn&apos;t be loaded.
                </p>
                <p className="text-body-sm text-text-muted mt-0.5">
                  Nothing has been lost. Refresh the page to try again, and let someone know if it keeps
                  happening.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
