import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { isStaffStatus, type StaffMember, type StaffStatus } from "@/src/lib/types/staff";

/*
| One member of staff, with the history of what has been done to their account.
|
| THE HISTORY IS THE POINT OF THIS PAGE
|
| Three tables, all added in sql/16 because none existed: staff_status_history,
| staff_role_history and staff_audit_events. Before this sprint, roles, grants
| and profiles were the only things in the database with no history at all —
| the three whose changes most need explaining six months later.
|
| They are written by database TRIGGERS, not by the actions. So a status change
| made in the Supabase SQL editor at midnight appears here exactly like one made
| from the button, which is what makes this an audit trail rather than a log of
| the times somebody used the interface.
|
| Role names are read from the history rows' own stored copies, not joined fresh
| from roles. Phase 8 lets a role be renamed, and "promoted to Manager" has to
| keep saying what it said at the time.
*/

export interface StaffHistoryEntry {
  id: string;
  at: string;
  kind: "status" | "role" | "event";
  summary: string;
  detail: string | null;
  reason: string | null;
  actorName: string | null;
}

export interface StaffDetail {
  staff: StaffMember | null;
  history: StaffHistoryEntry[];
  /** Separate from an empty history: a failed read must not look like "nothing happened". */
  historyReadFailed: boolean;
  notFound: boolean;
}

interface ProfileRow {
  id: string;
  staff_code: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role_id: string | null;
  status: string | null;
  phone: string | null;
  department: string | null;
  job_title: string | null;
  invited_at: string | null;
  activated_at: string | null;
  updated_at: string | null;
  status_reason: string | null;
  roles: { name: string; rank: number | null; protected: boolean } | null;
}

export async function getStaffDetail(profileId: string): Promise<StaffDetail> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, staff_code, full_name, avatar_url, role_id, status, phone, department, job_title, invited_at, activated_at, updated_at, status_reason, roles(name, rank, protected)",
    )
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    console.error("getStaffDetail failed:", error.message);
    return { staff: null, history: [], historyReadFailed: true, notFound: false };
  }

  if (!data) {
    return { staff: null, history: [], historyReadFailed: false, notFound: true };
  }

  const row = data as unknown as ProfileRow;
  const email = await emailFor(row.id);

  const staff: StaffMember = {
    id: row.id,
    staffCode: row.staff_code,
    fullName: row.full_name?.trim() || row.staff_code || "Unnamed account",
    email,
    avatarUrl: row.avatar_url,
    roleId: row.role_id,
    roleName: row.roles?.name ?? null,
    roleRank: row.roles?.rank ?? null,
    roleProtected: row.roles?.protected === true,
    status: isStaffStatus(row.status) ? (row.status as StaffStatus) : "deactivated",
    phone: row.phone,
    department: row.department,
    jobTitle: row.job_title,
    invitedAt: row.invited_at,
    activatedAt: row.activated_at,
    updatedAt: row.updated_at,
  };

  const { history, readFailed } = await getStaffHistory(profileId);

  return { staff, history, historyReadFailed: readFailed, notFound: false };
}

