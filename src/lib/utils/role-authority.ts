/*
| Who may change which role, and which boxes in the permissions matrix are
| editable.
|
| A THIRD COPY, AND THE LAST ONE
|
| These rules exist in sql/19 as assert_can_manage_roles() and
| role_set_permission(), and the database is what decides. This module decides
| what the interface OFFERS — which checkboxes are live, which are explained
| rather than enabled.
|
| That matters more here than on the staff list. A permissions matrix is a wall
| of several hundred checkboxes; a person clicking one that silently fails, or
| one that succeeds when they expected a warning, learns the wrong thing about
| their own authority. So every disabled box carries a reason, and the reasons
| are the same sentences the database would raise.
|
| All of it is pure, so it can be tested against the real SQL functions over
| the whole cross product rather than spot-checked.
*/

export interface RoleAuthorityContext {
  /** The signed-in user's rank. Null when they are not active staff. */
  myRank: number | null;
  /** True when they hold the protected role, which exempts them from the rank rules. */
  isProtected: boolean;
  /** Do they hold roles.manage? */
  canManageRoles: boolean;
  /**
   * The permission keys the signed-in user holds.
   *
   * Needed because an actor may only grant a key they hold themselves —
   * without that rule, roles.manage would be the only permission anybody ever
   * needed: hold it, build a role with everything, assign yourself to it.
   */
  heldKeys: readonly string[];
}

export interface RoleSummary {
  id: string;
  name: string;
  rank: number;
  protected: boolean;
  isActive: boolean;
  memberCount: number;
  description: string | null;
}

export type RoleRefusal =
  | null
  | "no-permission"
  | "outranked"
  | "protected-role"
  | "has-members"
  | "already-inactive";

export const ROLE_REFUSAL_MESSAGES: Record<NonNullable<RoleRefusal>, string> = {
  "no-permission": "You don't have permission to manage roles.",
  outranked: "This role is at or above your own authority.",
  "protected-role": "This role is protected and can't be changed here.",
  "has-members": "Move the staff in this role to another one first.",
  "already-inactive": "This role is already out of use.",
};

/* =========================================================
   EDITING A ROLE
========================================================= */

/** Mirrors assert_can_manage_roles(actor, role.rank). */
export function refusalForRoleEdit(context: RoleAuthorityContext, role: RoleSummary): RoleRefusal {
  if (!context.canManageRoles && !context.isProtected) return "no-permission";
  if (context.isProtected) return null;
  if (context.myRank === null) return "no-permission";
  if (role.rank <= context.myRank) return "outranked";
  return null;
}

/**
 * May this role be given a new rank?
 *
 * Both the rank it has AND the rank it is moving to must be below the actor.
 * Checking only the destination would let somebody promote a role they can
 * edit into one they cannot; checking only the source would let them edit a
 * low role and shove it above themselves. role_update() in sql/19 asserts
 * both, in that order.
 */
export function refusalForRankChange(
  context: RoleAuthorityContext,
  role: RoleSummary,
  nextRank: number,
): RoleRefusal {
  const onCurrent = refusalForRoleEdit(context, role);
  if (onCurrent !== null) return onCurrent;

  if (role.protected) return "protected-role";
  if (context.isProtected) return null;
  if (context.myRank === null) return "no-permission";
  if (nextRank <= context.myRank) return "outranked";

  return null;
}

export function refusalForDeactivation(context: RoleAuthorityContext, role: RoleSummary): RoleRefusal {
  const base = refusalForRoleEdit(context, role);
  if (base !== null) return base;

  if (role.protected) return "protected-role";
  if (!role.isActive) return "already-inactive";

  // Deactivating a role that still has people in it would take their access
  // away as a side effect of a tidy-up. The trigger in sql/19 refuses it.
  if (role.memberCount > 0) return "has-members";

  return null;
}

/** May a brand-new role be created at this rank? */
export function refusalForRoleCreate(context: RoleAuthorityContext, nextRank: number): RoleRefusal {
  if (!context.canManageRoles && !context.isProtected) return "no-permission";
  if (context.isProtected) return null;
  if (context.myRank === null) return "no-permission";
  if (nextRank <= context.myRank) return "outranked";
  return null;
}

