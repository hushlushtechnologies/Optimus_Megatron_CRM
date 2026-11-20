"use client";

import { Car, Clock, Mail, ShieldAlert, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

import { EnquiryStatusBadge } from "@/src/components/enquiries/enquiry-status-badge";
import { Button } from "@/src/components/ui/button";
import { useMotion } from "@/src/hooks/use-motion";
import type { EnquiryListRow } from "@/src/lib/types/enquiry";
import { cn } from "@/src/lib/utils/cn";
import { enquiryContactLine, enquiryVehicleLabel, isStale, waitingFor } from "@/src/lib/utils/enquiry-format";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";

export type EnquiryQuickAction = "claim" | "spam";

interface EnquiryCardProps {
  enquiry: EnquiryListRow;
  index: number;
  currentUserId: string;
  canManage: boolean;
  /** True while a quick action on this row is in flight. */
  isBusy: boolean;
  onQuickAction: (enquiry: EnquiryListRow, action: EnquiryQuickAction) => void;
}

/**
 * One enquiry in the list.
 *
 * Built to be read down a column of forty: who got in touch, how to reach
 * them, what about, and how long they have been waiting. The message is
 * clamped to two lines — enough to tell a sales enquiry from a complaint
 * without the row growing to fit whatever somebody typed.
 */
export function EnquiryCard({
  enquiry,
  index,
  currentUserId,
  canManage,
  isBusy,
  onQuickAction,
}: EnquiryCardProps) {
  const { fadeUp } = useMotion();

  const vehicle = enquiryVehicleLabel(enquiry);
  const stale = isStale(enquiry);
  const mine = enquiry.assigned_to === currentUserId;

  const open = enquiry.status === "New" || enquiry.status === "In Review";

  return (
    <motion.li {...fadeUp(index)} className="flex flex-col gap-3 px-4 py-4">
      {/* ---- Top line ---- */}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Link
              href={`/admin/enquiries/${enquiry.id}`}
              className="text-body text-text-primary hover:text-primary-text focus-visible:ring-primary rounded font-semibold focus-visible:ring-2 focus-visible:outline-none"
            >
              {enquiry.full_name}
            </Link>

            <span className="text-caption text-text-subtle tabular-nums">{enquiry.enquiry_number}</span>

            <EnquiryStatusBadge status={enquiry.status} />
          </div>

          <p className="text-body-sm text-text-muted mt-1 break-words">{enquiryContactLine(enquiry)}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              "text-caption inline-flex items-center gap-1.5 tabular-nums",
              stale ? "text-amber-400" : "text-text-subtle",
            )}
            title={formatDateTimeFull(enquiry.created_at)}
          >
            <Clock className="size-3.5" aria-hidden="true" />
            {waitingFor(enquiry.created_at)}
            {stale && <span className="sr-only">— waiting more than a day</span>}
          </span>

          <span className="text-caption text-text-subtle">
            {enquiry.enquiry_type} · {enquiry.source}
          </span>
        </div>
      </div>

      {/* ---- Vehicle ---- */}

      {vehicle && (
        <p className="text-body-sm text-text-muted flex items-start gap-1.5">
          <Car className="text-text-subtle mt-0.5 size-4 shrink-0" aria-hidden="true" />

          {enquiry.car_id ? (
            <Link
              href={`/admin/inventory/${enquiry.car_id}`}
              className="text-primary-text hover:text-primary-hover"
            >
              {vehicle}
            </Link>
          ) : (
            <span>{vehicle}</span>
          )}
        </p>
      )}

      {/* ---- Message ---- */}

      {enquiry.message && (
        <p className="text-body-sm text-text-muted line-clamp-2 break-words">{enquiry.message}</p>
      )}

      {/* ---- Footer ---- */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-caption text-text-subtle flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            {enquiry.assigned_to_name
              ? `With ${mine ? "you" : enquiry.assigned_to_name}`
              : "Nobody has picked this up"}
          </span>

          {enquiry.customer_id && enquiry.customer_name && (
            <Link
              href={`/admin/customers/${enquiry.customer_id}`}
              className="text-primary-text hover:text-primary-hover"
            >
              {enquiry.customer_name}
            </Link>
          )}

          {enquiry.lead_id && enquiry.lead_number && (
            <Link
              href={`/admin/leads/${enquiry.lead_id}`}
              className="text-primary-text hover:text-primary-hover"
            >
              {enquiry.lead_number}
            </Link>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {canManage && open && !enquiry.assigned_to && (
            <Button
              size="sm"
              variant="secondary"
              className="h-11 sm:h-9"
              disabled={isBusy}
              onClick={() => onQuickAction(enquiry, "claim")}
              leftIcon={<UserPlus className="size-4" aria-hidden="true" />}
            >
              Take it on
            </Button>
          )}

          {canManage && open && (
            <Button
              size="sm"
              variant="ghost"
              className="h-11 sm:h-9"
              disabled={isBusy}
              onClick={() => onQuickAction(enquiry, "spam")}
              leftIcon={<ShieldAlert className="size-4" aria-hidden="true" />}
            >
              Spam
            </Button>
          )}

          {/*
            A Link rather than a Button: Button always renders a <button>, and
            a navigation that can't be opened in a new tab or copied is a
            navigation people quietly resent.
          */}
          <Link href={`/admin/enquiries/${enquiry.id}`}>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Mail className="size-4" aria-hidden="true" />}
            >
              Open
            </Button>
          </Link>
        </div>
      </div>
    </motion.li>
  );
}
