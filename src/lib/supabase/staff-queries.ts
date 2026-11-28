import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { isStaffStatus, type StaffMember, type StaffRoleOption, type StaffStatus } from "@/src/lib/types/staff";

/*
| Reading the staff list.
|
| WHY THE SERVICE-ROLE CLIENT APPEARS HERE AT ALL
|
| Email addresses live in auth.users, which no ordinary client can read —
| correctly, since it also holds password hashes and tokens. The staff list
| without email addresses is much less useful: email is how you tell two
| people with the same name apart, and it is the address an invitation went to.
|
| So the list is read with the normal client under RLS, and ONLY the email
| addresses are fetched with the service-role client, by id, for the rows
| already returned. The admin client never selects a password hash, a token or
| a session; it answers one question (what is this user's email) about rows the
| caller was already allowed to see.
|
| This file is server-only and so is admin.ts, so neither can reach a Client
| Component — that is enforced by the build now, not by a comment.
|
| ON FAILURE
|
| A failed read returns readFailed rather than an empty list. Sprint 9's rule:
| zero staff and "could not read the staff list" are different facts and the
| screen must be able to tell them apart. Nobody should look at a staff page
| showing "0 Active" and conclude the company has nobody working for it.
*/

export interface StaffListResult {
  staff: StaffMember[];
  roles: StaffRoleOption[];
  departments: string[];
  readFailed: boolean;
  /** Set when the failure is worth showing the person verbatim. */
  failureHint: string | null;
}

const EMPTY: StaffListResult = {
  staff: [],
  roles: [],
  departments: [],
  readFailed: true,
  failureHint: null,
};

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
  roles: { name: string; rank: number | null; protected: boolean } | null;
}

export async function getStaffList(): Promise<StaffListResult> {
  const supabase = await createClient();

  const [{ data: profileRows, error: profileError }, { data: roleRows, error: roleError }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, staff_code, full_name, avatar_url, role_id, status, phone, department, job_title, invited_at, activated_at, updated_at, roles(name, rank, protected)",
      )
      .order("full_name", { ascending: true }),
    supabase.from("roles").select("id, name, rank, protected").order("rank", { ascending: true }),
  ]);

  if (profileError || roleError) {
    console.error("getStaffList failed:", profileError?.message ?? roleError?.message);
    return { ...EMPTY, failureHint: profileError?.message ?? roleError?.message ?? null };
  }

  const rows = (profileRows ?? []) as unknown as ProfileRow[];

  const emails = await emailsFor(rows.map((row) => row.id));

  const staff: StaffMember[] = rows.map((row) => ({
    id: row.id,
    staffCode: row.staff_code,
    // A profile with no name still has to be findable and actionable, so it
    // gets its code rather than an empty cell.
    fullName: row.full_name?.trim() || row.staff_code || "Unnamed account",
    email: emails.get(row.id) ?? null,
    avatarUrl: row.avatar_url,
    roleId: row.role_id,
    roleName: row.roles?.name ?? null,
    roleRank: row.roles?.rank ?? null,
    roleProtected: row.roles?.protected === true,
    status: normaliseStatus(row.status),
    phone: row.phone,
    department: row.department,
    jobTitle: row.job_title,
    invitedAt: row.invited_at,
    activatedAt: row.activated_at,
    updatedAt: row.updated_at,
  }));

  const memberCounts = new Map<string, number>();
  for (const member of staff) {
    if (member.roleId) memberCounts.set(member.roleId, (memberCounts.get(member.roleId) ?? 0) + 1);
  }

  const roles: StaffRoleOption[] = (roleRows ?? []).map((row) => {
    const r = row as { id: string; name: string; rank: number | null; protected: boolean | null };
    return {
      id: r.id,
      name: r.name,
      rank: r.rank ?? 90,
      protected: r.protected === true,
      memberCount: memberCounts.get(r.id) ?? 0,
    };
  });

  const departments = [...new Set(staff.map((m) => m.department).filter((d): d is string => !!d?.trim()))].sort(
    (a, b) => a.localeCompare(b),
  );

  return { staff, roles, departments, readFailed: false, failureHint: null };
}

/**
 * An unrecognised status is shown as deactivated rather than guessed as
 * active: if the database somehow holds a value this build does not know, the
 * safe reading is "cannot act", not "can do anything".
 */
function normaliseStatus(value: string | null): StaffStatus {
  if (isStaffStatus(value)) return value;
  return "deactivated";
}

/**
 * Email addresses for the given profile ids.
 *
 * Returns an empty map rather than throwing if the service-role key is not
 * configured: a staff list without email addresses is worth showing, and the
 * column renders a dash. Nothing here reads anything but id and email.
 */
async function emailsFor(ids: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (ids.length === 0) return found;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return found;

  const wanted = new Set(ids);

  try {
    const admin = createAdminClient();

    // listUsers is paged, and a dealership will outgrow one page. Stop as soon
    // as every id asked about has been found rather than walking to the end.
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        console.error("emailsFor failed:", error.message);
        return found;
      }

      const users = data?.users ?? [];
      for (const user of users) {
        if (wanted.has(user.id) && user.email) found.set(user.id, user.email);
      }

      if (users.length < 200 || found.size === wanted.size) break;
    }
  } catch (error) {
    console.error("emailsFor threw:", error instanceof Error ? error.message : error);
  }

  return found;
}
