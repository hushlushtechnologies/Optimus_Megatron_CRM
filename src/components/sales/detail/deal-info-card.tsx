"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { SalesExpiryChip } from "@/src/components/sales/sales-expiry-chip";
import { useMotion } from "@/src/hooks/use-motion";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type { DealReservation, SalesDealDetail } from "@/src/lib/types/sales-detail";

interface DealInfoCardProps {
  deal: SalesDealDetail;
  reservation: DealReservation | null;
  assignedBy: { name: string | null; at: string } | null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-caption text-text-subtle shrink-0">{label}</dt>
      <dd className="text-body-sm text-text-primary min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

export function DealInfoCard({ deal, reservation, assignedBy }: DealInfoCardProps) {
  const { fadeUp } = useMotion();

  const milestones = [
    { label: "Reserved", at: deal.reserved_at },
    { label: "Confirmed", at: deal.confirmed_at },
    { label: "Delivered", at: deal.delivered_at },
    { label: "Completed", at: deal.completed_at },
    { label: "Cancelled", at: deal.cancelled_at },
  ].filter((item): item is { label: string; at: string } => !!item.at);

  return (
    <motion.section
      {...fadeUp(3)}
      aria-label="Deal information"
      className="surface-card flex flex-col gap-2 p-5"
    >
      <p className="text-label">Deal information</p>

      <dl className="divide-border divide-y">
        <Row label="Sales executive">
          {deal.owner_name ?? <span className="text-text-subtle">Unassigned</span>}
          {deal.owner_name && assignedBy && (
            <span className="text-caption text-text-subtle block">
              Assigned {assignedBy.name ? `by ${assignedBy.name} ` : ""}on {formatDateTimeFull(assignedBy.at)}
            </span>
          )}
        </Row>
        <Row label="Showroom">{deal.location_name}</Row>
        <Row label="Lead">
          {deal.lead_id ? (
            <Link
              href={`/admin/leads/${deal.lead_id}`}
              className="text-primary-text hover:text-primary-hover"
            >
              {deal.lead_number}
            </Link>
          ) : (
            <span className="text-text-subtle">None linked</span>
          )}
        </Row>
        <Row label="Reservation">
          {reservation ? (
            <>
              {reservation.reservation_number}
              <span className="text-caption text-text-subtle block">
                {reservation.status}
                {reservation.confirmed_by_name ? ` · confirmed by ${reservation.confirmed_by_name}` : ""}
              </span>
              {reservation.status === "Confirmed" && (
                <span className="mt-1 inline-block">
                  <SalesExpiryChip
                    expiresAt={reservation.expires_at}
                    reservationStatus={reservation.status}
                  />
                </span>
              )}
              {reservation.closed_reason && (
                <span className="text-caption text-text-subtle block">{reservation.closed_reason}</span>
              )}
            </>
          ) : (
            <span className="text-text-subtle">None</span>
          )}
        </Row>
        <Row label="Created">
          {formatDateTimeFull(deal.created_at)}
          {deal.created_by_name && (
            <span className="text-caption text-text-subtle block">by {deal.created_by_name}</span>
          )}
        </Row>
        {milestones.map((item) => (
          <Row key={item.label} label={item.label}>
            {formatDateTimeFull(item.at)}
          </Row>
        ))}
      </dl>
    </motion.section>
  );
}

export function DealNotesCard({ notes }: { notes: string | null }) {
  const { fadeUp } = useMotion();

  return (
    <motion.section {...fadeUp(4)} aria-label="Notes" className="surface-card flex flex-col gap-3 p-5">
      <p className="text-label">Notes</p>
      {notes ? (
        <p className="text-body-sm text-text-primary whitespace-pre-wrap">{notes}</p>
      ) : (
        <p className="text-body-sm text-text-subtle">No notes on this deal.</p>
      )}
    </motion.section>
  );
}
