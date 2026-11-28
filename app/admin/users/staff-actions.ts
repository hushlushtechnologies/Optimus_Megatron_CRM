"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { recordStaffAuditEvent } from "@/src/lib/supabase/staff-audit";
import { currentStaffAccess } from "@/src/lib/supabase/staff-permissions";
import { changeStaffRoleSchema, changeStaffStatusSchema, editStaffSchema } from "@/src/lib/validation/staff";

/*
|------------------------------------------------------------------------------
| Editing, suspending, reactivating and offboarding a member of staff
|------------------------------------------------------------------------------
|
| WHERE THE RULES ACTUALLY LIVE
|
| Not here. Every status and role change below goes through staff_set_status()
| or staff_assign_role() in sql/16, and those two functions decide. They refuse
| self-suspension, refuse acting on an account at or above your own authority,
| refuse appointing a peer, and the triggers underneath them refuse removing the
| last active Super Admin and refuse an illegal status step.
|
| The permission check at the top of each action is NOT the gate. It is there so
| a person without users.manage gets a sentence instead of a database error. If
| you deleted every check in this file, the database would still refuse all the
| same things — that is the whole design, and it is what "implement these
| safeguards on the backend, not just the interface" asks for.
|
| THE ACTOR COMES FROM THE SESSION, NEVER FROM THE FORM
|
| staff_set_status() and staff_assign_role() take the actor as an argument
| because service-role writes have no auth.uid(). That makes the actor a
| parameter, and a parameter is something a caller could lie about.
|
| So the actor is read from currentStaffAccess(), which gets it from
| supabase.auth.getUser() server-side. It is never read from FormData, never
| taken from a hidden field, and never accepted from an argument this action
| exposes. And the functions themselves are not reachable from a browser:
| sql/16 revokes EXECUTE from PUBLIC, so only the service-role key can call
| them, and that key is server-only.
|
| OFFBOARDING DELETES NOTHING
|
| "Offboard" sets status to 'deactivated'. It does not delete the profile, the
| auth user, the sales they closed, the test drives they hosted, the payments
| they verified, the approvals they gave or any audit row. The person loses
| access; the company keeps its records. Every assignment column pointing at
| them still points at them, which is what makes last year's figures still add
| up.
|
|------------------------------------------------------------------------------
*/

export interface StaffActionResult {
  error: string | null;
  fieldErrors?: Record<string, string>;
}

function refresh(profileId?: string) {
  revalidatePath("/admin/users");
  if (profileId) revalidatePath(`/admin/users/${profileId}`);
}

/**
 * Turn a Postgres error into something a person can act on.
 *
 * The functions in sql/16 raise with deliberate, readable messages and with
 * errcode insufficient_privilege or check_violation. Those messages are safe to
 * show: they describe the rule, not the data. Anything else is reported as a
 * generic failure, because an unexpected Postgres message can carry column
 * names, constraint names and fragments of other people's rows.
 */
function describeDbError(error: { code?: string; message: string }): string {
  const expected = new Set(["42501", "23514", "P0002", "23503"]);

  if (error.code && expected.has(error.code)) return error.message;

  console.error("staff action failed with an unexpected error:", error.code, error.message);
  return "That couldn't be saved. Nothing was changed.";
}

/* ==========================================================================
   DETAILS — name, phone, department, job title
   Deliberately cannot change role or status. Those have their own actions,
   their own confirmation, and their own history.
========================================================================== */

