/*
| The key-based decision for inventory, customers and leads.
|
| THE FALLBACK IS GONE
|
| Until Batch 5 this file dropped back to a hardcoded array of role names when
| a permission key was absent from app_permissions. That existed so deploying
| the code before running sql/17 degraded to the old behaviour instead of
| locking every member of staff out of three modules.
|
| sql/21's preflight confirmed the keys are defined and granted to every role
| the old arrays allowed, so the fallback has nothing left to do. It is removed
| rather than left dormant, because a dormant fallback is a second
| authorisation path that nobody tests and that quietly becomes the live one
| the first time get_my_permissions() has a bad day.
|
| WHAT HAPPENS NOW IF A KEY IS MISSING
|
| Access is refused and the reason is logged. That is the correct behaviour for
| an authorisation system: a permission that cannot be confirmed is a
| permission that is not held. It is also loud — a missing key becomes an
| immediate, visible refusal rather than a silent downgrade to role names.
*/

export type ModuleSupabaseClient = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        single(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
        maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
};

export interface ModuleDecision {
  allowed: boolean;
  error: string | null;
}

const warned = new Set<string>();

function warnOnce(message: string, token: string) {
  if (warned.has(token)) return;
  warned.add(token);
  console.warn(message);
}

/**
 * Is this member of staff allowed to act at all right now?
 *
 * Unlike the permission lookup, this one still tolerates its function being
 * absent — and for the same reason it always did: before sql/16 runs, nobody
 * can be suspended, so there is nobody for the rule to stop. The difference is
 * that a missing PERMISSION means "not allowed", whereas a missing STATUS
 * COLUMN means "there is no status to check".
 */
export async function isActiveStaff(supabase: ModuleSupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_active_staff", { p_uid: userId });

  if (error) {
    warnOnce(
      "[permissions] is_active_staff() is not in the database — the staff status gate is inert. " +
        "Run sql/16-sprint-11-staff-lifecycle.sql to activate it.",
      "is_active_staff",
    );
    return true;
  }

  return data === true;
}

export async function decideModulePermission(
  supabase: ModuleSupabaseClient,
  userId: string,
  key: string,
  deniedMessage: string,
): Promise<ModuleDecision> {
  if (!(await isActiveStaff(supabase, userId))) {
    return { allowed: false, error: "Your account is not active. Speak to an administrator." };
  }

  const { data: granted, error } = await supabase.rpc("get_my_permissions");

  if (error) {
    console.error(`[permissions] get_my_permissions failed for "${key}":`, error.message);
    return { allowed: false, error: deniedMessage };
  }

  if (!Array.isArray(granted)) {
    console.error(`[permissions] get_my_permissions returned a non-array for "${key}"`);
    return { allowed: false, error: deniedMessage };
  }

  return (granted as string[]).includes(key)
    ? { allowed: true, error: null }
    : { allowed: false, error: deniedMessage };
}
