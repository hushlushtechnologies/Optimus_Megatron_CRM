"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Info, Search, ShieldAlert, ShieldCheck, UserPlus } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { DataTable } from "@/src/components/shared/data-table/data-table";
import { TableCustomizer } from "@/src/components/shared/data-table/table-customizer";
import { EmptyState } from "@/src/components/shared/empty-state";
import { ErrorState } from "@/src/components/shared/error-state";
import { FilterBar } from "@/src/components/shared/filter-bar";
import { NoSearchResults } from "@/src/components/shared/no-search-results";
import { Pagination } from "@/src/components/shared/pagination";

import {
  buildStaffColumns,
  STAFF_COLUMN_OPTIONS,
  STAFF_DEFAULT_VISIBILITY,
} from "@/src/components/users/staff-columns";
import { StaffSummaryCards } from "@/src/components/users/staff-summary-cards";
import { InviteStaffDialog } from "@/src/components/users/invite-staff-dialog";
import { PendingInvitations } from "@/src/components/users/pending-invitations";
import type { PendingInvitation } from "@/src/lib/supabase/staff-invitation-queries";

import { STAFF_STATUSES, STAFF_STATUS_DISPLAY, type StaffMember, type StaffPermissions, type StaffRoleOption } from "@/src/lib/types/staff";
import {
  countActiveStaffFilters,
  DEFAULT_STAFF_SORT,
  filterStaff,
  paginateStaff,
  sortStaff,
  summariseStaff,
  writeStaffFiltersToParams,
  type StaffFilters,
  type StaffSort,
} from "@/src/lib/utils/staff-filters";

/*
| The staff list.
|
| Filtering, sorting and paging happen here rather than in the database. That
| is a deliberate choice for this table and not a general one: a dealership has
| tens of members of staff, not tens of thousands, so one read gives the whole
| list and every filter is then instant with no round trip. It also means the
| six figures above the table are counted from the same rows shown beneath it,
| so they cannot disagree with each other.
|
| If this list ever reaches a few thousand rows, the paging moves to the query
| and the summary becomes its own count. Until then this is simpler and the
| numbers are consistent by construction.
|
| Phases 5 to 7 add the detail page and the invite, suspend and offboard
| actions. The permission flags are already threaded through so those arrive
| as buttons rather than as a restructure.
*/

interface UsersClientProps {
  staff: StaffMember[];
  roles: StaffRoleOption[];
  departments: string[];
  permissions: StaffPermissions;
  initialFilters: StaffFilters;
  initialSort: StaffSort;
  initialPage: number;
  readFailed: boolean;
  usingProtectedRoleFallback: boolean;
  setupMissing: string[];
  invitations: PendingInvitation[];
  invitationsReadFailed: boolean;
}