export async function updateStaffDetails(formData: FormData): Promise<StaffActionResult> {
  const access = await currentStaffAccess();

  if (!access.permissions.canManage) {
    return { error: "You don't have permission to edit staff details." };
  }

  const parsed = editStaffSchema.safeParse({
    profileId: formData.get("profileId"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    department: formData.get("department"),
    jobTitle: formData.get("jobTitle"),
    showroomId: formData.get("showroomId"),
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

  /*
  | Authority applies to editing too, not only to suspending.
  |
  | Letting a Manager rename a Super Admin's account is a small thing that
  | matters: the staff list is how people are identified in approvals and
  | assignment, and an account whose name can be changed by someone it
  | outranks is not trustworthy as an identity. The database enforces this for
  | status and role; for plain details there is no function to lean on, so the
  | check is here and it mirrors the same rule.
  */
  const { data: targetRow } = await admin
    .from("profiles")
    .select("id, roles(rank)")
    .eq("id", input.profileId)
    .maybeSingle();

  if (!targetRow) return { error: "That staff member no longer exists." };

  const targetRank = (targetRow as unknown as { roles: { rank: number | null } | null }).roles?.rank ?? null;

  if (!access.permissions.isProtected && input.profileId !== access.permissions.selfId) {
    if (
      access.permissions.myRank === null ||
      targetRank === null ||
      targetRank <= access.permissions.myRank
    ) {
      return { error: "That account is at or above your own authority." };
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({
      full_name: input.fullName,
      phone: input.phone ?? null,
      department: input.department ?? null,
      job_title: input.jobTitle ?? null,
      showroom_id: input.showroomId ?? null,
      updated_by: access.permissions.selfId,
    })
    .eq("id", input.profileId);

  if (error) return { error: describeDbError(error) };

  await recordStaffAuditEvent({
    eventType: "staff_details_updated",
    profileId: input.profileId,
    actorId: access.permissions.selfId,
    summary: `Updated ${input.fullName}'s details`,
    detail: {
      changed_fields: ["full_name", "phone", "department", "job_title"].filter(Boolean),
      department: input.department ?? null,
    },
  });

  refresh(input.profileId);
  return { error: null };
}

/* ==========================================================================
   ROLE
========================================================================== */

export async function changeStaffRole(formData: FormData): Promise<StaffActionResult> {
  const access = await currentStaffAccess();

  if (!access.permissions.canManage) {
    return { error: "You don't have permission to change roles." };
  }

  if (access.permissions.selfId === null) {
    return { error: "You must be signed in to do this." };
  }

  const parsed = changeStaffRoleSchema.safeParse({
    profileId: formData.get("profileId"),
    roleId: formData.get("roleId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { error: "Choose a role.", fieldErrors: { roleId: "Choose a role." } };
  }

  const input = parsed.data;
  const admin = createAdminClient();

  // Read the names before the change, so the audit line says what happened
  // rather than what is now true.
  const [{ data: beforeRow }, { data: roleRow }] = await Promise.all([
    admin.from("profiles").select("full_name, roles(name)").eq("id", input.profileId).maybeSingle(),
    admin.from("roles").select("name").eq("id", input.roleId).maybeSingle(),
  ]);

  const before = beforeRow as unknown as { full_name: string | null; roles: { name: string } | null } | null;
  const toRole = (roleRow as { name: string } | null)?.name ?? "another role";

  const { error } = await admin.rpc("staff_assign_role", {
    p_actor: access.permissions.selfId,
    p_target: input.profileId,
    p_role_id: input.roleId,
    p_reason: input.reason ?? null,
  });

  if (error) return { error: describeDbError(error) };

  await recordStaffAuditEvent({
    eventType: "staff_role_changed",
    profileId: input.profileId,
    actorId: access.permissions.selfId,
    summary: `${before?.full_name ?? "A staff member"} moved from ${before?.roles?.name ?? "no role"} to ${toRole}`,
    detail: { from: before?.roles?.name ?? null, to: toRole },
  });

  refresh(input.profileId);
  return { error: null };
}

/* ==========================================================================
   STATUS — suspend, reactivate, offboard
========================================================================== */

export async function changeStaffStatus(formData: FormData): Promise<StaffActionResult> {
  const access = await currentStaffAccess();

  if (!access.permissions.canManage) {
    return { error: "You don't have permission to change staff access." };
  }

  if (access.permissions.selfId === null) {
    return { error: "You must be signed in to do this." };
  }

  const parsed = changeStaffStatusSchema.safeParse({
    profileId: formData.get("profileId"),
    status: formData.get("status"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { error: "That isn't a status this account can be set to." };
  }

  const input = parsed.data;

  /*
  | A reason is required for anything that takes access away.
  |
  | Six months from now the question is "why is this person suspended", and the
  | history is the only thing that can answer it. An empty reason makes the
  | record exist without making it useful. Restoring access does not need one:
  | "they are back" is self-explanatory.
  */
  if (input.status !== "active" && !input.reason?.trim()) {
    return {
      error: "Give a short reason — it goes in the account's history.",
      fieldErrors: { reason: "A reason is required." },
    };
  }

  const admin = createAdminClient();

  const { data: beforeRow } = await admin
    .from("profiles")
    .select("full_name, status")
    .eq("id", input.profileId)
    .maybeSingle();

  const before = beforeRow as { full_name: string | null; status: string | null } | null;

  const { error } = await admin.rpc("staff_set_status", {
    p_actor: access.permissions.selfId,
    p_target: input.profileId,
    p_status: input.status,
    p_reason: input.reason ?? null,
  });

  if (error) return { error: describeDbError(error) };

  const eventType =
    input.status === "suspended"
      ? "staff_suspended"
      : input.status === "deactivated"
        ? "staff_offboarded"
        : "staff_reactivated";

  const summaries: Record<string, string> = {
    "staff_suspended": `Suspended ${before?.full_name ?? "a staff member"}'s access`,
    "staff_offboarded": `Offboarded ${before?.full_name ?? "a staff member"} — records kept`,
    "staff_reactivated": `Restored ${before?.full_name ?? "a staff member"}'s access`,
  };

  await recordStaffAuditEvent({
    eventType,
    profileId: input.profileId,
    actorId: access.permissions.selfId,
    summary: summaries[eventType],
    detail: { from: before?.status ?? null, to: input.status },
  });

  refresh(input.profileId);
  return { error: null };
}
