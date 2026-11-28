"use client";

import Link from "next/link";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Crown, ShieldAlert } from "lucide-react";

import { Tooltip } from "@/src/components/ui/tooltip";
import { StaffStatusBadge } from "@/src/components/users/staff-status-badge";
import type { StaffMember } from "@/src/lib/types/staff";

const columnHelper = createColumnHelper<StaffMember>();

function Empty({ children = "—" }: { children?: React.ReactNode }) {
  return <span className="text-text-subtle">{children}</span>;
}

/*
| The staff table's columns.
|
| The name links to the account's own page, which is where every action lives.
| Nothing in this table mutates anything — a row is a way in, not a control
| panel — so there is no chance of a mis-tap suspending somebody from a list.
*/

export function buildStaffColumns(): ColumnDef<StaffMember, unknown>[] {
  return [
    columnHelper.accessor("fullName", {
      id: "name",
      header: "Name",
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={`/admin/users/${row.id}`}
              className="text-text-primary hover:text-primary min-w-0 truncate font-medium underline-offset-4 transition-colors hover:underline"
            >
              {row.fullName}
            </Link>
            {row.roleProtected && (
              <Tooltip content="Holds the protected role — cannot be left without an active holder">
                <Crown className="text-primary size-3.5 shrink-0" aria-label="Protected role" />
              </Tooltip>
            )}
          </div>
        );
      },
    }),

    columnHelper.accessor("staffCode", {
      id: "code",
      header: "Staff ID",
      cell: (info) => {
        const code = info.getValue();
        return code ? <span className="text-text-muted tabular-nums">{code}</span> : <Empty />;
      },
    }),

    columnHelper.accessor("email", {
      id: "email",
      header: "Email",
      cell: (info) => {
        const email = info.getValue();
        return email ? <span className="text-text-muted truncate">{email}</span> : <Empty />;
      },
    }),

    columnHelper.accessor("roleName", {
      id: "role",
      header: "Role",
      cell: (info) => {
        const row = info.row.original;
        if (!row.roleName) {
          return (
            <Tooltip content="No role, so this account cannot reach the admin area at all">
              <span className="text-danger inline-flex items-center gap-1 font-medium">
                <ShieldAlert className="size-3.5" aria-hidden="true" />
                No role
              </span>
            </Tooltip>
          );
        }
        return <span className="text-text-primary">{row.roleName}</span>;
      },
    }),

    columnHelper.accessor("department", {
      id: "department",
      header: "Department",
      cell: (info) => info.getValue() ?? <Empty />,
    }),

    columnHelper.accessor("jobTitle", {
      id: "jobTitle",
      header: "Job Title",
      cell: (info) => info.getValue() ?? <Empty />,
    }),

    columnHelper.accessor("phone", {
      id: "phone",
      header: "Phone",
      cell: (info) => {
        const phone = info.getValue();
        return phone ? <span className="tabular-nums">{phone}</span> : <Empty />;
      },
    }),

    columnHelper.accessor("status", {
      id: "status",
      header: "Status",
      cell: (info) => <StaffStatusBadge status={info.getValue()} />,
    }),
  ] as ColumnDef<StaffMember, unknown>[];
}

export const STAFF_COLUMN_OPTIONS = [
  { id: "name", label: "Name" },
  { id: "code", label: "Staff ID" },
  { id: "email", label: "Email" },
  { id: "role", label: "Role" },
  { id: "department", label: "Department" },
  { id: "jobTitle", label: "Job Title" },
  { id: "phone", label: "Phone" },
  { id: "status", label: "Status" },
] as const;

/** Phone and job title are off by default: eight columns is too many at once. */
export const STAFF_DEFAULT_VISIBILITY: Record<string, boolean> = {
  name: true,
  code: true,
  email: true,
  role: true,
  department: true,
  jobTitle: false,
  phone: false,
  status: true,
};
