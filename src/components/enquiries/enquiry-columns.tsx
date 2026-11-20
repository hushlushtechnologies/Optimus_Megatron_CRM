"use client";

import Link from "next/link";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Eye, MoreVertical, ShieldAlert, UserPlus } from "lucide-react";

import { createSelectionColumn } from "@/src/components/shared/data-table/data-table";
import { Dropdown, DropdownContent, DropdownTrigger } from "@/src/components/ui/dropdown";
import { IconButton } from "@/src/components/ui/icon-button";

import { EnquiryPriorityBadge } from "@/src/components/enquiries/enquiry-priority-badge";
import { EnquiryStatusBadge } from "@/src/components/enquiries/enquiry-status-badge";
import { EnquiryTypeBadge } from "@/src/components/enquiries/enquiry-type-badge";

import type { EnquiryListRow } from "@/src/lib/types/enquiry";
import { enquiryVehicleLabel, isStale, waitingFor } from "@/src/lib/utils/enquiry-format";
import { formatDateTimeFull, formatDay } from "@/src/lib/utils/test-drive-format";

export type EnquiryRowAction = "claim" | "spam";

const columnHelper = createColumnHelper<EnquiryListRow>();

/* =========================================================
   SHARED BITS
========================================================= */

function Empty({ children = "—" }: { children?: React.ReactNode }) {
  return <span className="text-text-subtle">{children}</span>;
}

/**
 * A date with the full timestamp behind it.
 *
 * The cell shows the day, because that is what somebody scanning a list
 * compares. The exact moment is a hover away for the one row that matters.
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

interface EnquiryColumnOptions {
  currentUserId: string;
  canManage: boolean;
  /** True while an action on that row is in flight. */
  busyId: string | null;
  onAction: (row: EnquiryListRow, action: EnquiryRowAction) => void;
}

/**
 * Every column the enquiry table can show.
 *
 * Sorting is off on all of them. The list is paginated on the server, so a
 * client-side sort would reorder the twenty-five rows on screen and leave
 * the other four hundred where they were — which looks like sorting and
 * isn't. The sort control above the table does it properly.
 */
