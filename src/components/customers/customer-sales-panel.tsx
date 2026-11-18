"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft, Handshake, Tag } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { CustomerAvatar } from "@/src/components/customers/customer-avatar";
import { SalesStatusBadge } from "@/src/components/sales/sales-status-badge";
import { SalesExpiryChip } from "@/src/components/sales/sales-expiry-chip";
import { PaymentStatusChip } from "@/src/components/sales/payments/payment-status-chip";
import {
  ReservationStatusBadge,
  effectiveReservationStatus,
} from "@/src/components/reservations/reservation-status-badge";
import { useMotion } from "@/src/hooks/use-motion";
import { formatFils, toFils } from "@/src/lib/utils/sales-money";
import { formatDay } from "@/src/lib/utils/test-drive-format";
import type { CustomerSalesData } from "@/src/lib/types/customer-sales";
import type { TestDriveCustomerOption } from "@/src/lib/types/test-drive";

interface CustomerSalesPanelProps {
  customer: TestDriveCustomerOption;
  data: CustomerSalesData;
  showDeals: boolean;
  showReservations: boolean;
  canCreateDeal: boolean;
  canRequestReservation: boolean;
}

function Tile({ label, value, hint, index }: { label: string; value: string; hint: string; index: number }) {
  const { fadeUp } = useMotion();
  return (
    <motion.div {...fadeUp(index)} className="surface-card flex flex-col gap-1 p-4">
      <p className="text-caption text-text-subtle">{label}</p>
      <p className="text-text-primary text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-caption text-text-subtle">{hint}</p>
    </motion.div>
  );
}

function LoadFailed({ what }: { what: string }) {
  return (
    <p
      role="alert"
      className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
    >
      The {what} couldn&apos;t be loaded. Refresh the page to try again.
    </p>
  );
}

