"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { SalesStatusBadge } from "@/src/components/sales/sales-status-badge";
import type { SalesDealStatus } from "@/src/lib/types/sales";
import type { ReportDealRow } from "@/src/lib/types/sales-reports";
import { formatMoney } from "@/src/lib/utils/sales-format";
import { formatDateTimeFull, formatDay } from "@/src/lib/utils/test-drive-format";

/*
|--------------------------------------------------------------------------
| REPORT TABLE COLUMNS
|--------------------------------------------------------------------------
|
| Every row of the summary view, laid out so it can be scanned, sorted and
| traced to the deal behind it.
|
| Sorting is enabled here, unlike the Sales list, because the report table
| holds its rows in memory — so a click sorts instantly with no round trip.
|
| Money is right-aligned and tabular so columns of figures line up and can be
| read down. A null figure shows an em dash, never a zero: "not agreed yet"
| and "agreed at nothing" are different facts.
*/

const columnHelper = createColumnHelper<ReportDealRow>();

/** Right-aligned money cell. Null renders as an em dash, not 0. */
function Money({ value, currency }: { value: number | null; currency: string }) {
  return (
    <span className="block text-right tabular-nums">
      {value === null ? <span className="text-text-subtle">—</span> : formatMoney(value, currency)}
    </span>
  );
}

const MONEY_HEADER = "block text-right";