export function getEnquiryColumns({
  currentUserId,
  canManage,
  busyId,
  onAction,
}: EnquiryColumnOptions): ColumnDef<EnquiryListRow, unknown>[] {
  const columns = [
    createSelectionColumn<EnquiryListRow>((row) => row.enquiry_number),

    columnHelper.accessor("enquiry_number", {
      id: "enquiry_number",
      header: "Enquiry ID",
      enableSorting: false,
      size: 150,
      cell: ({ row }) => (
        <Link
          href={`/admin/enquiries/${row.original.id}`}
          className="text-text-primary hover:text-primary-text font-medium whitespace-nowrap"
        >
          {row.original.enquiry_number}
        </Link>
      ),
    }),

    columnHelper.display({
      id: "customer",
      header: "Customer",
      enableSorting: false,
      size: 230,
      cell: ({ row }) => {
        const enquiry = row.original;

        return (
          <div className="min-w-0">
            {/*
              An enquiry may have no customer record yet — that is what
              converting one is for — so the name is plain text unless there
              is somewhere for it to lead.
            */}
            {enquiry.customer_id ? (
              <Link
                href={`/admin/customers/${enquiry.customer_id}`}
                className="text-text-primary hover:text-primary-text block truncate font-medium"
              >
                {enquiry.full_name}
              </Link>
            ) : (
              <span className="text-text-primary block truncate font-medium">{enquiry.full_name}</span>
            )}

            <p className="text-caption text-text-subtle truncate">
              {enquiry.customer_number || enquiry.phone || enquiry.email || "No contact details"}
            </p>
          </div>
        );
      },
    }),

    columnHelper.display({
      id: "type",
      header: "Type",
      enableSorting: false,
      size: 150,
      cell: ({ row }) => (
        <EnquiryTypeBadge type={row.original.enquiry_type} label={row.original.type_label} />
      ),
    }),

    columnHelper.display({
      id: "subject",
      header: "Subject / Vehicle",
      enableSorting: false,
      size: 260,
      cell: ({ row }) => {
        const enquiry = row.original;
        const vehicle = enquiryVehicleLabel(enquiry);
        const subject = enquiry.subject?.trim();

        if (!subject && !vehicle) return <Empty>Nothing given</Empty>;

        return (
          <div className="min-w-0">
            <p className="text-text-primary truncate">{subject || vehicle}</p>
            {subject && vehicle && <p className="text-caption text-text-subtle truncate">{vehicle}</p>}
          </div>
        );
      },
    }),

    columnHelper.accessor("source", {
      id: "source",
      header: "Source",
      enableSorting: false,
      size: 150,
      cell: (ctx) => <span className="truncate">{ctx.getValue() || "—"}</span>,
    }),

    columnHelper.display({
      id: "status",
      header: "Status",
      enableSorting: false,
      size: 170,
      cell: ({ row }) => {
        const enquiry = row.original;

        return (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <EnquiryStatusBadge
              status={enquiry.status}
              label={enquiry.status_label}
              tone={enquiry.status_tone}
            />

            {/* Waiting a day with nobody on it is the thing worth spotting. */}
            {isStale(enquiry) && (
              <span className="text-caption whitespace-nowrap text-amber-400">
                {waitingFor(enquiry.created_at)}
              </span>
            )}
          </div>
        );
      },
    }),

    columnHelper.display({
      id: "priority",
      header: "Priority",
      enableSorting: false,
      size: 120,
      cell: ({ row }) => <EnquiryPriorityBadge priority={row.original.priority} />,
    }),

    columnHelper.display({
      id: "assigned_staff",
      header: "Assigned Staff",
      enableSorting: false,
      size: 160,
      cell: ({ row }) =>
        row.original.assigned_to_name ? (
          <span className="truncate">{row.original.assigned_to_name}</span>
        ) : (
          <Empty>Unassigned</Empty>
        ),
    }),

    columnHelper.display({
      id: "created_at",
      header: "Created Date",
      enableSorting: false,
      size: 140,
      cell: ({ row }) => <DayCell value={row.original.created_at} />,
    }),

    columnHelper.display({
      id: "last_activity",
      header: "Last Activity",
      enableSorting: false,
      size: 140,
      cell: ({ row }) => <DayCell value={row.original.last_activity_at} />,
    }),

    columnHelper.display({
      id: "next_follow_up",
      header: "Next Follow-Up",
      enableSorting: false,
      size: 150,
      cell: ({ row }) => {
        const due = row.original.next_follow_up_at;

        if (!due) return <Empty>None set</Empty>;

        const overdue = new Date(due).getTime() < Date.now();

        return (
          <span
            className={overdue ? "font-medium whitespace-nowrap text-amber-400" : "whitespace-nowrap"}
            title={formatDateTimeFull(due)}
          >
            {formatDay(due)}
            {overdue && " · due"}
          </span>
        );
      },
    }),

    columnHelper.display({
      id: "actions",
      header: "",
      size: 56,
      enableSorting: false,
      enableResizing: false,
      cell: ({ row }) => {
        const enquiry = row.original;
        const busy = busyId === enquiry.id;

        const mine = enquiry.assigned_to === currentUserId;
        const canClaim = canManage && !mine && enquiry.status_is_open;
        const canFlag = canManage && enquiry.status !== "Spam" && enquiry.status !== "Converted";

        return (
          <Dropdown>
            <DropdownTrigger>
              <IconButton
                aria-label={`Actions for ${enquiry.enquiry_number}`}
                variant="ghost"
                size="sm"
                disabled={busy}
              >
                <MoreVertical className="size-4" />
              </IconButton>
            </DropdownTrigger>

            <DropdownContent align="end" className="w-56 py-1">
              <Link
                href={`/admin/enquiries/${enquiry.id}`}
                role="menuitem"
                className="text-body-sm text-text-primary hover:bg-card-hover flex items-center gap-2.5 px-4 py-2"
              >
                <Eye className="text-text-muted size-4" aria-hidden="true" />
                View details
              </Link>

              {canClaim && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onAction(enquiry, "claim")}
                  className="text-body-sm text-text-primary hover:bg-card-hover flex w-full items-center gap-2.5 px-4 py-2 text-left"
                >
                  <UserPlus className="text-text-muted size-4" aria-hidden="true" />
                  Take this on
                </button>
              )}

              {canFlag && (
                <>
                  <div role="separator" className="border-border my-1 border-t" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onAction(enquiry, "spam")}
                    className="text-body-sm hover:bg-card-hover flex w-full items-center gap-2.5 px-4 py-2 text-left text-red-400"
                  >
                    <ShieldAlert className="size-4" aria-hidden="true" />
                    Mark as spam
                  </button>
                </>
              )}
            </DropdownContent>
          </Dropdown>
        );
      },
    }),
  ];

  return columns as ColumnDef<EnquiryListRow, unknown>[];
}

/* =========================================================
   DEFAULTS
========================================================= */

export const DEFAULT_ENQUIRY_COLUMN_ORDER = [
  "select",
  "enquiry_number",
  "customer",
  "type",
  "subject",
  "source",
  "status",
  "priority",
  "assigned_staff",
  "created_at",
  "last_activity",
  "next_follow_up",
  "actions",
];

/*
 * A clean default: who wrote in, what about, where it stands, who has it and
 * when it arrived. Source and the two activity dates are real columns people
 * need occasionally and nobody needs always, so they start hidden and are
 * one click away in the column menu.
 */
export const DEFAULT_ENQUIRY_COLUMN_VISIBILITY: Record<string, boolean> = {
  select: true,
  enquiry_number: true,
  customer: true,
  type: true,
  subject: true,
  source: false,
  status: true,
  priority: true,
  assigned_staff: true,
  created_at: true,
  last_activity: false,
  next_follow_up: false,
  actions: true,
};

/* Enquiry ID and Customer always stay visible: they are what identifies the row. */
export const CUSTOMIZABLE_ENQUIRY_COLUMNS = [
  { id: "type", label: "Type" },
  { id: "subject", label: "Subject / Vehicle" },
  { id: "source", label: "Source" },
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "assigned_staff", label: "Assigned Staff" },
  { id: "created_at", label: "Created Date" },
  { id: "last_activity", label: "Last Activity" },
  { id: "next_follow_up", label: "Next Follow-Up" },
];
