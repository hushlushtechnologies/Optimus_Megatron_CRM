"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { SearchX } from "lucide-react";
import { CustomerAvatar } from "@/src/components/customers/customer-avatar";
import { DataTable } from "@/src/components/shared/data-table/data-table";
import { Pagination } from "@/src/components/shared/pagination";
import { EmptyState } from "@/src/components/shared/empty-state";
import { Button } from "@/src/components/ui/button";
import { SalesExpiryChip } from "@/src/components/sales/sales-expiry-chip";
import {
  ReservationStatusBadge,
  effectiveReservationStatus,
} from "@/src/components/reservations/reservation-status-badge";
import { ReservationActionsMenu } from "@/src/components/reservations/reservation-actions-menu";
import { useReservationActions } from "@/src/components/reservations/use-reservation-actions";
import { useMotion } from "@/src/hooks/use-motion";
import { RESERVATION_SOURCE_LABELS } from "@/src/lib/utils/reservation-params";
import { formatDateTimeFull, formatDay } from "@/src/lib/utils/test-drive-format";
import type { ReservationListRow, ReservationSettings, ReservationTab } from "@/src/lib/types/reservations";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";
import { cn } from "@/src/lib/utils/cn";

interface ReservationsTableProps {
  rows: ReservationListRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  tab: ReservationTab;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  hasActiveQuery: boolean;
  onClearQuery: () => void;
  permissions: SalesPermissions;
  currentUserId: string;
  settings: ReservationSettings | null;
}

const EMPTY_COPY: Record<ReservationTab, { title: string; description: string }> = {
  requests: { title: "No requests waiting", description: "New reservation requests from staff or the website appear here for review." },
  active: { title: "No active holds", description: "A confirmed reservation holds a vehicle for a customer until it expires. They appear here." },
  history: { title: "Nothing in the history yet", description: "Converted, cancelled, released, expired and rejected reservations appear here." },
  all: { title: "No reservations yet", description: "Reservations you create will appear here." },
};

const columnHelper = createColumnHelper<ReservationListRow>();

function HoldCell({ row }: { row: ReservationListRow }) {
  if (row.status === "Confirmed" && row.expires_at) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="whitespace-nowrap" title={formatDateTimeFull(row.expires_at)}>
          {formatDay(row.expires_at)}
        </span>
        <SalesExpiryChip expiresAt={row.expires_at} reservationStatus={row.status} />
      </div>
    );
  }
  if (row.closed_reason) return <span className="text-text-muted line-clamp-2 text-xs">{row.closed_reason}</span>;
  return <span className="text-text-subtle">—</span>;
}

function DealCell({ row }: { row: ReservationListRow }) {
  if (!row.deal_id) return <span className="text-text-subtle">—</span>;
  return (
    <Link href={`/admin/sales/${row.deal_id}`} className="text-text-primary hover:text-primary-text font-medium whitespace-nowrap">
      {row.deal_number ?? "Open deal"}
    </Link>
  );
}

function ReservationCard({
  row,
  index,
  menu,
}: {
  row: ReservationListRow;
  index: number;
  menu: React.ReactNode;
}) {
  const { fadeUp } = useMotion();

  return (
    <motion.li {...fadeUp(index)} className="surface-card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/admin/reservations/${row.id}`} className="text-text-primary block truncate font-medium">
            {row.reservation_number}
          </Link>
          <p className="text-caption text-text-subtle">Requested {formatDay(row.requested_at)}</p>
        </div>
        <div className="flex items-center gap-1">
          <ReservationStatusBadge status={effectiveReservationStatus(row)} size="sm" />
          {menu}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <CustomerAvatar fullName={row.customer_name} photoUrl={row.customer_photo_url} size="sm" />
        <div className="min-w-0">
          <p className="text-text-primary truncate text-sm font-medium">{row.customer_name}</p>
          <p className="text-caption text-text-subtle truncate">{row.customer_number}</p>
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-body-sm text-text-primary truncate">{row.vehicle_title}</p>
        <p className="text-caption text-text-subtle truncate">
          {row.stock_id} · {row.location_name}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-text-subtle truncate">
          Owner: <span className="text-text-muted">{row.owner_name ?? "Unassigned"}</span>
        </p>
        <SalesExpiryChip expiresAt={row.expires_at} reservationStatus={row.status} />
      </div>
    </motion.li>
  );
}

