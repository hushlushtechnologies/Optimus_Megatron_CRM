"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft, Phone } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { CustomerAvatar } from "@/src/components/customers/customer-avatar";
import { SalesExpiryChip } from "@/src/components/sales/sales-expiry-chip";
import { DealTimeline } from "@/src/components/sales/detail/deal-timeline";
import {
  RESERVATION_STATUS_META,
  ReservationStatusBadge,
  effectiveReservationStatus,
} from "@/src/components/reservations/reservation-status-badge";
import { RESERVATION_ACTION_ICON } from "@/src/components/reservations/reservation-actions-menu";
import { useReservationActions } from "@/src/components/reservations/use-reservation-actions";
import { useMotion } from "@/src/hooks/use-motion";
import { RESERVATION_ACTION_META, availableReservationActions } from "@/src/lib/utils/reservation-actions";
import { RESERVATION_SOURCE_LABELS } from "@/src/lib/utils/reservation-params";
import { requiredReservationDeposit } from "@/src/lib/utils/reservation-format";
import { formatFils } from "@/src/lib/utils/sales-money";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type { ReservationDetailData } from "@/src/lib/types/reservations";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";
import { PaymentsPanel } from "@/src/components/sales/payments/payments-panel";
import { RESERVATION_PAYMENT_KINDS } from "@/src/lib/utils/sales-payments";
import { toFils } from "@/src/lib/utils/sales-money";
import type { DealPayment } from "@/src/lib/types/sales-detail";
import { DocumentsPanel } from "@/src/components/sales/documents/documents-panel";
import { reservationDocumentOptions } from "@/src/lib/utils/sales-documents";
import type { SalesDocumentItem } from "@/src/lib/types/sales-documents";

