"use client";

import Link from "next/link";
import { ArrowUpRight, Handshake } from "lucide-react";

import { SalesStatusBadge } from "@/src/components/sales/sales-status-badge";
import { formatDay } from "@/src/lib/utils/test-drive-format";
import type { TestDriveDealResult } from "@/src/lib/supabase/test-drive-sales-queries";
import type { TestDriveStatus } from "@/src/lib/types/test-drive";

interface TestDriveSalesCardProps {
  testDriveId: string;
  status: TestDriveStatus;
  isArchived: boolean;
  /** True once the customer has arrived, which makes a deal sensible before completion. */
  isCheckedIn: boolean;
  vehicleIsSold: boolean;
  canCreateDeal: boolean;
  result: TestDriveDealResult;
}

/**
 * The sales step on a test drive, in the detail page's right rail.
 *
 * Creating a deal is not a status change, so it deliberately stays out of the
 * header's action list. The card shows one of three honest states: the deal
 * that exists, the action to create one, or why it isn't available.
 */
export function TestDriveSalesCard({
  testDriveId,
  status,
  isArchived,
  isCheckedIn,
  vehicleIsSold,
  canCreateDeal,
  result,
}: TestDriveSalesCardProps) {
  /*
   * A deal makes sense once the drive has actually happened, or the customer
   * is standing in the showroom. Before that it is premature.
   */
  const driveIsReady = status === "Completed" || isCheckedIn;

  const blockedReason = isArchived
    ? "This test drive is archived."
    : !canCreateDeal
      ? "You don't have permission to create deals."
      : vehicleIsSold
        ? "This vehicle is already sold."
        : !driveIsReady
          ? "Available once the customer has arrived or the drive is complete."
          : null;

  return (
    <section aria-label="Sales" className="surface-card p-5">
      <p className="text-label mb-3">Sales</p>

      {result.status === "error" ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          The linked deal couldn&apos;t be loaded. Refresh the page to try again.
        </p>
      ) : result.deal ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={`/admin/sales/${result.deal.id}`}
              className="text-body-sm text-text-primary hover:text-primary-text focus-visible:ring-primary inline-flex items-center gap-1.5 rounded font-medium focus-visible:ring-2 focus-visible:outline-none"
            >
              {result.deal.deal_number}
              <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
            </Link>

            <SalesStatusBadge status={result.deal.status} size="sm" />
          </div>

          <p className="text-caption text-text-subtle">
            {result.deal.vehicle_title} · {result.deal.owner_name?.trim() || "No owner"} · created{" "}
            {formatDay(result.deal.created_at)}
          </p>

          <p className="text-caption text-text-subtle">
            This test drive&apos;s own record is unchanged and kept for the history.
          </p>
        </div>
      ) : blockedReason === null ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-body-sm text-text-muted">
            Turn this drive into a deal. The customer and vehicle carry over, and the deal records that it
            started here.
          </p>

          <Link
            href={`/admin/sales/new?testDriveId=${testDriveId}`}
            className="bg-primary text-body-sm hover:bg-primary-hover focus-visible:ring-primary inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-[#0b1220] transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <Handshake className="size-4" aria-hidden="true" />
            Create deal
          </Link>
        </div>
      ) : (
        <div className="flex items-start gap-2.5">
          <span className="bg-card-hover text-text-subtle flex size-8 shrink-0 items-center justify-center rounded-full">
            <Handshake className="size-4" aria-hidden="true" />
          </span>

          <p className="text-body-sm text-text-muted">{blockedReason}</p>
        </div>
      )}
    </section>
  );
}
