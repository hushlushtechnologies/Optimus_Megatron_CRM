/*
| Staff administration types.
|
| STATUS IS FOUR VALUES AND THEY MEAN DIFFERENT THINGS
|
|   invited      an invitation exists; no sign-in has happened yet
|   active       works here, can sign in, can act
|   suspended    works here, cannot sign in — a temporary block
|   deactivated  has left; the account is closed and the history is kept
|
| The database holds the same four in profiles.status with a check
| constraint, and is_active_staff() answers "active" and nothing else.
| Suspension is not a badge — see sql/16.
*/

export const STAFF_STATUSES = ["invited", "active", "suspended", "deactivated"] as const;

export type StaffStatus = (typeof STAFF_STATUSES)[number];

export function isStaffStatus(value: unknown): value is StaffStatus {
  return typeof value === "string" && (STAFF_STATUSES as readonly string[]).includes(value);
}

/** Label and colour for each status. Hex, because StatusBadge takes colorHex. */
export const STAFF_STATUS_DISPLAY: Record<StaffStatus, { label: string; colorHex: string }> = {
  invited: { label: "Invited", colorHex: "#60a5fa" },
  active: { label: "Active", colorHex: "#22c55e" },
  suspended: { label: "Suspended", colorHex: "#f59e0b" },
  deactivated: { label: "Deactivated", colorHex: "#94a3b8" },
};

export interface StaffMember {
  id: string;
  staffCode: string | null;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
  roleId: string | null;
  roleName: string | null;
  roleRank: number | null;
  /** Mirrors roles.protected — the role that must always have an active holder. */
  roleProtected: boolean;
  status: StaffStatus;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  invitedAt: string | null;
  activatedAt: string | null;
  updatedAt: string | null;
}

export interface StaffRoleOption {
  id: string;
  name: string;
  rank: number;
  protected: boolean;
  memberCount: number;
}

/**
 * The six figures on the dashboard.
 *
 * `readFailed` exists so a failed query is never drawn as a row of zeros.
 * Sprint 9's rule: a failure and a genuine zero are different facts and the
 * screen has to be able to tell them apart.
 */
export interface StaffSummary {
  total: number;
  active: number;
  invited: number;
  suspended: number;
  deactivated: number;
  withoutRole: number;
  readFailed: boolean;
}

export const EMPTY_STAFF_SUMMARY: StaffSummary = {
  total: 0,
  active: 0,
  invited: 0,
  suspended: 0,
  deactivated: 0,
  withoutRole: 0,
  readFailed: false,
};

export interface StaffPermissions {
  /** The signed-in user's own id, so the interface can refuse self-actions. */
  selfId: string | null;
  canView: boolean;
  canInvite: boolean;
  canManage: boolean;
  canManageRoles: boolean;
  /** Rank of the signed-in user; decides which rows they may act on. */
  myRank: number | null;
  /** True when the signed-in user holds the protected role. */
  isProtected: boolean;
}

export const NO_STAFF_PERMISSIONS: StaffPermissions = {
  selfId: null,
  canView: false,
  canInvite: false,
  canManage: false,
  canManageRoles: false,
  myRank: null,
  isProtected: false,
};
