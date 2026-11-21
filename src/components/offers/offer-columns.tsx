"use client";

import Link from "next/link";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Archive, Copy, Eye, MoreVertical, Pause, Pencil, Play } from "lucide-react";

import { createSelectionColumn } from "@/src/components/shared/data-table/data-table";
import { Dropdown, DropdownContent, DropdownTrigger } from "@/src/components/ui/dropdown";
import { IconButton } from "@/src/components/ui/icon-button";

import { DiscountBadge } from "@/src/components/offers/discount-badge";
import { OfferStatusBadge } from "@/src/components/offers/offer-status-badge";
import { OfferTypeBadge } from "@/src/components/offers/offer-type-badge";

import type { OfferListRow } from "@/src/lib/types/offer-list";
import { describeCampaignWindow } from "@/src/lib/utils/campaign-window";
import { formatDateTimeFull, formatDay } from "@/src/lib/utils/test-drive-format";

export type OfferRowAction = "pause" | "resume" | "duplicate" | "archive";

const columnHelper = createColumnHelper<OfferListRow>();

/* =========================================================
   SHARED BITS
========================================================= */

function Empty({ children = "—" }: { children?: React.ReactNode }) {
  return <span className="text-text-subtle">{children}</span>;
}

/**
 * A date with the full timestamp behind it.
 *
 * Same treatment as the enquiry table: the day is what people compare when
 * scanning, and the exact moment is a hover away for the one row that
 * matters.
 */
function DayCell({ value }: { value: string | null }) {
  if (!value) return <Empty />;

  return (
    <span className="whitespace-nowrap" title={formatDateTimeFull(value)}>
      {formatDay(value)}
    </span>
  );
}

/* =========================================================
   COLUMNS
========================================================= */

interface OfferColumnOptions {
  /** offers.manage — editing and duplicating. */
  canManage: boolean;
  /** offers.publish — pausing, resuming and archiving. */
  canPublish: boolean;
  /** The row with an action in flight, if any. */
  busyId: string | null;
  onAction: (row: OfferListRow, action: OfferRowAction) => void;
}

/**
 * Every column the promotions table can show.
 *
 * Sorting is off on all of them, for the same reason it is off in Sprint 7:
 * the list is paginated on the server, so a client-side sort would reorder
 * the rows on screen and leave the rest where they were. The sort control
 * above the table does it properly.
 */