export function getReportDealColumns(): ColumnDef<ReportDealRow, unknown>[] {
  const columns = [
    columnHelper.accessor("deal_number", {
      id: "deal_number",
      header: "Deal",
      size: 140,
      cell: ({ row }) => (
        <Link
          href={`/admin/sales/${row.original.id}`}
          className="text-text-primary hover:text-primary-text font-medium whitespace-nowrap"
        >
          {row.original.deal_number}
        </Link>
      ),
    }),

    columnHelper.accessor("status", {
      id: "status",
      header: "Status",
      size: 130,
      cell: ({ row }) => <SalesStatusBadge status={row.original.status as SalesDealStatus} size="sm" />,
    }),

    columnHelper.accessor("customer_name", {
      id: "customer",
      header: "Customer",
      size: 200,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-text-primary truncate font-medium">{row.original.customer_name}</p>
          <p className="text-caption text-text-subtle truncate">{row.original.customer_number}</p>
        </div>
      ),
    }),

    columnHelper.accessor("vehicle_title", {
      id: "vehicle",
      header: "Vehicle",
      size: 230,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-text-primary truncate font-medium">{row.original.vehicle_title}</p>
          <p className="text-caption text-text-subtle truncate">{row.original.stock_id}</p>
        </div>
      ),
    }),

    columnHelper.accessor((row) => row.brand_name ?? "", {
      id: "brand",
      header: "Brand",
      size: 130,
      cell: ({ row }) => <span className="text-text-muted truncate">{row.original.brand_name ?? "—"}</span>,
    }),

    columnHelper.accessor((row) => row.location_name ?? "", {
      id: "showroom",
      header: "Showroom",
      size: 150,
      cell: ({ row }) => (
        <span className="text-text-muted truncate">{row.original.location_name ?? "Unassigned"}</span>
      ),
    }),

    columnHelper.accessor((row) => row.owner_name ?? "", {
      id: "owner",
      header: "Sales executive",
      size: 170,
      cell: ({ row }) => (
        <span className="text-text-muted truncate">{row.original.owner_name?.trim() || "No owner"}</span>
      ),
    }),

    columnHelper.accessor((row) => row.lead_number ?? "", {
      id: "lead",
      header: "Lead",
      size: 130,
      cell: ({ row }) =>
        row.original.lead_number ? (
          <span className="text-text-muted whitespace-nowrap">{row.original.lead_number}</span>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    }),

    columnHelper.accessor((row) => row.reservation_number ?? "", {
      id: "reservation",
      header: "Reservation",
      size: 140,
      cell: ({ row }) =>
        row.original.reservation_number ? (
          <span className="text-text-muted whitespace-nowrap">{row.original.reservation_number}</span>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    }),

    /* ---- Money ---- */

    columnHelper.accessor((row) => row.listed_price ?? -1, {
      id: "listed_price",
      header: () => <span className={MONEY_HEADER}>Listed</span>,
      size: 130,
      cell: ({ row }) => <Money value={row.original.listed_price} currency={row.original.currency} />,
    }),

    columnHelper.accessor((row) => row.discount_amount ?? -1, {
      id: "discount_amount",
      header: () => <span className={MONEY_HEADER}>Discount</span>,
      size: 130,
      cell: ({ row }) => <Money value={row.original.discount_amount} currency={row.original.currency} />,
    }),

    columnHelper.accessor((row) => row.agreed_price ?? -1, {
      id: "agreed_price",
      header: () => <span className={MONEY_HEADER}>Agreed</span>,
      size: 140,
      cell: ({ row }) => <Money value={row.original.agreed_price} currency={row.original.currency} />,
    }),

    columnHelper.accessor((row) => row.total_due ?? -1, {
      id: "total_due",
      header: () => <span className={MONEY_HEADER}>Total due</span>,
      size: 140,
      cell: ({ row }) => <Money value={row.original.total_due} currency={row.original.currency} />,
    }),

    columnHelper.accessor((row) => row.verified_paid ?? -1, {
      id: "verified_paid",
      header: () => <span className={MONEY_HEADER}>Paid</span>,
      size: 140,
      cell: ({ row }) => <Money value={row.original.verified_paid} currency={row.original.currency} />,
    }),

    columnHelper.accessor((row) => row.balance_due ?? -1, {
      id: "balance_due",
      header: () => <span className={MONEY_HEADER}>Balance</span>,
      size: 140,
      cell: ({ row }) => <Money value={row.original.balance_due} currency={row.original.currency} />,
    }),

    /* ---- Dates ---- */

    columnHelper.accessor((row) => Date.parse(row.created_at), {
      id: "created_at",
      header: "Created",
      size: 130,
      cell: ({ row }) => (
        <time
          dateTime={row.original.created_at}
          title={formatDateTimeFull(row.original.created_at)}
          className="text-text-muted whitespace-nowrap"
        >
          {formatDay(row.original.created_at)}
        </time>
      ),
    }),

    /*
     * Nulls sort last whichever way the column is sorted, so clicking
     * "Completed" surfaces real completions rather than a wall of dashes.
     */
    columnHelper.accessor((row) => (row.completed_at ? Date.parse(row.completed_at) : null), {
      id: "completed_at",
      header: "Completed",
      size: 130,
      sortUndefined: "last",
      cell: ({ row }) =>
        row.original.completed_at ? (
          <time
            dateTime={row.original.completed_at}
            title={formatDateTimeFull(row.original.completed_at)}
            className="text-text-muted whitespace-nowrap"
          >
            {formatDay(row.original.completed_at)}
          </time>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    }),
  ];

  return columns as ColumnDef<ReportDealRow, unknown>[];
}

/** Labels for the column customizer, in the order the table renders them. */
export const REPORT_DEAL_COLUMN_OPTIONS = [
  { id: "deal_number", label: "Deal" },
  { id: "status", label: "Status" },
  { id: "customer", label: "Customer" },
  { id: "vehicle", label: "Vehicle" },
  { id: "brand", label: "Brand" },
  { id: "showroom", label: "Showroom" },
  { id: "owner", label: "Sales executive" },
  { id: "lead", label: "Lead" },
  { id: "reservation", label: "Reservation" },
  { id: "listed_price", label: "Listed" },
  { id: "discount_amount", label: "Discount" },
  { id: "agreed_price", label: "Agreed" },
  { id: "total_due", label: "Total due" },
  { id: "verified_paid", label: "Paid" },
  { id: "balance_due", label: "Balance" },
  { id: "created_at", label: "Created" },
  { id: "completed_at", label: "Completed" },
];

/**
 * Columns hidden by default.
 *
 * Seventeen columns at once is a wall. These four are the ones most reports
 * don't need, and they are one click away in the customizer.
 */
export const REPORT_DEAL_DEFAULT_HIDDEN = {
  brand: false,
  lead: false,
  reservation: false,
  listed_price: false,
};
