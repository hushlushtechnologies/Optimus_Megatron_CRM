import Link from "next/link";
import { BookmarkPlus, Car, MapPin } from "lucide-react";

import { getReservationsForCustomer } from "@/src/lib/supabase/customer-reservation-queries";
import { currentUserSalesPermissions } from "@/src/lib/supabase/sales-permissions";
import {
  ReservationStatusBadge,
  effectiveReservationStatus,
} from "@/src/components/reservations/reservation-status-badge";
import { SalesExpiryChip } from "@/src/components/sales/sales-expiry-chip";
import { formatDay } from "@/src/lib/utils/test-drive-format";

/**
 * Every reservation this customer has, newest request first.
 *
 * The Reservations page remains the place to act on a hold; this is the
 * customer-side view of the same rows, with a link through to each one.
 */
export async function CustomerReservationsTab({ customerId }: { customerId: string }) {
  const permissions = await currentUserSalesPermissions();

  if (!permissions.reservationsView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="bg-card-hover text-text-subtle flex size-14 items-center justify-center rounded-full">
          <BookmarkPlus className="size-6" aria-hidden="true" />
        </span>
        <div className="max-w-sm">
          <p className="text-body-lg text-text-primary">You don&apos;t have permission to view reservations</p>
          <p className="text-body-sm text-text-muted mt-1">Ask an administrator if you need access.</p>
        </div>
      </div>
    );
  }

  const reservations = await getReservationsForCustomer(customerId);

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-text-muted">Every vehicle hold requested for this customer.</p>

        {permissions.reservationsRequest && (
          <Link
            href={`/admin/reservations/new?customerId=${customerId}`}
            className="bg-primary text-body-sm hover:bg-primary-hover focus-visible:ring-primary inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[#0b1220] transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <BookmarkPlus className="size-4" aria-hidden="true" />
            Request reservation
          </Link>
        )}
      </div>

      {reservations === null ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          The reservations couldn&apos;t be loaded. Refresh the page to try again.
        </p>
      ) : reservations.length === 0 ? (
        <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-10 text-center">
          No reservations for this customer yet.
        </p>
      ) : (
        <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
          {reservations.map((reservation) => (
            <li key={reservation.id} className="flex flex-col gap-2.5 px-4 py-3.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <Link
                    href={`/admin/reservations/${reservation.id}`}
                    className="text-body-sm text-text-primary hover:text-primary-text focus-visible:ring-primary rounded font-medium focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {reservation.reservation_number}
                  </Link>

                  <p className="text-caption text-text-subtle mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="flex min-w-0 items-center gap-1">
                      <Car className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {reservation.vehicle_title} · {reservation.stock_id}
                      </span>
                    </span>

                    <span className="flex items-center gap-1">
                      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                      {reservation.location_name}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <SalesExpiryChip
                    expiresAt={reservation.expires_at}
                    reservationStatus={reservation.status}
                  />
                  <ReservationStatusBadge status={effectiveReservationStatus(reservation)} size="sm" />
                </div>
              </div>

              <p className="text-caption text-text-subtle">
                Requested {formatDay(reservation.requested_at)}
                {reservation.requested_by_name ? ` by ${reservation.requested_by_name}` : ""}
                {reservation.deal_number ? " · " : ""}
                {reservation.deal_number && reservation.deal_id && (
                  <Link
                    href={`/admin/sales/${reservation.deal_id}`}
                    className="text-primary-text hover:text-primary-hover focus-visible:ring-primary rounded focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Deal {reservation.deal_number}
                  </Link>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}