export function getOfferColumns({
  canManage,
  canPublish,
  busyId,
  onAction,
}: OfferColumnOptions): ColumnDef<OfferListRow, unknown>[] {
  const columns = [
    createSelectionColumn<OfferListRow>((row) => row.name),

    columnHelper.display({
      id: "name",
      header: "Campaign",
      enableSorting: false,
      size: 260,
      cell: ({ row }) => {
        const offer = row.original;

        return (
          <div className="min-w-0">
            <Link
              href={`/admin/offers/${offer.id}`}
              className="text-text-primary hover:text-primary-text block truncate font-medium"
            >
              {offer.name}
            </Link>

            {offer.reference && (
              <span className="text-text-subtle block truncate text-xs">{offer.reference}</span>
            )}
          </div>
        );
      },
    }),

    columnHelper.accessor("promotionType", {
      id: "promotionType",
      header: "Type",
      enableSorting: false,
      size: 150,
      cell: ({ row }) => <OfferTypeBadge type={row.original.promotionType} />,
    }),

    columnHelper.accessor("status", {
      id: "status",
      header: "Status",
      enableSorting: false,
      size: 120,
      cell: ({ row }) => <OfferStatusBadge status={row.original.status} />,
    }),

    columnHelper.display({
      id: "discount",
      header: "Discount",
      enableSorting: false,
      size: 130,
      cell: ({ row }) => (
        <DiscountBadge
          discountType={row.original.discountType}
          discountValue={row.original.discountValue}
        />
      ),
    }),

    /*
     * One column for the whole window, not three.
     *
     * "Runs until 4 Dec · 10 days left" is what somebody scanning actually
     * wants; a start column, an end column and a countdown column would be
     * three things to read and reassemble per row.
     */
    columnHelper.display({
      id: "window",
      header: "Schedule",
      enableSorting: false,
      size: 210,
      cell: ({ row }) => {
        const offer = row.original;
        /* The helper defaults `now` itself, same as CampaignTimeline does. */
        const window = describeCampaignWindow(offer.startsAt, offer.endsAt);

        return (
          <div className="min-w-0">
            <span className="text-text-primary block truncate text-xs">{window.label}</span>

            {window.remaining && (
              <span className="text-text-subtle block truncate text-xs">{window.remaining}</span>
            )}
          </div>
        );
      },
    }),

    columnHelper.display({
      id: "audience",
      header: "Applies to",
      enableSorting: false,
      size: 180,
      cell: ({ row }) => {
        const offer = row.original;

        /*
         * No targets means no restriction, which is the widest possible
         * audience — so it must not render as a blank cell. A blank reads as
         * "nothing", and this is the opposite of nothing.
         */
        const label =
          offer.targetSummary ??
          (offer.promotionType === "customer" ? "Assigned customers" : "All eligible vehicles");

        return <span className="block truncate text-xs">{label}</span>;
      },
    }),

    columnHelper.display({
      id: "usage",
      header: "Used",
      enableSorting: false,
      size: 110,
      cell: ({ row }) => {
        const offer = row.original;

        if (offer.maxRedemptions === null) {
          return <span className="tabular-nums">{offer.redemptionCount.toLocaleString()}</span>;
        }

        const exhausted = offer.redemptionCount >= offer.maxRedemptions;

        return (
          <span className={exhausted ? "text-warning font-medium tabular-nums" : "tabular-nums"}>
            {offer.redemptionCount.toLocaleString()} / {offer.maxRedemptions.toLocaleString()}
          </span>
        );
      },
    }),

    columnHelper.accessor("priority", {
      id: "priority",
      header: "Priority",
      enableSorting: false,
      size: 100,
      cell: ({ row }) => <span className="tabular-nums">{row.original.priority}</span>,
    }),

    columnHelper.display({
      id: "reach",
      header: "Reach",
      enableSorting: false,
      size: 130,
      cell: ({ row }) => {
        const offer = row.original;
        const parts: string[] = [];

        if (offer.assignmentCount > 0) {
          parts.push(`${offer.assignmentCount} customer${offer.assignmentCount === 1 ? "" : "s"}`);
        }

        if (offer.codeCount > 0) {
          parts.push(`${offer.codeCount} code${offer.codeCount === 1 ? "" : "s"}`);
        }

        if (parts.length === 0) return <Empty />;

        return <span className="block truncate text-xs">{parts.join(", ")}</span>;
      },
    }),

    columnHelper.accessor("createdByName", {
      id: "createdByName",
      header: "Created By",
      enableSorting: false,
      size: 150,
      cell: ({ row }) =>
        row.original.createdByName ? (
          <span className="block truncate">{row.original.createdByName}</span>
        ) : (
          <Empty />
        ),
    }),

    columnHelper.accessor("createdAt", {
      id: "createdAt",
      header: "Created",
      enableSorting: false,
      size: 120,
      cell: ({ row }) => <DayCell value={row.original.createdAt} />,
    }),

    columnHelper.display({
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      size: 60,
      cell: ({ row }) => {
        const offer = row.original;
        const busy = busyId === offer.id;

        /*
         * What's offered depends on where the campaign is, not just on what
         * the person may do. Pausing a draft is meaningless; resuming an
         * expired campaign would need new dates, which is an edit.
         */
        const canPause = canPublish && offer.status === "active";
        const canResume = canPublish && offer.status === "paused";
        const canArchive = canPublish && offer.archivedAt === null;

        return (
          <Dropdown>
            <DropdownTrigger>
              <IconButton
                aria-label={`Actions for ${offer.name}`}
                variant="ghost"
                size="sm"
                disabled={busy}
              >
                <MoreVertical className="size-4" aria-hidden="true" />
              </IconButton>
            </DropdownTrigger>

            <DropdownContent align="end" className="w-52">
              <Link
                href={`/admin/offers/${offer.id}`}
                role="menuitem"
                className="text-body-sm hover:bg-card-hover flex w-full items-center gap-2.5 px-4 py-2 text-left"
              >
                <Eye className="size-4" aria-hidden="true" />
                View campaign
              </Link>

              {canManage && (
                <Link
                  href={`/admin/offers/${offer.id}/edit`}
                  role="menuitem"
                  className="text-body-sm hover:bg-card-hover flex w-full items-center gap-2.5 px-4 py-2 text-left"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit
                </Link>
              )}

              {canPause && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onAction(offer, "pause")}
                  className="text-body-sm hover:bg-card-hover flex w-full items-center gap-2.5 px-4 py-2 text-left"
                >
                  <Pause className="size-4" aria-hidden="true" />
                  Pause
                </button>
              )}

              {canResume && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onAction(offer, "resume")}
                  className="text-body-sm hover:bg-card-hover flex w-full items-center gap-2.5 px-4 py-2 text-left"
                >
                  <Play className="size-4" aria-hidden="true" />
                  Resume
                </button>
              )}

              {canManage && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onAction(offer, "duplicate")}
                  className="text-body-sm hover:bg-card-hover flex w-full items-center gap-2.5 px-4 py-2 text-left"
                >
                  <Copy className="size-4" aria-hidden="true" />
                  Duplicate
                </button>
              )}

              {canArchive && (
                <>
                  <div role="separator" className="border-border my-1 border-t" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onAction(offer, "archive")}
                    className="text-body-sm hover:bg-card-hover flex w-full items-center gap-2.5 px-4 py-2 text-left text-red-400"
                  >
                    <Archive className="size-4" aria-hidden="true" />
                    Archive
                  </button>
                </>
              )}
            </DropdownContent>
          </Dropdown>
        );
      },
    }),
  ];

  return columns as ColumnDef<OfferListRow, unknown>[];
}

/* =========================================================
   DEFAULTS
========================================================= */

export const DEFAULT_OFFER_COLUMN_ORDER = [
  "select",
  "name",
  "promotionType",
  "status",
  "discount",
  "window",
  "audience",
  "usage",
  "priority",
  "reach",
  "createdByName",
  "createdAt",
  "actions",
];

/*
 * A clean default: what the campaign is, where it stands, what it takes off
 * and when it runs. Priority, reach, who made it and when are real columns
 * people need occasionally and nobody needs always, so they start hidden and
 * are one click away in the column menu.
 */
export const DEFAULT_OFFER_COLUMN_VISIBILITY: Record<string, boolean> = {
  select: true,
  name: true,
  promotionType: true,
  status: true,
  discount: true,
  window: true,
  audience: true,
  usage: true,
  priority: false,
  reach: false,
  createdByName: false,
  createdAt: false,
  actions: true,
};

/* Campaign and Status always stay visible: they are what identifies the row. */
export const CUSTOMIZABLE_OFFER_COLUMNS = [
  { id: "promotionType", label: "Type" },
  { id: "discount", label: "Discount" },
  { id: "window", label: "Schedule" },
  { id: "audience", label: "Applies To" },
  { id: "usage", label: "Used" },
  { id: "priority", label: "Priority" },
  { id: "reach", label: "Reach" },
  { id: "createdByName", label: "Created By" },
  { id: "createdAt", label: "Created Date" },
];
