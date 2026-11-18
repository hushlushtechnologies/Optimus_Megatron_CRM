"use client";

import Link from "next/link";
import { ArrowUpRight, BookmarkCheck, Car, MapPin, UserRound } from "lucide-react";

import { SalesStatusBadge } from "@/src/components/sales/sales-status-badge";
import { SalesExpiryChip } from "@/src/components/sales/sales-expiry-chip";
import { formatMoney } from "@/src/lib/utils/sales-format";
import { formatDay } from "@/src/lib/utils/test-drive-format";
import type { LeadDealRow } from "@/src/lib/types/lead-sales";

interface LeadDealCardProps {
  deal: LeadDealRow;
  /** Shown when the person may change lead relationships. */
  onUnlink?: (deal: LeadDealRow) => void;
}

/**
 * One deal on the Lead Detail Sales tab.
 *
 * Mirrors the shape of the customer page's vehicle-deal card so a deal reads
 * the same wherever it appears. It summarises and links; it never duplicates
 * the Sales module's controls.
 */
export function LeadDealCard({ deal, onUnlink }: LeadDealCardProps) {
  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/admin/sales/${deal.id}`}
            className="text-body-sm text-text-primary hover:text-primary-text focus-visible:ring-primary inline-flex items-center gap-1.5 rounded font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            {deal.deal_number}
            <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
          </Link>

          <p className="text-caption text-text-subtle mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex min-w-0 items-center gap-1">
              <Car className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {deal.vehicle_title} · {deal.stock_id}
              </span>
            </span>

            {deal.location_name && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                {deal.location_name}
              </span>
            )}

            <span className="flex items-center gap-1">
              <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
              {deal.owner_name?.trim() || "No owner"}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <SalesExpiryChip
            expiresAt={deal.reservation_expires_at}
            reservationStatus={deal.reservation_status}
          />
          <SalesStatusBadge status={deal.status} size="sm" />
        </div>
      </div>

      {/* Money: only what is settled, never a guess. */}
      <dl className="border-border grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 sm:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-label">Agreed</dt>
          <dd className="text-body-sm text-text-primary truncate tabular-nums">
            {deal.agreed_price === null ? "—" : formatMoney(deal.agreed_price, deal.currency)}
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-label">Total due</dt>
          <dd className="text-body-sm text-text-primary truncate tabular-nums">
            {deal.total_due === null ? "—" : formatMoney(deal.total_due, deal.currency)}
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-label">Paid</dt>
          <dd className="text-body-sm text-text-primary truncate tabular-nums">
            {deal.verified_paid === null ? "—" : formatMoney(deal.verified_paid, deal.currency)}
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-label">Balance</dt>
          <dd className="text-body-sm text-text-primary truncate tabular-nums">
            {deal.balance_due === null ? "—" : formatMoney(deal.balance_due, deal.currency)}
          </dd>
        </div>
      </dl>

      <div className="text-caption text-text-subtle flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Created {formatDay(deal.created_at)}</span>

          {deal.reservation_number && deal.reservation_id && (
            <Link
              href={`/admin/reservations/${deal.reservation_id}`}
              className="text-primary-text hover:text-primary-hover focus-visible:ring-primary inline-flex items-center gap-1 rounded focus-visible:ring-2 focus-visible:outline-none"
            >
              <BookmarkCheck className="size-3.5" aria-hidden="true" />
              {deal.reservation_number}
            </Link>
          )}
        </span>

        {onUnlink && (
          <button
            type="button"
            onClick={() => onUnlink(deal)}
            className="text-text-subtle hover:text-text-primary focus-visible:ring-primary rounded underline decoration-dotted underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            Unlink from this lead
          </button>
        )}
      </div>
    </div>
  );
}