/** The ranks this person may actually assign, for a picker. */
export function assignableRanks(context: RoleAuthorityContext, candidates: readonly number[]): number[] {
  if (context.isProtected) return [...candidates];
  if (context.myRank === null) return [];
  return candidates.filter((rank) => rank > context.myRank!);
}

/* =========================================================
   THE MATRIX
========================================================= */

export type GrantRefusal =
  | null
  | "no-permission"
  | "outranked"
  | "not-held-by-you"
  | "protected-keeps-critical"
  | "last-critical-holder";

export const GRANT_REFUSAL_MESSAGES: Record<NonNullable<GrantRefusal>, string> = {
  "no-permission": "You don't have permission to manage roles.",
  outranked: "This role is at or above your own authority.",
  "not-held-by-you": "You can't grant a permission you don't hold yourself.",
  "protected-keeps-critical": "The protected role always keeps this — it's the role that can put things right.",
  "last-critical-holder": "No active role would hold this any more. Grant it elsewhere first.",
};

export interface GrantContext {
  role: RoleSummary;
  permissionKey: string;
  isCritical: boolean;
  /** Currently granted? Deciding a revoke needs to know. */
  granted: boolean;
  /** How many ACTIVE roles hold this key right now, including this one. */
  activeHolderCount: number;
}

/**
 * May this checkbox be toggled, and if not, why?
 *
 * Mirrors role_set_permission() and guard_critical_grant_revoke() in sql/19,
 * in the same order.
 */
export function refusalForGrantToggle(context: RoleAuthorityContext, grant: GrantContext): GrantRefusal {
  if (!context.canManageRoles && !context.isProtected) return "no-permission";

  if (!context.isProtected) {
    if (context.myRank === null) return "no-permission";
    if (grant.role.rank <= context.myRank) return "outranked";
  }

  // Granting: you may only hand out what you hold. Protected actors are exempt
  // because somebody has to be able to grant the first of everything.
  if (!grant.granted) {
    if (!context.isProtected && !context.heldKeys.includes(grant.permissionKey)) {
      return "not-held-by-you";
    }
    return null;
  }

  // Revoking a critical key has two further rules, and the protected one comes
  // first because it is absolute rather than conditional.
  if (grant.isCritical) {
    if (grant.role.protected) return "protected-keeps-critical";
    if (grant.activeHolderCount <= 1 && grant.role.isActive) return "last-critical-holder";
  }

  if (!context.isProtected && !context.heldKeys.includes(grant.permissionKey)) {
    return "not-held-by-you";
  }

  return null;
}

/* =========================================================
   PRESENTATION
========================================================= */

/**
 * A rank as a word, for a picker.
 *
 * Numbers are what the database compares, but "20" means nothing on a screen.
 * The bands are deliberately coarse: a dealership does not need eleven tiers,
 * and a free-text number invites somebody to type 15 and wonder why it sits
 * between two things.
 */
export const RANK_BANDS = [
  { rank: 10, label: "Administrator", hint: "Can manage staff and settings" },
  { rank: 20, label: "Manager", hint: "Runs a team or a showroom" },
  { rank: 30, label: "Staff", hint: "Day-to-day work in one or more modules" },
  { rank: 60, label: "Limited", hint: "A narrow slice of the system" },
  { rank: 90, label: "Read-only", hint: "Can look, cannot change" },
] as const;

export function rankLabel(rank: number): string {
  if (rank === 0) return "Owner";

  // The nearest band at or below the rank, so an unlisted value still reads
  // sensibly rather than falling through to nothing.
  let best = RANK_BANDS[RANK_BANDS.length - 1];
  for (const band of RANK_BANDS) {
    if (rank >= band.rank) best = band;
  }
  return best.label;
}

/** Groups permission keys by their module, keeping the order given. */
export function groupByModule<T extends { module: string }>(items: readonly T[]): { module: string; items: T[] }[] {
  const groups: { module: string; items: T[] }[] = [];
  const index = new Map<string, number>();

  for (const item of items) {
    const at = index.get(item.module);
    if (at === undefined) {
      index.set(item.module, groups.length);
      groups.push({ module: item.module, items: [item] });
    } else {
      groups[at].items.push(item);
    }
  }

  return groups;
}
