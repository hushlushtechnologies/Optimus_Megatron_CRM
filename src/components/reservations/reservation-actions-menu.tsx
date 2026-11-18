"use client";

import Link from "next/link";
import {
  Ban,
  CalendarPlus,
  Eye,
  Handshake,
  MoreVertical,
  RotateCcw,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Dropdown, DropdownContent, DropdownTrigger } from "@/src/components/ui/dropdown";
import { IconButton } from "@/src/components/ui/icon-button";
import { RESERVATION_ACTION_META, availableReservationActions } from "@/src/lib/utils/reservation-actions";
import type { ReservationActionKind, ReservationListRow } from "@/src/lib/types/reservations";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";
import { cn } from "@/src/lib/utils/cn";

export const RESERVATION_ACTION_ICON: Record<ReservationActionKind, LucideIcon> = {
  convert: Handshake,
  confirm: ShieldCheck,
  extend: CalendarPlus,
  reject: XCircle,
  cancel: Ban,
  release: RotateCcw,
};

interface ReservationActionsMenuProps {
  row: ReservationListRow;
  permissions: SalesPermissions;
  currentUserId: string;
  onAction: (kind: ReservationActionKind, row: ReservationListRow) => void;
}

export function ReservationActionsMenu({
  row,
  permissions,
  currentUserId,
  onAction,
}: ReservationActionsMenuProps) {
  const actions = availableReservationActions(row, permissions, currentUserId);
  const itemClass =
    "text-body-sm text-text-primary hover:bg-card-hover flex items-center gap-2.5 px-4 py-3 sm:py-2";

  return (
    <Dropdown>
      <DropdownTrigger>
        <IconButton aria-label={`Actions for ${row.reservation_number}`} variant="ghost" size="sm">
          <MoreVertical className="size-4" aria-hidden="true" />
        </IconButton>
      </DropdownTrigger>
      <DropdownContent align="end" className="w-60 py-1">
        <Link href={`/admin/reservations/${row.id}`} role="menuitem" className={itemClass}>
          <Eye className="text-text-muted size-4" aria-hidden="true" />
          View details
        </Link>
        {row.deal_id && (
          <Link href={`/admin/sales/${row.deal_id}`} role="menuitem" className={itemClass}>
            <Handshake className="text-text-muted size-4" aria-hidden="true" />
            View deal
          </Link>
        )}

        {actions.length > 0 && <div role="separator" className="border-border my-1 border-t" />}

        {actions.map((kind) => {
          const meta = RESERVATION_ACTION_META[kind];
          const Icon = RESERVATION_ACTION_ICON[kind];
          return (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => onAction(kind, row)}
              className="text-body-sm hover:bg-card-hover flex w-full items-center gap-2.5 px-4 py-3 text-left sm:py-2"
            >
              <Icon
                className={cn("size-4", meta.destructive ? "text-red-500" : "text-text-muted")}
                aria-hidden="true"
              />
              <span className={meta.destructive ? "text-red-500" : "text-text-primary"}>{meta.label}</span>
            </button>
          );
        })}
      </DropdownContent>
    </Dropdown>
  );
}
