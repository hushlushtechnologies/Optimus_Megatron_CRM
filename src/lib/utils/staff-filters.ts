import { isStaffStatus, type StaffMember, type StaffPermissions, type StaffStatus, type StaffSummary } from "@/src/lib/types/staff";

/*
| Pure staff-list logic: filter parsing, counting, and who may act on whom.
|
| Nothing here touches Supabase or React, so all of it can be tested without
| a database or a browser. The authority rules in particular NEED testing,
| because they are a second copy of the rules in sql/16 — the interface has
| to agree with the database about which buttons exist, or staff get offered
| actions that fail.
|
| The database is still the one that decides. These functions decide what to
| SHOW. If they ever disagree, the database wins and the person sees an error
| — which is the right way round, but a bad experience, so the tests pin the
| two together.
*/

export const STAFF_PAGE_SIZE = 25;

export type StaffSortField = "name" | "role" | "status" | "department" | "code";
export type StaffSortDirection = "asc" | "desc";

export interface StaffSort {
  field: StaffSortField;
  direction: StaffSortDirection;
}

export const DEFAULT_STAFF_SORT: StaffSort = { field: "name", direction: "asc" };

export interface StaffFilters {
  search: string;
  status: StaffStatus | "all";
  roleId: string | "all";
  department: string | "all";
}

export const DEFAULT_STAFF_FILTERS: StaffFilters = {
  search: "",
  status: "all",
  roleId: "all",
  department: "all",
};

/* =========================================================
   URL PARAMS
========================================================= */

type ParamBag = Record<string, string | string[] | undefined>;

function readParam(params: ParamBag, key: string): string {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

export function parseStaffFilters(params: ParamBag): StaffFilters {
  const status = readParam(params, "status");
  const roleId = readParam(params, "role");
  const department = readParam(params, "department");

  return {
    search: readParam(params, "q").slice(0, 120),
    status: isStaffStatus(status) ? status : "all",
    roleId: roleId === "" ? "all" : roleId,
    department: department === "" ? "all" : department,
  };
}

export function parseStaffSort(params: ParamBag): StaffSort {
  const field = readParam(params, "sort");
  const direction = readParam(params, "dir");

  const allowed: StaffSortField[] = ["name", "role", "status", "department", "code"];

  return {
    field: (allowed as string[]).includes(field) ? (field as StaffSortField) : DEFAULT_STAFF_SORT.field,
    direction: direction === "desc" ? "desc" : "asc",
  };
}

export function parseStaffPage(params: ParamBag): number {
  const raw = Number.parseInt(readParam(params, "page"), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/** Only non-default values are written, so a clean list has a clean URL. */
export function writeStaffFiltersToParams(filters: StaffFilters, sort: StaffSort, page: number): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search) params.set("q", filters.search);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.roleId !== "all") params.set("role", filters.roleId);
  if (filters.department !== "all") params.set("department", filters.department);

  if (sort.field !== DEFAULT_STAFF_SORT.field) params.set("sort", sort.field);
  if (sort.direction !== DEFAULT_STAFF_SORT.direction) params.set("dir", sort.direction);

  if (page > 1) params.set("page", String(page));

  return params;
}

export function countActiveStaffFilters(filters: StaffFilters): number {
  let count = 0;
  if (filters.search) count += 1;
  if (filters.status !== "all") count += 1;
  if (filters.roleId !== "all") count += 1;
  if (filters.department !== "all") count += 1;
  return count;
}

/* =========================================================
   COUNTING
========================================================= */

/**
 * The dashboard figures, from rows already read.
 *
 * Counted here rather than with six count queries: one read, one pass, and
 * the figures cannot disagree with the table underneath them — which they
 * would if the counts were a separate query against a moving table.
 */
export function summariseStaff(rows: readonly StaffMember[]): StaffSummary {
  const summary: StaffSummary = {
    total: rows.length,
    active: 0,
    invited: 0,
    suspended: 0,
    deactivated: 0,
    withoutRole: 0,
    readFailed: false,
  };

  for (const row of rows) {
    if (row.status === "active") summary.active += 1;
    else if (row.status === "invited") summary.invited += 1;
    else if (row.status === "suspended") summary.suspended += 1;
    else if (row.status === "deactivated") summary.deactivated += 1;

    if (!row.roleId) summary.withoutRole += 1;
  }

  return summary;
}

/* =========================================================
   FILTERING AND SORTING
========================================================= */

export function filterStaff(rows: readonly StaffMember[], filters: StaffFilters): StaffMember[] {
  const needle = filters.search.toLowerCase();

  return rows.filter((row) => {
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.roleId !== "all" && row.roleId !== filters.roleId) return false;
    if (filters.department !== "all" && (row.department ?? "") !== filters.department) return false;

    if (!needle) return true;

    return (
      row.fullName.toLowerCase().includes(needle) ||
      (row.email ?? "").toLowerCase().includes(needle) ||
      (row.staffCode ?? "").toLowerCase().includes(needle) ||
      (row.phone ?? "").toLowerCase().includes(needle) ||
      (row.department ?? "").toLowerCase().includes(needle) ||
      (row.jobTitle ?? "").toLowerCase().includes(needle)
    );
  });
}

const STATUS_ORDER: Record<StaffStatus, number> = {
  active: 0,
  invited: 1,
  suspended: 2,
  deactivated: 3,
};