interface ReservationDetailClientProps {
  data: ReservationDetailData;
  permissions: SalesPermissions;
  currentUserId: string;
  payments: DealPayment[] | null;
  separateVerifier: boolean | null;
  documents: SalesDocumentItem[] | null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-caption text-text-subtle shrink-0">{label}</dt>
      <dd className="text-body-sm text-text-primary min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

export function ReservationDetailClient({
  data,
  permissions,
  currentUserId,
  payments,
  separateVerifier,
  documents,
}: ReservationDetailClientProps) {
  const { reservation: r, timeline, settings } = data;
  const { fadeUp } = useMotion();
  const actions = useReservationActions(settings);

  const effective = effectiveReservationStatus(r);
  const available = availableReservationActions(r, permissions, currentUserId);
  const deposit = requiredReservationDeposit(settings, r.listed_price);
  const heldDeposit = toFils(r.deposit_verified) ?? BigInt(0);
  const endedWithMoney =
    !["Requested", "Confirmed", "Converted"].includes(r.status) && heldDeposit > BigInt(0);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/reservations"
        className="text-body-sm text-text-muted hover:text-text-primary focus-visible:ring-primary inline-flex min-h-11 items-center gap-1.5 self-start rounded focus-visible:ring-2 focus-visible:outline-none sm:min-h-0"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Reservations
      </Link>

      <motion.header {...fadeUp(0)} className="surface-card overflow-hidden">
        <div className="bg-gradient-primary h-1" />
        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-h2 break-all">{r.reservation_number}</h1>
                <ReservationStatusBadge status={effective} />
                <SalesExpiryChip expiresAt={r.expires_at} reservationStatus={r.status} />
              </div>
              <p className="text-body-sm text-text-muted mt-1.5">
                {r.vehicle_title} for {r.customer_name}
              </p>
              <p className="text-caption text-text-subtle mt-0.5">
                {RESERVATION_STATUS_META[effective].description}
              </p>
            </div>

            {r.status === "Confirmed" && r.expires_at && (
              <div className="lg:text-right">
                <p className="text-caption text-text-subtle">
                  {r.is_live ? "Held until" : "Held until (ended)"}
                </p>
                <p className="text-text-primary text-lg font-semibold tabular-nums">
                  {formatDateTimeFull(r.expires_at)}
                </p>
              </div>
            )}
          </div>

          {available.length > 0 && (
            <div className="border-border flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap">
              {available.map((kind) => {
                const meta = RESERVATION_ACTION_META[kind];
                const Icon = RESERVATION_ACTION_ICON[kind];
                return (
                  <Button
                    key={kind}
                    variant={
                      kind === "convert" || kind === "confirm"
                        ? "gradient"
                        : meta.destructive
                          ? "destructive"
                          : "outline"
                    }
                    className="h-11 sm:h-10"
                    leftIcon={<Icon className="size-4" aria-hidden="true" />}
                    onClick={() => actions.request(kind, r)}
                  >
                    {meta.label}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </motion.header>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <motion.section
              {...fadeUp(1)}
              aria-label="Customer"
              className="surface-card flex flex-col gap-4 p-5"
            >
              <p className="text-label">Customer</p>
              <div className="flex items-center gap-3">
                <CustomerAvatar fullName={r.customer_name} photoUrl={r.customer_photo_url} size="md" />
                <div className="min-w-0">
                  <Link
                    href={`/admin/customers/${r.customer_id}`}
                    className="text-text-primary hover:text-primary-text block truncate font-medium"
                  >
                    {r.customer_name}
                  </Link>
                  <p className="text-caption text-text-subtle truncate">{r.customer_number}</p>
                </div>
              </div>
              {r.customer_phone && (
                <a
                  href={`tel:${r.customer_phone}`}
                  className="text-body-sm text-text-muted hover:text-text-primary inline-flex min-h-11 items-center gap-2 self-start sm:min-h-0"
                >
                  <Phone className="size-4" aria-hidden="true" />
                  {r.customer_phone}
                </a>
              )}
            </motion.section>

            <motion.section
              {...fadeUp(2)}
              aria-label="Vehicle"
              className="surface-card flex flex-col gap-3 p-5"
            >
              <p className="text-label">Vehicle</p>
              <div className="min-w-0">
                <Link
                  href={`/admin/inventory/${r.car_id}`}
                  className="text-text-primary hover:text-primary-text block font-medium"
                >
                  {r.vehicle_title}
                </Link>
                <p className="text-caption text-text-subtle">
                  {r.stock_id}
                  {r.brand_name ? ` · ${r.brand_name}` : ""}
                </p>
              </div>
              <p className="text-body-sm text-text-muted">Collect at {r.location_name}</p>
              {deposit !== null && (
                <p className="border-border bg-card-hover/40 text-body-sm text-text-primary rounded-md border px-3 py-2">
                  Deposit your settings require:{" "}
                  <span className="font-semibold tabular-nums">{formatFils(deposit, settings.currency)}</span>
                </p>
              )}
            </motion.section>
          </div>

          {endedWithMoney && (
            <p
              role="status"
              className="text-body-sm text-text-primary rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
            >
              This reservation ended, but a verified deposit of {formatFils(heldDeposit, settings.currency)}{" "}
              is still held on it. Record a refund below, or move the deposit by agreeing it with the
              customer.
            </p>
          )}

          {r.deposit_waived && (
            <p
              role="status"
              className="border-border bg-card-hover/40 text-body-sm text-text-primary rounded-md border px-3 py-2.5"
            >
              The deposit was waived when this reservation was confirmed. The reason is in the activity below.
            </p>
          )}

          <PaymentsPanel
            dealId={null}
            reservationId={r.id}
            payments={payments}
            currency={settings.currency}
            permissions={permissions}
            currentUserId={currentUserId}
            separateVerifier={separateVerifier}
            acceptsPayments={r.status === "Requested" || r.status === "Confirmed"}
            kinds={RESERVATION_PAYMENT_KINDS}
            expected={deposit}
            expectedLabel="Take the deposit"
            intro="Deposits taken to hold the vehicle. When the reservation becomes a deal, the deposit moves onto the deal."
          />

          <DocumentsPanel
            documents={documents}
            dealId={null}
            reservationId={r.id}
            options={reservationDocumentOptions(r, documents)}
            canIssue={permissions.documents}
            canVoid={permissions.cancel}
            intro="A confirmation for the customer once the vehicle is held. Receipts for deposits are created from the payments above."
          />

          <motion.section {...fadeUp(3)} aria-label="Notes" className="surface-card flex flex-col gap-3 p-5">
            <p className="text-label">Notes</p>
            {r.notes ? (
              <p className="text-body-sm text-text-primary whitespace-pre-wrap">{r.notes}</p>
            ) : (
              <p className="text-body-sm text-text-subtle">No notes on this reservation.</p>
            )}
          </motion.section>

          <motion.section
            {...fadeUp(4)}
            aria-label="Activity"
            className="surface-card flex flex-col gap-4 p-5"
          >
            <p className="text-label">Activity</p>
            {timeline === null ? (
              <p
                role="alert"
                className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
              >
                The activity couldn&apos;t be loaded. Refresh the page to try again.
              </p>
            ) : (
              <DealTimeline entries={timeline} />
            )}
          </motion.section>
        </div>

        <motion.section
          {...fadeUp(2)}
          aria-label="Reservation details"
          className="surface-card flex flex-col gap-2 p-5"
        >
          <p className="text-label">Details</p>
          <dl className="divide-border divide-y">
            <Row label="Owner">{r.owner_name ?? <span className="text-text-subtle">Unassigned</span>}</Row>
            <Row label="Source">{RESERVATION_SOURCE_LABELS[r.source]}</Row>
            <Row label="Requested">
              {formatDateTimeFull(r.requested_at)}
              {r.requested_by_name && (
                <span className="text-caption text-text-subtle block">by {r.requested_by_name}</span>
              )}
            </Row>
            {r.confirmed_at && (
              <Row label="Confirmed">
                {formatDateTimeFull(r.confirmed_at)}
                {r.confirmed_by_name && (
                  <span className="text-caption text-text-subtle block">by {r.confirmed_by_name}</span>
                )}
              </Row>
            )}
            {r.starts_at && r.expires_at && (
              <Row label="Hold period">
                {formatDateTimeFull(r.starts_at)}
                <span className="text-caption text-text-subtle block">
                  to {formatDateTimeFull(r.expires_at)}
                </span>
              </Row>
            )}
            {r.closed_at && <Row label="Ended">{formatDateTimeFull(r.closed_at)}</Row>}
            {r.closed_reason && <Row label="Reason">{r.closed_reason}</Row>}
            <Row label="Lead">
              {r.lead_id ? (
                <Link
                  href={`/admin/leads/${r.lead_id}`}
                  className="text-primary-text hover:text-primary-hover"
                >
                  {r.lead_number}
                </Link>
              ) : (
                <span className="text-text-subtle">None linked</span>
              )}
            </Row>
            <Row label="Deal">
              {r.deal_id ? (
                <Link
                  href={`/admin/sales/${r.deal_id}`}
                  className="text-primary-text hover:text-primary-hover"
                >
                  {r.deal_number ?? "Open deal"}
                </Link>
              ) : (
                <span className="text-text-subtle">None yet</span>
              )}
            </Row>
          </dl>
        </motion.section>
      </div>

      {actions.dialogs}
    </div>
  );
}
