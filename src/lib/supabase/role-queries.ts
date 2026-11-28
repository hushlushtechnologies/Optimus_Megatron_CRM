import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import type { RoleSummary } from "@/src/lib/utils/role-authority";

/*
| Roles, permissions and the grid between them.
|
| ONE READ, NOT ONE PER CELL
|
| The matrix is roles × permissions, so a dealership with nine roles and sixty
| keys is 540 cells. Asked per cell that is 540 round trips; asked as three
| lists it is three. Everything below is three selects and a join done in
| memory.
|
| A FAILED READ IS NOT AN EMPTY MATRIX
|
| An empty grid says "nobody can do anything", which would be a terrifying and
| false thing to show. readFailed is carried separately so the screen can say
| what actually happened.
*/

export interface PermissionDefinition {
  key: string;
  module: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isCritical: boolean;
}

export interface RoleHistoryEntry {
  id: string;
  at: string;
  roleName: string | null;
  field: string;
  fromValue: string | null;
  toValue: string | null;
  actorName: string | null;
}

export interface RoleMatrix {
  roles: RoleSummary[];
  permissions: PermissionDefinition[];
  /** "<roleId>:<permissionKey>" for every grant that exists. */
  grants: Set<string>;
  /** How many ACTIVE roles hold each key — the last-holder rule needs this. */
  activeHolderCounts: Record<string, number>;
  readFailed: boolean;
  /** Set when the is_critical column is absent, i.e. sql/19 has not run. */
  setupMissing: boolean;
}

const EMPTY: RoleMatrix = {
  roles: [],
  permissions: [],
  grants: new Set(),
  activeHolderCounts: {},
  readFailed: true,
  setupMissing: false,
};

export async function getRoleMatrix(): Promise<RoleMatrix> {
  const supabase = await createClient();

  const [roleResult, permissionResult, grantResult] = await Promise.all([
    supabase
      .from("roles")
      .select("id, name, rank, protected, is_active, description")
      .order("rank", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("app_permissions")
      .select("key, module, label, description, sort_order, is_critical")
      .order("module", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase.from("role_permission_grants").select("role_id, permission"),
  ]);

  // sql/19 adds roles.is_active and app_permissions.is_critical. Without it
  // this screen cannot work at all, so it says which file to run rather than
  // rendering a matrix with half its rules missing.
  const missingColumn =
    (roleResult.error?.code === "42703" || permissionResult.error?.code === "42703") ?? false;

  if (missingColumn) {
    return { ...EMPTY, readFailed: false, setupMissing: true };
  }

  if (roleResult.error || permissionResult.error || grantResult.error) {
    console.error(
      "getRoleMatrix failed:",
      roleResult.error?.message ?? permissionResult.error?.message ?? grantResult.error?.message,
    );
    return EMPTY;
  }

  const memberCounts = await roleMemberCounts();

  const roles: RoleSummary[] = (roleResult.data ?? []).map((row) => {
    const r = row as {
      id: string;
      name: string;
      rank: number | null;
      protected: boolean | null;
      is_active: boolean | null;
      description: string | null;
    };

    return {
      id: r.id,
      name: r.name,
      rank: r.rank ?? 90,
      protected: r.protected === true,
      isActive: r.is_active !== false,
      memberCount: memberCounts.get(r.id) ?? 0,
      description: r.description,
    };
  });

  const permissions: PermissionDefinition[] = (permissionResult.data ?? []).map((row) => {
    const p = row as {
      key: string;
      module: string;
      label: string;
      description: string | null;
      sort_order: number | null;
      is_critical: boolean | null;
    };

    return {
      key: p.key,
      module: p.module,
      label: p.label,
      description: p.description,
      sortOrder: p.sort_order ?? 0,
      isCritical: p.is_critical === true,
    };
  });

  const grants = new Set<string>();
  const activeHolderCounts: Record<string, number> = {};
  const activeRoleIds = new Set(roles.filter((role) => role.isActive).map((role) => role.id));

  for (const row of grantResult.data ?? []) {
    const g = row as { role_id: string; permission: string };
    grants.add(`${g.role_id}:${g.permission}`);

    if (activeRoleIds.has(g.role_id)) {
      activeHolderCounts[g.permission] = (activeHolderCounts[g.permission] ?? 0) + 1;
    }
  }

  return { roles, permissions, grants, activeHolderCounts, readFailed: false, setupMissing: false };
}

/**
 * How many staff are in each role.
 *
 * Counted over every status except deactivated — somebody suspended is still
 * in the role, and deactivating the role under them is exactly what the
 * member-count guard in sql/19 exists to prevent.
 */
async function roleMemberCounts(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const counts = new Map<string, number>();

  const { data, error } = await supabase.from("profiles").select("role_id, status");

  if (error) {
    console.error("roleMemberCounts failed:", error.message);
    return counts;
  }

  for (const row of data ?? []) {
    const r = row as { role_id: string | null; status: string | null };
    if (!r.role_id) continue;
    if (r.status === "deactivated") continue;
    counts.set(r.role_id, (counts.get(r.role_id) ?? 0) + 1);
  }

  return counts;
}

/** The permission keys the signed-in user holds, for the grant-what-you-hold rule. */
export async function myPermissionKeys(): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_my_permissions");

  if (error) {
    console.error("myPermissionKeys failed:", error.message);
    return [];
  }

  return Array.isArray(data) ? (data as string[]) : [];
}

export async function getRoleHistory(
  limit = 60,
): Promise<{ history: RoleHistoryEntry[]; readFailed: boolean }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("role_history")
    .select("id, role_id, role_name, field, from_value, to_value, changed_by, changed_at")
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getRoleHistory failed:", error.message);
    return { history: [], readFailed: true };
  }

  const rows = (data ?? []) as unknown as {
    id: string;
    role_name: string | null;
    field: string;
    from_value: string | null;
    to_value: string | null;
    changed_by: string | null;
    changed_at: string;
  }[];

  const actorIds = [...new Set(rows.map((row) => row.changed_by).filter((id): id is string => !!id))];
  const actorNames = new Map<string, string>();

  if (actorIds.length > 0) {
    const { data: actors } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);

    for (const actor of actors ?? []) {
      const a = actor as { id: string; full_name: string | null };
      actorNames.set(a.id, a.full_name?.trim() || "A former colleague");
    }
  }

  return {
    history: rows.map((row) => ({
      id: row.id,
      at: row.changed_at,
      roleName: row.role_name,
      field: row.field,
      fromValue: row.from_value,
      toValue: row.to_value,
      actorName: row.changed_by ? (actorNames.get(row.changed_by) ?? null) : null,
    })),
    readFailed: false,
  };
}
