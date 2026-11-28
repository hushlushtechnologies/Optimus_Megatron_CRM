/*
| The key-or-array decision, taking a Supabase client rather than making one.
|
| WHY THIS FILE EXISTS SEPARATELY FROM module-permissions.ts
|
| Its sibling imports "server-only" and the cookie-backed server client, which
| is right for a server action. But two query modules that need this same
| decision — lead-notes-queries.ts and customer-detail-queries.ts — are reached
| from a Client Component (lead-detail-page-client.tsx imports notes-tab.tsx
| directly), so everything they import is bundled for the browser. Pulling
| "server-only" in through them fails the build.
|
| So the logic lives here, importing nothing but a type, and callers hand it
| the client they already have. module-permissions.ts is the thin wrapper that
| makes a client for callers who do not have one.
*/

/*
| Structural, not Supabase's own SupabaseClient generic.
|
| Importing the generated Database type here would tie this file to the schema
| and, worse, the generic resolves `from("profiles")` to `never` for a client
| typed with no schema — which is how the first version of this file failed to
| compile. Naming only the three calls this logic makes keeps it honest about
| its real requirements and lets both the cookie-backed server client and the
| admin client satisfy it.
*/
export interface ModuleSupabaseClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        single(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
        maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
}

export interface ModuleDecision {
  allowed: boolean;
  error: string | null;
}

/** Logged once per key per process, so a missing migration is visible but not noisy. */
const warned = new Set<string>();

function warnOnce(message: string, token: string) {
  if (warned.has(token)) return;
  warned.add(token);
  console.warn(message);
}

/**
 * Is this member of staff allowed to act at all right now?
 *
 * Before sql/16 runs, profiles.status and is_active_staff() do not exist, and
 * in that state the honest answer is yes: nobody can be suspended yet, so
 * there is nobody to stop. This is a check whose subject does not exist, not a
 * check failing open. After sql/16 it answers properly.
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
  legacyRoles: readonly string[],
  deniedMessage: string,
): Promise<ModuleDecision> {
  if (!(await isActiveStaff(supabase, userId))) {
    return { allowed: false, error: "Your account is not active. Speak to an administrator." };
  }

  const { data: granted, error } = await supabase.rpc("get_my_permissions");

  if (!error && Array.isArray(granted)) {
    const keys = granted as string[];
    if (keys.includes(key)) return { allowed: true, error: null };

    // The key is missing from this user's set. Two very different reasons:
    // they are not allowed, or sql/17 has not run. Ask which.
    const { data: exists } = await supabase.from("app_permissions").select("key").eq("key", key).maybeSingle();

    if (exists) return { allowed: false, error: deniedMessage };

    warnOnce(
      `[permissions] "${key}" is not in app_permissions — falling back to role names. ` +
        "Run sql/17-sprint-11-module-permission-keys.sql to complete the migration.",
      key,
    );
  } else if (error) {
    console.error(`[permissions] get_my_permissions failed for "${key}":`, error.message);
  }

  // Fallback: the pre-Sprint-11 behaviour, unchanged.
  const { data: profile } = await supabase.from("profiles").select("roles(name)").eq("id", userId).single();
  const roleName = (profile as { roles?: { name: string } | null } | null)?.roles?.name;

  if (!roleName || !legacyRoles.includes(roleName)) {
    return { allowed: false, error: deniedMessage };
  }

  return { allowed: true, error: null };
}