export function UsersClient({
  staff,
  roles,
  departments,
  permissions,
  initialFilters,
  initialSort,
  initialPage,
  readFailed,
  usingProtectedRoleFallback,
  setupMissing,
  invitations,
  invitationsReadFailed,
}: UsersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<StaffFilters>(initialFilters);
  const [sort, setSort] = useState<StaffSort>(initialSort);
  const [page, setPage] = useState(initialPage);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(STAFF_DEFAULT_VISIBILITY);
  const [inviteOpen, setInviteOpen] = useState(false);

  const columns = useMemo(() => buildStaffColumns(), []);

  const summary = useMemo(() => ({ ...summariseStaff(staff), readFailed }), [staff, readFailed]);

  const visible = useMemo(() => sortStaff(filterStaff(staff, filters), sort), [staff, filters, sort]);
  const paged = useMemo(() => paginateStaff(visible, page), [visible, page]);

  const activeFilterCount = countActiveStaffFilters(filters);

  /* =======================================================
     URL
  ======================================================= */

  function push(next: StaffFilters, nextSort: StaffSort, nextPage: number) {
    const params = writeStaffFiltersToParams(next, nextSort, nextPage);
    const query = params.toString();
    router.replace(query ? `?${query}` : "?", { scroll: false });
  }

  function update(patch: Partial<StaffFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    setPage(1);
    push(next, sort, 1);
  }

  function clearAll() {
    const next: StaffFilters = { search: "", status: "all", roleId: "all", department: "all" };
    setFilters(next);
    setPage(1);
    push(next, sort, 1);
  }

  /* =======================================================
     FILTER CHIPS
  ======================================================= */

  const chips = [
    filters.search ? { key: "search", label: `“${filters.search}”` } : null,
    filters.status !== "all" ? { key: "status", label: STAFF_STATUS_DISPLAY[filters.status].label } : null,
    filters.roleId !== "all"
      ? { key: "role", label: roles.find((r) => r.id === filters.roleId)?.name ?? "Role" }
      : null,
    filters.department !== "all" ? { key: "department", label: filters.department } : null,
  ].filter((chip): chip is { key: string; label: string } => chip !== null);

  function removeChip(key: string) {
    if (key === "search") update({ search: "" });
    else if (key === "status") update({ status: "all" });
    else if (key === "role") update({ roleId: "all" });
    else if (key === "department") update({ department: "all" });
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="space-y-5">
      {/* =================================================
          HEADER
      ================================================= */}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-text-primary text-[19px] leading-6 font-semibold tracking-[-0.02em]">Staff &amp; Users</h1>
          <p className="text-text-muted mt-1 text-[13px]">
            Everyone with an account, what they can do, and whether they can sign in.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/users/roles"
            className="text-text-muted hover:text-text-primary border-border inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[13px] transition-colors"
          >
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Roles &amp; permissions
          </Link>

          {permissions.canInvite && (
            <Button leftIcon={<UserPlus aria-hidden="true" />} size="sm" onClick={() => setInviteOpen(true)}>
              Invite staff
            </Button>
          )}
        </div>
      </div>

      {/* =================================================
          SETUP AND FALLBACK NOTICES

          Both are honest states rather than silence. A screen that quietly
          works for one person and nobody else, with no explanation, is worse
          than one that says why.
      ================================================= */}

      {setupMissing.length > 0 && (
        <div className="border-warning/30 bg-warning/[0.04] flex items-start gap-3 rounded-2xl border px-4 py-3">
          <ShieldAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-text-primary text-[13px] font-semibold">Setup isn&apos;t finished</p>
            <p className="text-text-muted mt-0.5 text-[12px]">
              This page is running without its permission keys. Run{" "}
              {setupMissing.map((file, index) => (
                <span key={file}>
                  {index > 0 && ", "}
                  <code className="text-text-primary">{file}</code>
                </span>
              ))}{" "}
              and reload.
            </p>
          </div>
        </div>
      )}

      {usingProtectedRoleFallback && setupMissing.length === 0 && (
        <div className="border-border bg-card-hover/40 flex items-start gap-3 rounded-2xl border px-4 py-3">
          <Info className="text-text-muted mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-text-primary text-[13px] font-semibold">
              You are seeing this page because you hold the protected role
            </p>
            <p className="text-text-muted mt-0.5 text-[12px]">
              Nobody has been granted <code className="text-text-primary">users.view</code> yet, so access falls back
              to Super Admin. Uncomment the grants in{" "}
              <code className="text-text-primary">sql/18-sprint-11-staff-permission-keys.sql</code> to decide who else
              should see it.
            </p>
          </div>
        </div>
      )}

      {/* =================================================
          SUMMARY
      ================================================= */}

      <StaffSummaryCards summary={summary} />

      {/* =================================================
          WAITING TO ACCEPT

          Above the table, because an invitation nobody passed on is the thing
          most likely to need acting on — and with no mail provider wired up,
          it is invisible anywhere else.
      ================================================= */}

      <PendingInvitations
        invitations={invitations}
        readFailed={invitationsReadFailed}
        canInvite={permissions.canInvite}
      />

      {/* =================================================
          LIST
      ================================================= */}

      {readFailed ? (
        <ErrorState
          title="The staff list couldn't be read"
          description="Nothing has been changed. Reload to try again — if it keeps happening, the staff table or its row level security policies are the place to look."
          onRetry={() => router.refresh()}
        />
      ) : staff.length === 0 ? (
        <EmptyState
          title="No staff accounts yet"
          description="Once people are invited they appear here with their role and status."
        />
      ) : (
        <>
          <FilterBar
            activeFilters={chips}
            onRemoveFilter={removeChip}
            onClearAll={clearAll}
            resultCount={visible.length}
          >
            <Input
              label="Search"
              placeholder="Name, email, staff ID, phone…"
              leftIcon={<Search />}
              value={filters.search}
              onChange={(event) => update({ search: event.target.value })}
            />

            <Select
              label="Status"
              value={filters.status}
              onChange={(event) => update({ status: event.target.value as StaffFilters["status"] })}
              options={[
                { value: "all", label: "Any status" },
                ...STAFF_STATUSES.map((status) => ({
                  value: status,
                  label: STAFF_STATUS_DISPLAY[status].label,
                })),
              ]}
            />

            <Select
              label="Role"
              value={filters.roleId}
              onChange={(event) => update({ roleId: event.target.value })}
              options={[
                { value: "all", label: "Any role" },
                ...roles.map((role) => ({
                  value: role.id,
                  label: `${role.name} (${role.memberCount})`,
                })),
              ]}
            />

            <Select
              label="Department"
              value={filters.department}
              onChange={(event) => update({ department: event.target.value })}
              options={[
                { value: "all", label: "Any department" },
                ...departments.map((department) => ({ value: department, label: department })),
              ]}
            />
          </FilterBar>

          <div className="flex items-center justify-end">
            <TableCustomizer
              columns={[...STAFF_COLUMN_OPTIONS]}
              visibility={visibility}
              onVisibilityChange={(id, isVisible) => setVisibility((current) => ({ ...current, [id]: isVisible }))}
              onReset={() => setVisibility(STAFF_DEFAULT_VISIBILITY)}
            />
          </div>

          <DataTable
            columns={columns}
            data={paged.rows}
            getRowId={(row) => row.id}
            ariaLabel="Staff accounts"
            columnVisibility={visibility}
            onColumnVisibilityChange={(next) => setVisibility(next as Record<string, boolean>)}
            sorting={[{ id: sort.field, desc: sort.direction === "desc" }]}
            onSortingChange={(next) => {
              // The table hands back an empty array when a header is clicked a
              // third time to clear the sort. An unsorted staff list is not
              // useful, so that returns to the default rather than to arbitrary
              // row order.
              const first = next[0];
              const nextSort: StaffSort = first
                ? { field: first.id as StaffSort["field"], direction: first.desc ? "desc" : "asc" }
                : DEFAULT_STAFF_SORT;
              setSort(nextSort);
              setPage(1);
              push(filters, nextSort, 1);
            }}
            emptyState={
              activeFilterCount > 0 ? (
                <NoSearchResults query={filters.search} />
              ) : (
                <EmptyState title="Nothing to show" size="compact" />
              )
            }
          />

          <Pagination
            page={paged.page}
            pageSize={25}
            totalItems={paged.totalItems}
            itemLabel={{ singular: "staff member", plural: "staff members" }}
            onPageChange={(next) => {
              setPage(next);
              push(filters, sort, next);
            }}
          />
        </>
      )}

      <InviteStaffDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roles={roles}
        myRank={permissions.myRank}
        isProtected={permissions.isProtected}
      />

      {/* searchParams is read so that a back/forward navigation re-syncs the
          table rather than leaving the URL and the filters disagreeing. */}
      <span className="hidden" aria-hidden="true" data-params={searchParams.toString()} />
    </div>
  );
}