async function getStaffHistory(
  profileId: string,
): Promise<{ history: StaffHistoryEntry[]; readFailed: boolean }> {
  const supabase = await createClient();

  const [statusResult, roleResult, eventResult] = await Promise.all([
    supabase
      .from("staff_status_history")
      .select("id, from_status, to_status, reason, changed_by, changed_at")
      .eq("profile_id", profileId)
      .order("changed_at", { ascending: false })
      .limit(100),
    supabase
      .from("staff_role_history")
      .select("id, from_role_name, to_role_name, reason, changed_by, changed_at")
      .eq("profile_id", profileId)
      .order("changed_at", { ascending: false })
      .limit(100),
    supabase
      .from("staff_audit_events")
      .select("id, event_type, summary, detail, actor_id, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const readFailed = Boolean(statusResult.error || roleResult.error || eventResult.error);

  if (readFailed) {
    console.error(
      "getStaffHistory failed:",
      statusResult.error?.message ?? roleResult.error?.message ?? eventResult.error?.message,
    );
  }

  // Actor names in one query rather than one per row.
  const actorIds = new Set<string>();
  for (const row of statusResult.data ?? []) {
    const id = (row as { changed_by: string | null }).changed_by;
    if (id) actorIds.add(id);
  }
  for (const row of roleResult.data ?? []) {
    const id = (row as { changed_by: string | null }).changed_by;
    if (id) actorIds.add(id);
  }
  for (const row of eventResult.data ?? []) {
    const id = (row as { actor_id: string | null }).actor_id;
    if (id) actorIds.add(id);
  }

  const actorNames = new Map<string, string>();
  if (actorIds.size > 0) {
    const { data: actors } = await supabase
      .from("profiles")
      .select("id, full_name, staff_code")
      .in("id", [...actorIds]);

    for (const actor of actors ?? []) {
      const a = actor as { id: string; full_name: string | null; staff_code: string | null };
      actorNames.set(a.id, a.full_name?.trim() || a.staff_code || "A former colleague");
    }
  }

  const history: StaffHistoryEntry[] = [];

  for (const row of statusResult.data ?? []) {
    const r = row as {
      id: string;
      from_status: string | null;
      to_status: string;
      reason: string | null;
      changed_by: string | null;
      changed_at: string;
    };

    history.push({
      id: `status-${r.id}`,
      at: r.changed_at,
      kind: "status",
      summary: describeStatusChange(r.from_status, r.to_status),
      detail: null,
      reason: r.reason,
      actorName: r.changed_by ? (actorNames.get(r.changed_by) ?? null) : null,
    });
  }

  for (const row of roleResult.data ?? []) {
    const r = row as {
      id: string;
      from_role_name: string | null;
      to_role_name: string | null;
      reason: string | null;
      changed_by: string | null;
      changed_at: string;
    };

    history.push({
      id: `role-${r.id}`,
      at: r.changed_at,
      kind: "role",
      summary: r.from_role_name
        ? `Role changed from ${r.from_role_name} to ${r.to_role_name ?? "no role"}`
        : `Role set to ${r.to_role_name ?? "no role"}`,
      detail: null,
      reason: r.reason,
      actorName: r.changed_by ? (actorNames.get(r.changed_by) ?? null) : null,
    });
  }

  for (const row of eventResult.data ?? []) {
    const r = row as {
      id: string;
      event_type: string;
      summary: string;
      detail: Record<string, unknown> | null;
      actor_id: string | null;
      created_at: string;
    };

    history.push({
      id: `event-${r.id}`,
      at: r.created_at,
      kind: "event",
      summary: r.summary,
      detail: describeDetail(r.detail),
      reason: null,
      actorName: r.actor_id ? (actorNames.get(r.actor_id) ?? null) : null,
    });
  }

  history.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return { history, readFailed };
}

function describeStatusChange(from: string | null, to: string): string {
  if (!from) return `Account created as ${to}`;

  const phrases: Record<string, string> = {
    "invited>active": "Invitation accepted — account activated",
    "invited>deactivated": "Invitation withdrawn and account closed",
    "active>suspended": "Access suspended",
    "active>deactivated": "Offboarded — account closed",
    "suspended>active": "Access restored",
    "suspended>deactivated": "Offboarded while suspended",
    "deactivated>active": "Rejoined — account reopened",
  };

  return phrases[`${from}>${to}`] ?? `Status changed from ${from} to ${to}`;
}

/** Audit detail as a short readable line. Never dumps raw JSON at the reader. */
function describeDetail(detail: Record<string, unknown> | null): string | null {
  if (!detail || Object.keys(detail).length === 0) return null;

  const interesting = ["role", "department", "delivery_state", "changed_fields", "from", "to"];
  const parts: string[] = [];

  for (const key of interesting) {
    const value = detail[key];
    if (value === undefined || value === null || value === "") continue;
    const label = key.replace(/_/g, " ");
    parts.push(`${label}: ${Array.isArray(value) ? value.join(", ") : String(value)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * One email address, by id.
 *
 * Same reasoning as staff-queries.ts: email lives in auth.users, which no
 * ordinary client may read, so this is the one thing the service-role client
 * is used for. It reads id and email and nothing else, and returns null rather
 * than throwing if the key is absent.
 */
async function emailFor(userId: string): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);

    if (error) {
      console.error("emailFor failed:", error.message);
      return null;
    }

    return data?.user?.email ?? null;
  } catch (error) {
    console.error("emailFor threw:", error instanceof Error ? error.message : error);
    return null;
  }
}
