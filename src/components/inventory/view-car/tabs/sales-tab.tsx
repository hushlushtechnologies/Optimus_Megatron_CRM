"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { BadgeCheck, CircleAlert, Handshake, ShieldCheck, Tag, Timer } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { SalesStatusBadge } from "@/src/components/sales/sales-status-badge";
import { SalesExpiryChip } from "@/src/components/sales/sales-expiry-chip";
import {
  ReservationStatusBadge,
  effectiveReservationStatus,
} from "@/src/components/reservations/reservation-status-badge";
import { useMotion } from "@/src/hooks/use-motion";
import { formatMoney } from "@/src/lib/utils/sales-format";
import { formatDateTimeFull, formatDay } from "@/src/lib/utils/test-drive-format";
import type { VehicleSalesData } from "@/src/lib/supabase/vehicle-sales-queries";
import { cn } from "@/src/lib/utils/cn";

interface VehicleSalesTabProps {
  carId: string;
  data: VehicleSalesData;
  canViewDeals: boolean;
  canViewReservations: boolean;
  canCreateDeal: boolean;
  canRequestReservation: boolean;
}

type Tone = "sold" | "held" | "free" | "unknown";

const TONE_STYLE: Record<Tone, string> = {
  sold: "border-primary/40 bg-primary/10",
  held: "border-amber-500/30 bg-amber-500/10",
  free: "border-success/30 bg-success/10",
  unknown: "border-border bg-card-hover/40",
};

function ListFailed({ what }: { what: string }) {
  return (
    <p
      role="alert"
      className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
    >
      The {what} couldn&apos;t be loaded. Refresh the page to try again.
    </p>
  );
}

export function VehicleSalesTab({
  carId,
  data,
  canViewDeals,
  canViewReservations,
  canCreateDeal,
  canRequestReservation,
}: VehicleSalesTabProps) {
  const { fadeUp } = useMotion();
  const ctx = data.context;

  let tone: Tone = "unknown";
  let headline = "The current holds couldn't be checked.";
  let detail: string | null = null;
  let Icon = CircleAlert;

  if (ctx) {
    if (ctx.holderStatus === "Completed") {
      tone = "sold";
      Icon = BadgeCheck;
      headline = "Sold";
      detail = `Delivered in deal ${ctx.holderDealNumber}.`;
    } else if (ctx.holderStatus === "Confirmed") {
      tone = "sold";
      Icon = BadgeCheck;
      headline = "Sold, awaiting delivery";
      detail = `Committed to confirmed deal ${ctx.holderDealNumber}.`;
    } else if (ctx.holderStatus === "Reserved") {
      tone = "held";
      Icon = ShieldCheck;
      headline = "Reserved";
      detail = `Held by deal ${ctx.holderDealNumber}.`;
    } else if (ctx.reservationNumber && ctx.reservationExpiresAt) {
      tone = "held";
      Icon = Timer;
      headline = "Held by a reservation";
      detail = `Reservation ${ctx.reservationNumber} holds this vehicle until ${formatDateTimeFull(ctx.reservationExpiresAt)}.`;
    } else {
      tone = "free";
      Icon = ShieldCheck;
      headline = "Free to sell";
      detail = "No deal or reservation is holding this vehicle.";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <motion.section
        {...fadeUp(0)}
        aria-label="Current hold"
        className={cn("flex flex-col gap-3 rounded-xl border p-5", TONE_STYLE[tone])}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-text-primary text-base font-semibold">{headline}</p>
              {detail && <p className="text-body-sm text-text-muted mt-0.5">{detail}</p>}
              {ctx && ctx.openDeals > 0 && (
                <p className="text-caption text-text-subtle mt-1">
                  {ctx.openDeals} {ctx.openDeals === 1 ? "deal is" : "deals are"} in progress. Only one can hold the vehicle.
                </p>
              )}
              {ctx?.reservationExpiresAt && ctx.reservationNumber && (
                <div className="mt-2">
                  <SalesExpiryChip expiresAt={ctx.reservationExpiresAt} reservationStatus="Confirmed" />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canCreateDeal && (
              <Link href={`/admin/sales/new?carId=${carId}`}>
                <Button variant="secondary" size="sm" leftIcon={<Handshake className="size-4" aria-hidden="true" />}>
                  Start a deal
                </Button>
              </Link>
            )}
            {canRequestReservation && (
              <Link href={`/admin/reservations/new?carId=${carId}`}>
                <Button variant="secondary" size="sm" leftIcon={<Tag className="size-4" aria-hidden="true" />}>
                  Reserve
                </Button>
              </Link>
            )}
          </div>
        </div>
      </motion.section>

      {canViewDeals && (
        <motion.section {...fadeUp(1)} aria-label="Deals" className="surface-card flex flex-col gap-4 p-5">
          <p className="text-label">Deals on this vehicle</p>
          {data.deals === null ? (
            <ListFailed what="deals" />
          ) : data.deals.length === 0 ? (
            <p className="text-body-sm text-text-subtle">No deals you can see on this vehicle.</p>
          ) : (
            <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
              {data.deals.map((deal) => (
                <li key={deal.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/admin/sales/${deal.id}`} className="text-text-primary hover:text-primary-text font-medium">
                      {deal.deal_number}
                    </Link>
                    <p className="text-caption text-text-subtle truncate">
                      {deal.customer_name} · {deal.owner_name ?? "Unassigned"} · {formatDay(deal.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-body-sm text-text-primary tabular-nums">
                      {formatMoney(deal.agreed_price ?? deal.proposed_price, deal.currency)}
                    </span>
                    <SalesStatusBadge status={deal.status} size="sm" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      )}

      {canViewReservations && (
        <motion.section {...fadeUp(2)} aria-label="Reservations" className="surface-card flex flex-col gap-4 p-5">
          <p className="text-label">Reservations on this vehicle</p>
          {data.reservations === null ? (
            <ListFailed what="reservations" />
          ) : data.reservations.length === 0 ? (
            <p className="text-body-sm text-text-subtle">No reservations on this vehicle.</p>
          ) : (
            <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
              {data.reservations.map((reservation) => (
                <li
                  key={reservation.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/reservations/${reservation.id}`}
                      className="text-text-primary hover:text-primary-text font-medium"
                    >
                      {reservation.reservation_number}
                    </Link>
                    <p className="text-caption text-text-subtle truncate">
                      {reservation.customer_name} · requested {formatDay(reservation.requested_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <SalesExpiryChip expiresAt={reservation.expires_at} reservationStatus={reservation.status} />
                    <ReservationStatusBadge status={effectiveReservationStatus(reservation)} size="sm" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      )}
    </div>
  );
}