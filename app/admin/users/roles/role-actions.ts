"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { recordStaffAuditEvent } from "@/src/lib/supabase/staff-audit";
import { currentStaffAccess } from "@/src/lib/supabase/staff-permissions";
import { roleFormSchema, roleGrantSchema, roleActiveSchema } from "@/src/lib/validation/roles";

/*
|------------------------------------------------------------------------------
| Role management and the permissions matrix
|------------------------------------------------------------------------------
|
| Every one of these calls a function in sql/19 and lets the DATABASE decide.
| The permission check at the top is so a person without roles.manage gets a
| sentence instead of a Postgres error; it is not the gate.
|
| What the database refuses, whatever this file does:
|
|   deleting a role                           always
|   deactivating the protected role           always
|   changing the protected role's rank        always
|   deactivating a role with staff in it      always
|   assigning an inactive role to anybody     always
|   revoking a critical key from the protected role   always
|   revoking the last active holder of a critical key always
|   creating or editing a role at or above your own authority
|   granting a permission you do not hold yourself
|
| THE ACTOR COMES FROM THE SESSION
|
| Same as sql/16's staff functions: the actor is an argument because
| service-role writes have no auth.uid(), and an argument is something a caller
| could lie about. So it is read from currentStaffAccess(), which reads it from
| supabase.auth.getUser() server-side, and never from FormData. The functions
| are revoked from PUBLIC, so a browser session cannot call them directly
| whatever its JWT says.
|
|------------------------------------------------------------------------------
*/

export interface RoleActionResult {
  error: string | null;
  fieldErrors?: Record<string, string>;
  roleId?: string;
}

function refresh() {
  revalidatePath("/admin/users/roles");
  revalidatePath("/admin/users");
}

/**
 * Only the deliberate refusals from sql/19 are shown verbatim. They describe
 * the rule, not the data. Anything else is reported generically, because an
 * unexpected Postgres message can carry constraint names and fragments of
 * other rows.
 */
function describeDbError(error: { code?: string; message: string }): string {
  const deliberate = new Set(["42501", "23514", "23505", "23503", "P0002"]);

  if (error.code && deliberate.has(error.code)) {
    if (error.code === "23505") return "There is already a role with that name.";
    return error.message;
  }

  console.error("role action failed unexpectedly:", error.code, error.message);
  return "That couldn't be saved. Nothing was changed.";
}

/* ==========================================================================
   CREATE AND EDIT
========================================================================== */

export async function saveRole(formData: FormData): Promise<RoleActionResult> {
  const access = await currentStaffAccess();

  if (!access.permissions.canManageRoles && !access.permissions.isProtected) {
    return { error: "You don't have permission to manage roles." };
  }

  if (access.permissions.selfId === null) return { error: "You must be signed in to do this." };

  const parsed = roleFormSchema.safeParse({
    roleId: formData.get("roleId"),
    name: formData.get("name"),
    rank: formData.get("rank"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Check the highlighted fields.", fieldErrors };
  }

  const input = parsed.data;
  const admin = createAdminClient();

  if (input.roleId) {
    const { data: before } = await admin
      .from("roles")
      .select("name, rank")
      .eq("id", input.roleId)
      .maybeSingle();

    const { error } = await admin.rpc("role_update", {
      p_actor: access.permissions.selfId,
      p_role_id: input.roleId,
      p_name: input.name,
      p_rank: input.rank,
      p_description: input.description ?? null,
    });

    if (error) return { error: describeDbError(error) };

    const previous = before as { name: string; rank: number | null } | null;

    await recordStaffAuditEvent({
      eventType: "staff_role_changed",
      actorId: access.permissions.selfId,
      summary:
        previous && previous.name !== input.name
          ? `Renamed the ${previous.name} role to ${input.name}`
          : `Updated the ${input.name} role`,
      detail: { from: previous?.name ?? null, to: input.name, rank: input.rank },
    });

    refresh();
    return { error: null, roleId: input.roleId };
  }

  const { data, error } = await admin.rpc("role_create", {
    p_actor: access.permissions.selfId,
    p_name: input.name,
    p_rank: input.rank,
    p_description: input.description ?? null,
  });

  if (error) return { error: describeDbError(error) };

  await recordStaffAuditEvent({
    eventType: "staff_role_changed",
    actorId: access.permissions.selfId,
    summary: `Created the ${input.name} role`,
    detail: { to: input.name, rank: input.rank },
  });

  refresh();
  return { error: null, roleId: typeof data === "string" ? data : undefined };
}

/* ==========================================================================
   DEACTIVATE / REACTIVATE
========================================================================== */

export async function setRoleActive(formData: FormData): Promise<RoleActionResult> {
  const access = await currentStaffAccess();

  if (!access.permissions.canManageRoles && !access.permissions.isProtected) {
    return { error: "You don't have permission to manage roles." };
  }

  if (access.permissions.selfId === null) return { error: "You must be signed in to do this." };

  const parsed = roleActiveSchema.safeParse({
    roleId: formData.get("roleId"),
    active: formData.get("active"),
  });

  if (!parsed.success) return { error: "That isn't a change this role can take." };

  const admin = createAdminClient();

  const { data: before } = await admin.from("roles").select("name").eq("id", parsed.data.roleId).maybeSingle();

  const { error } = await admin.rpc("role_set_active", {
    p_actor: access.permissions.selfId,
    p_role_id: parsed.data.roleId,
    p_active: parsed.data.active,
  });

  if (error) return { error: describeDbError(error) };

  const name = (before as { name: string } | null)?.name ?? "a role";

  await recordStaffAuditEvent({
    eventType: "staff_role_changed",
    actorId: access.permissions.selfId,
    summary: parsed.data.active ? `Brought the ${name} role back into use` : `Took the ${name} role out of use`,
    detail: { to: parsed.data.active ? "active" : "inactive" },
  });

  refresh();
  return { error: null };
}

/* ==========================================================================
   THE MATRIX
========================================================================== */

export async function toggleRolePermission(formData: FormData): Promise<RoleActionResult> {
  const access = await currentStaffAccess();

  if (!access.permissions.canManageRoles && !access.permissions.isProtected) {
    return { error: "You don't have permission to manage roles." };
  }

  if (access.permissions.selfId === null) return { error: "You must be signed in to do this." };

  const parsed = roleGrantSchema.safeParse({
    roleId: formData.get("roleId"),
    permission: formData.get("permission"),
    granted: formData.get("granted"),
  });

  if (!parsed.success) return { error: "That isn't a permission this build knows about." };

  const admin = createAdminClient();

  const { error } = await admin.rpc("role_set_permission", {
    p_actor: access.permissions.selfId,
    p_role_id: parsed.data.roleId,
    p_permission: parsed.data.permission,
    p_granted: parsed.data.granted,
  });

  if (error) return { error: describeDbError(error) };

  /*
  | No audit event is written here on purpose.
  |
  | sql/16 put an AFTER INSERT OR DELETE trigger on role_permission_grants that
  | writes role_permission_grant_history however the change was made — from
  | this action, from psql, from a migration. Writing a second record from here
  | would double every row in the history and still miss the changes made any
  | other way.
  */

  refresh();
  return { error: null };
}