export function sortStaff(rows: readonly StaffMember[], sort: StaffSort): StaffMember[] {
  const sign = sort.direction === "desc" ? -1 : 1;

  const compare = (a: StaffMember, b: StaffMember): number => {
    switch (sort.field) {
      case "role":
        // By authority, not alphabetically: "Admin, Manager, Super Admin" is
        // not a useful ordering of roles. Unranked rows sort last.
        return (a.roleRank ?? 9999) - (b.roleRank ?? 9999) || a.fullName.localeCompare(b.fullName);
      case "status":
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.fullName.localeCompare(b.fullName);
      case "department":
        return (a.department ?? "").localeCompare(b.department ?? "") || a.fullName.localeCompare(b.fullName);
      case "code":
        return (a.staffCode ?? "").localeCompare(b.staffCode ?? "");
      case "name":
      default:
        return a.fullName.localeCompare(b.fullName);
    }
  };

  return [...rows].sort((a, b) => sign * compare(a, b));
}

export function paginateStaff(rows: readonly StaffMember[], page: number, pageSize = STAFF_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return { rows: rows.slice(start, start + pageSize), page: safePage, totalPages, totalItems: rows.length };
}

/* =========================================================
   AUTHORITY — the same rules as sql/16, for deciding what to show
========================================================= */

export type StaffActionRefusal =
  | null
  | "no-permission"
  | "self"
  | "outranked"
  | "last-protected-admin"
  | "already-in-status"
  | "illegal-transition";

/**
 * May the signed-in user change this person's status?
 *
 * Mirrors staff_set_status() in sql/16, in the same order, so the reason the
 * interface gives is the reason the database would give:
 *
 *   1. holds users.manage
 *   2. not acting on their own account
 *   3. outranks the target, unless they hold the protected role
 *   4. is not removing the last active holder of the protected role
 */
export function refusalForStatusChange(
  permissions: StaffPermissions,
  target: StaffMember,
  nextStatus: StaffStatus,
  allStaff: readonly StaffMember[],
): StaffActionRefusal {
  // The order matters and it is not arbitrary: it is staff_set_status()'s
  // order, so the reason shown is the reason the database would give. Telling
  // somebody "no change needed" when the real answer is "you may not touch
  // this account" is the wrong reason, and the agreement test pins it.
  if (!permissions.canManage) return "no-permission";
  if (permissions.myRank === null) return "no-permission";

  if (nextStatus !== "active" && isSelf(permissions, target)) return "self";

  if (!permissions.isProtected) {
    // Written as two statements, and the null one first, deliberately. A
    // single `(target.roleRank ?? 0) <= myRank` would also refuse a roleless
    // target, but only because null coerces to zero — correctness by accident.
    // Somebody tidying this later would not know the coercion was load-bearing.
    if (target.roleRank === null) return "outranked";
    if (target.roleRank <= permissions.myRank) return "outranked";
  }

  if (nextStatus !== "active" && isLastActiveProtected(target, allStaff)) {
    return "last-protected-admin";
  }

  if (target.status === nextStatus) return "already-in-status";

  if (!isLegalStatusTransition(target.status, nextStatus)) return "illegal-transition";

  return null;
}

/**
 * The status edges the database allows, from guard_profile_lifecycle().
 *
 *   invited     -> active, deactivated
 *   active      -> suspended, deactivated
 *   suspended   -> active, deactivated
 *   deactivated -> active
 *
 * Notably deactivated cannot go straight to suspended: somebody who has left
 * comes back as active first, which puts a rehire in the history rather than
 * leaving a closed account in a half-state.
 */
const LEGAL_TRANSITIONS: Record<StaffStatus, readonly StaffStatus[]> = {
  invited: ["active", "deactivated"],
  active: ["suspended", "deactivated"],
  suspended: ["active", "deactivated"],
  deactivated: ["active"],
};

export function isLegalStatusTransition(from: StaffStatus, to: StaffStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

/**
 * May the signed-in user give this person this role?
 *
 * Mirrors staff_assign_role(): holders of the protected role may assign
 * anything; everybody else may assign only strictly below themselves, which
 * blocks self-promotion and appointing a peer. Also refuses the change that
 * would leave no active protected-role holder.
 */
export function refusalForRoleChange(
  permissions: StaffPermissions,
  target: StaffMember,
  nextRoleRank: number,
  nextRoleProtected: boolean,
  allStaff: readonly StaffMember[],
): StaffActionRefusal {
  if (!permissions.canManage) return "no-permission";
  if (permissions.myRank === null) return "no-permission";

  if (!permissions.isProtected && nextRoleRank <= permissions.myRank) return "outranked";

  if (!nextRoleProtected && isLastActiveProtected(target, allStaff)) {
    return "last-protected-admin";
  }

  return null;
}

function isSelf(permissions: StaffPermissions, target: StaffMember): boolean {
  return permissions.selfId !== null && permissions.selfId === target.id;
}

/** Is this person the only active holder of the protected role? */
export function isLastActiveProtected(target: StaffMember, allStaff: readonly StaffMember[]): boolean {
  if (!target.roleProtected || target.status !== "active") return false;

  return !allStaff.some((other) => other.id !== target.id && other.roleProtected && other.status === "active");
}

export const STAFF_REFUSAL_MESSAGES: Record<NonNullable<StaffActionRefusal>, string> = {
  "no-permission": "You don't have permission to change staff accounts.",
  self: "You can't suspend or deactivate your own account. Ask another administrator.",
  outranked: "This account is at or above your own authority.",
  "last-protected-admin": "This is the last active Super Admin. Promote someone else first.",
  "already-in-status": "No change — the account is already in that state.",
  "illegal-transition": "That isn't a step this account can take from its current state.",
};
