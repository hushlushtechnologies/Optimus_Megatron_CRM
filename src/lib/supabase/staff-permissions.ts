import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { NO_STAFF_PERMISSIONS, type StaffPermissions } from "@/src/lib/types/staff";
import { isUndefinedColumnError } from "@/src/lib/utils/settings-db-errors";
import { resolveStaffGateState, type StaffGateState } from "@/src/lib/utils/staff-gate";

export type { StaffGateState };

/*
| Who may see and change staff accounts.
|
| THE FALLBACK HERE IS NOT THE SAME AS module-permissions.ts
|
| There, the fallback existed to stop three working modules from locking
| everybody out if a migration had not run. Here there is no previous
| behaviour to preserve: nothing in this system could manage staff before.
|
| The fallback exists for a different reason. sql/18 ships with its grants
| commented out, because deciding who may suspend a colleague is yours to
| make, not mine. Until you uncomment them, NOBODY holds users.view, and
| without a fallback the screen you are meant to grant permissions from would
| be unreachable by everybody — including the person who needs to open it to
| fix that.
|
| So: when the key exists and somebody holds it, the key decides. When nobody
| holds it at all, a holder of the protected role gets in. That is narrow on
| purpose, it is reported on the page itself rather than being invisible, and
| it stops applying the moment you make a real grant.
*/

interface SetupState {
  /** True when sql/16 has run — profiles.status and roles.rank exist. */
  ready: boolean;
  missing: string[];
}

export interface StaffAccess {
  permissions: StaffPermissions;
  setup: SetupState;
  /** True when the protected-role fallback is what let this person in. */
  usingProtectedRoleFallback: boolean;
}

export async function currentStaffAccess(): Promise<StaffAccess> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      permissions: NO_STAFF_PERMISSIONS,
      setup: { ready: true, missing: [] },
      usingProtectedRoleFallback: false,
    };
  }

  // roles.rank and roles.protected arrive with sql/16. If this select fails,
  // the migration has not run and the page says so rather than guessing.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, status, role_id, roles(name, rank, protected)")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return {
      permissions: NO_STAFF_PERMISSIONS,
      setup: { ready: false, missing: ["sql/16-sprint-11-staff-lifecycle.sql"] },
      usingProtectedRoleFallback: false,
    };
  }

  const role = profile?.roles as unknown as { name: string; rank: number | null; protected: boolean } | null;
  const isActive = profile?.status === "active" && profile?.role_id !== null;
  const isProtected = isActive && role?.protected === true;
  const myRank = isActive ? (role?.rank ?? null) : null;

  const { data: granted } = await supabase.rpc("get_my_permissions");
  const keys = Array.isArray(granted) ? (granted as string[]) : [];

  // Does users.view exist as a key, and does anybody hold it? Two separate
  // questions with different answers, and the fallback depends on the second.
  const [{ data: keyRow }, { count: grantCount }] = await Promise.all([
    supabase.from("app_permissions").select("key").eq("key", "users.view").maybeSingle(),
    supabase
      .from("role_permission_grants")
      .select("permission", { count: "exact", head: true })
      .eq("permission", "users.view"),
  ]);

  const missing: string[] = [];
  if (!keyRow) missing.push("sql/18-sprint-11-staff-permission-keys.sql");

  const nobodyHoldsIt = !keyRow || (grantCount ?? 0) === 0;
  const fallback = nobodyHoldsIt && isProtected;

  const holds = (key: string) => keys.includes(key) || fallback;

  return {
    permissions: {
      selfId: user.id,
      canView: holds("users.view"),
      canInvite: holds("users.invite"),
      canManage: holds("users.manage"),
      canManageRoles: holds("roles.manage"),
      myRank,
      isProtected,
    },
    setup: { ready: missing.length === 0, missing },
    usingProtectedRoleFallback: fallback,
  };
}

/* ==========================================================================
   THE ADMIN GATE
========================================================================== */

export interface StaffGate {
  state: StaffGateState;
  fullName: string | null;
  roleName: string | null;
  email: string | null;
}

/*
| Whether this person may be in the admin area at all, and why not if not.
|
| WHAT CHANGED IN SPRINT 11
|
| Before this, the gate was three conditions: a signed-in user, a profiles row,
| and a non-null role name. Status was not among them — which meant suspending
| somebody changed a badge in a list and nothing else. They kept their session,
| kept their permission keys, and kept full use of every module.
|
| "Suspending a staff member must block actual application access. Do not
| implement suspension as a decorative status badge." This is where that is
| enforced for every page under /admin at once, because the layout wraps all of
| them. The permission helpers enforce it again for server actions, and the RLS
| policies enforce it in the database.
|
| WHY IT DISTINGUISHES THE REASONS
|
| "Your account doesn't have access" is the same sentence whether somebody was
| never given a role, has been suspended, or left the company two years ago.
| Those need three different responses from the person reading it, and from
| whoever they ask about it.
|
| BEFORE sql/16 HAS RUN
|
| profiles.status does not exist yet, and the select for it fails with
| "column does not exist". That is not a reason to lock everybody out: nobody
| can be suspended before the column exists, so every account is treated as
| active. The gate degrades to exactly its old behaviour, which is correct
| rather than merely safe.
*/
export async function currentStaffGate(): Promise<StaffGate> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { state: "signed-out", fullName: null, roleName: null, email: null };

  const withStatus = await supabase
    .from("profiles")
    .select("id, full_name, role_id, status, roles(name)")
    .eq("id", user.id)
    .maybeSingle();

  let row = withStatus.data as unknown as {
    full_name: string | null;
    role_id: string | null;
    status?: string | null;
    roles: { name: string } | null;
  } | null;

  let statusKnown = true;

  if (withStatus.error) {
    if (!isUndefinedColumnError(withStatus.error)) {
      console.error("currentStaffGate failed:", withStatus.error.message);
      return { state: "no-profile", fullName: null, roleName: null, email: user.email ?? null };
    }

    // sql/16 has not run. Read what does exist and treat status as active.
    statusKnown = false;

    const fallback = await supabase
      .from("profiles")
      .select("id, full_name, role_id, roles(name)")
      .eq("id", user.id)
      .maybeSingle();

    if (fallback.error) {
      console.error("currentStaffGate fallback failed:", fallback.error.message);
      return { state: "no-profile", fullName: null, roleName: null, email: user.email ?? null };
    }

    row = fallback.data as unknown as typeof row;
  }

  const email = user.email ?? null;
  const roleName = row?.roles?.name ?? null;
  const fullName = row?.full_name ?? null;

  // The decision is resolveStaffGateState()'s, not this function's. Everything
  // above is fetching; the rule is tested on its own in test/staff-gate-test.mts.
  const state = resolveStaffGateState({
    hasUser: true,
    profile: row ? { roleId: row.role_id, roleName, status: row.status ?? null } : null,
    statusKnown,
  });

  return { state, fullName, roleName, email };
}