export function ReservationsTable({
  rows,
  totalCount,
  page,
  pageSize,
  tab,
  onPageChange,
  onPageSizeChange,
  hasActiveQuery,
  onClearQuery,
  permissions,
  currentUserId,
  settings,
}: ReservationsTableProps) {
  const actions = useReservationActions(settings);

  const menuFor = (row: ReservationListRow) => (
    <ReservationActionsMenu
      row={row}
      permissions={permissions}
      currentUserId={currentUserId}
      onAction={(kind, target) => actions.request(kind, target)}
    />
  );

  const columns = [
    columnHelper.display({
      id: "reservation",
      header: "Reservation",
      enableSorting: false,
      size: 160,
      cell: ({ row }) => (
        <div>
          <Link
            href={`/admin/reservations/${row.original.id}`}
            className="text-text-primary hover:text-primary-text font-medium whitespace-nowrap"
          >
            {row.original.reservation_number}
          </Link>
          <p className="text-caption text-text-subtle">Requested {formatDay(row.original.requested_at)}</p>
        </div>
      ),
    }),
    columnHelper.display({
      id: "customer",
      header: "Customer",
      enableSorting: false,
      size: 230,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <CustomerAvatar fullName={row.original.customer_name} photoUrl={row.original.customer_photo_url} size="sm" />
          <div className="min-w-0">
            <Link
              href={`/admin/customers/${row.original.customer_id}`}
              className="text-text-primary hover:text-primary-text block truncate font-medium"
            >
              {row.original.customer_name}
            </Link>
            <p className="text-caption text-text-subtle truncate">{row.original.customer_number}</p>
          </div>
        </div>
      ),
    }),
    columnHelper.display({
      id: "vehicle",
      header: "Vehicle",
      enableSorting: false,
      size: 230,
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link
            href={`/admin/inventory/${row.original.car_id}`}
            className="text-text-primary hover:text-primary-text block truncate font-medium"
          >
            {row.original.vehicle_title}
          </Link>
          <p className="text-caption text-text-subtle truncate">
            {row.original.stock_id} · {row.original.location_name}
          </p>
        </div>
      ),
    }),
    columnHelper.display({
      id: "status",
      header: "Status",
      enableSorting: false,
      size: 140,
      cell: ({ row }) => <ReservationStatusBadge status={effectiveReservationStatus(row.original)} size="sm" />,
    }),
    columnHelper.display({
      id: "hold",
      header: "Held until",
      enableSorting: false,
      size: 170,
      cell: ({ row }) => <HoldCell row={row.original} />,
    }),
    columnHelper.display({
      id: "owner",
      header: "Owner",
      enableSorting: false,
      size: 150,
      cell: ({ row }) =>
        row.original.owner_name ? (
          <span className="truncate">{row.original.owner_name}</span>
        ) : (
          <span className="text-text-subtle">Unassigned</span>
        ),
    }),
    columnHelper.display({
      id: "source",
      header: "Source",
      enableSorting: false,
      size: 110,
      cell: ({ row }) => RESERVATION_SOURCE_LABELS[row.original.source],
    }),
    columnHelper.display({
      id: "deal",
      header: "Deal",
      enableSorting: false,
      size: 140,
      cell: ({ row }) => <DealCell row={row.original} />,
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      size: 56,
      enableSorting: false,
      enableResizing: false,
      cell: ({ row }) => menuFor(row.original),
    }),
  ] as ColumnDef<ReservationListRow, unknown>[];

  if (rows.length === 0 && hasActiveQuery) {
    return (
      <div role="status" className="surface-card flex flex-col items-center gap-4 px-6 py-12 text-center">
        <SearchX className="text-text-subtle size-8" aria-hidden="true" />
        <div>
          <p className="text-body text-text-primary font-medium">No reservations match your search</p>
          <p className="text-body-sm text-text-muted mt-1">Try different words, or remove some of the filters.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClearQuery}>
          Clear search and filters
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    const copy = EMPTY_COPY[tab];
    return (
      <div className="surface-card">
        <EmptyState
          icon="Inbox"
          title={copy.title}
          description={copy.description}
          action={
            tab === "all" && permissions.reservationsRequest
              ? { label: "New Reservation", href: "/admin/reservations/new" }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          enableColumnResizing
          ariaLabel="Reservations table"
        />
      </div>

      <ul className={cn("flex flex-col gap-3 md:hidden")} aria-label="Reservations">
        {rows.map((row, index) => (
          <ReservationCard key={row.id} row={row} index={index} menu={menuFor(row)} />
        ))}
      </ul>

      <Pagination
        page={page}
        pageSize={pageSize}
        totalItems={totalCount}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        itemLabel={{ singular: "reservation", plural: "reservations" }}
      />

      {actions.dialogs}
    </div>
  );
}