export function CustomerSalesPanel({
  customer,
  data,
  showDeals,
  showReservations,
  canCreateDeal,
  canRequestReservation,
}: CustomerSalesPanelProps) {
  const { fadeUp } = useMotion();
  const { summary, deals, reservations, payments } = data;
  const currency = summary?.currency || deals?.[0]?.currency || "";
  const money = (value: number | null) => (value === null ? "—" : formatFils(toFils(value), currency));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/admin/customers/${customer.id}`}
        className="text-body-sm text-text-muted hover:text-text-primary focus-visible:ring-primary inline-flex min-h-11 items-center gap-1.5 self-start rounded focus-visible:ring-2 focus-visible:outline-none sm:min-h-0"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {customer.full_name}
      </Link>

      <Link href={`/admin/customers/${customer.id}/sales`}>Sales</Link>

      <motion.header
        {...fadeUp(0)}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <CustomerAvatar fullName={customer.full_name} photoUrl={customer.photo_url} size="md" />
          <div className="min-w-0">
            <h1 className="text-h3 truncate">Sales for {customer.full_name}</h1>
            <p className="text-caption text-text-subtle">{customer.customer_number}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreateDeal && (
            <Link href={`/admin/sales/new?customerId=${customer.id}`}>
              <Button
                size="sm"
                variant="gradient"
                leftIcon={<Handshake className="size-4" aria-hidden="true" />}
              >
                New deal
              </Button>
            </Link>
          )}
          {canRequestReservation && (
            <Link href={`/admin/reservations/new?customerId=${customer.id}`}>
              <Button size="sm" variant="secondary" leftIcon={<Tag className="size-4" aria-hidden="true" />}>
                New reservation
              </Button>
            </Link>
          )}
        </div>
      </motion.header>

      {summary === null ? (
        <LoadFailed what="totals" />
      ) : (
        <section aria-label="Sales totals" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {showDeals && (
            <>
              <Tile
                index={0}
                label="Open deals"
                value={String(summary.openDeals)}
                hint={`${summary.completedDeals} completed`}
              />
              <Tile
                index={1}
                label="Total purchased"
                value={money(summary.purchasedTotal)}
                hint="Completed deals"
              />
              <Tile
                index={2}
                label="Still to collect"
                value={money(summary.balanceOpen)}
                hint="Confirmed deals"
              />
            </>
          )}
          {showReservations && (
            <Tile
              index={3}
              label="Active holds"
              value={String(summary.activeReservations)}
              hint="Vehicles held for them"
            />
          )}
        </section>
      )}

      <p className="text-caption text-text-subtle -mt-3">
        Totals and lists cover what your role can see. Someone who only sees their own deals will see only
        those.
      </p>

      {showDeals && (
        <motion.section {...fadeUp(1)} aria-label="Deals" className="surface-card flex flex-col gap-4 p-5">
          <p className="text-label">Deals</p>
          {deals === null ? (
            <LoadFailed what="deals" />
          ) : deals.length === 0 ? (
            <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-8 text-center">
              No deals you can see for this customer.
            </p>
          ) : (
            <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
              {deals.map((deal) => (
                <li
                  key={deal.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/sales/${deal.id}`}
                      className="text-text-primary hover:text-primary-text font-medium"
                    >
                      {deal.deal_number}
                    </Link>
                    <p className="text-caption text-text-subtle truncate">
                      {deal.vehicle_title} · {deal.owner_name ?? "Unassigned"} · {formatDay(deal.created_at)}
                    </p>
                    {deal.status === "Confirmed" && deal.balance_due !== null && deal.balance_due > 0 && (
                      <p className="text-caption text-amber-500">Balance due {money(deal.balance_due)}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-body-sm text-text-primary tabular-nums">
                      {money(deal.total_due ?? deal.agreed_price ?? deal.proposed_price)}
                    </span>
                    <SalesStatusBadge status={deal.status} size="sm" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      )}

      {showReservations && (
        <motion.section
          {...fadeUp(2)}
          aria-label="Reservations"
          className="surface-card flex flex-col gap-4 p-5"
        >
          <p className="text-label">Reservations</p>
          {reservations === null ? (
            <LoadFailed what="reservations" />
          ) : reservations.length === 0 ? (
            <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-8 text-center">
              No reservations for this customer.
            </p>
          ) : (
            <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
              {reservations.map((reservation) => (
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
                      {reservation.vehicle_title} · requested {formatDay(reservation.requested_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <SalesExpiryChip
                      expiresAt={reservation.expires_at}
                      reservationStatus={reservation.status}
                    />
                    <ReservationStatusBadge status={effectiveReservationStatus(reservation)} size="sm" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      )}

      {(showDeals || showReservations) && (
        <motion.section
          {...fadeUp(3)}
          aria-label="Recent payments"
          className="surface-card flex flex-col gap-4 p-5"
        >
          <p className="text-label">Recent payments</p>
          {payments === null ? (
            <LoadFailed what="payments" />
          ) : payments.length === 0 ? (
            <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-8 text-center">
              No payments recorded for this customer.
            </p>
          ) : (
            <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-body-sm text-text-primary font-medium">
                      {payment.kind}
                      <span className="text-text-subtle font-normal"> · {payment.method}</span>
                    </p>
                    <p className="text-caption text-text-subtle">
                      Paid {formatDay(payment.paid_on)} ·{" "}
                      {payment.deal_id && payment.deal_number ? (
                        <Link
                          href={`/admin/sales/${payment.deal_id}`}
                          className="text-primary-text hover:text-primary-hover"
                        >
                          {payment.deal_number}
                        </Link>
                      ) : payment.reservation_id && payment.reservation_number ? (
                        <Link
                          href={`/admin/reservations/${payment.reservation_id}`}
                          className="text-primary-text hover:text-primary-hover"
                        >
                          {payment.reservation_number}
                        </Link>
                      ) : (
                        "No deal"
                      )}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-body-sm text-text-primary whitespace-nowrap tabular-nums">
                      {payment.direction === "out" ? "− " : ""}
                      {formatFils(toFils(payment.amount), payment.currency)}
                    </span>
                    <PaymentStatusChip status={payment.status} />
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
