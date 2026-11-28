import "server-only";

import { createClient } from "@/src/lib/supabase/server";

import { decideModulePermission, type ModuleDecision, type ModuleSupabaseClient } from "@/src/lib/supabase/module-permission-core";

/*
| Key-based authorisation for inventory, customers and leads, for callers that
| do not already hold a Supabase client — server actions, mainly.
|
| The decision itself lives in module-permission-core.ts, which imports nothing
| but a type. See that file for why the split exists and for the fallback's
| expiry date.
*/

const NOT_SIGNED_IN = "You must be signed in to do this.";

export async function requireModulePermission(
  key: string,
  legacyRoles: readonly string[],
  deniedMessage: string,
): Promise<ModuleDecision> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { allowed: false, error: NOT_SIGNED_IN };

  return decideModulePermission(
    supabase as unknown as ModuleSupabaseClient,
    user.id,
    key,
    legacyRoles,
    deniedMessage,
  );
}

/**
 * Does the current user hold this key? For read-shaped decisions — whether to
 * show an edit button, whether notes written by others may be edited.
 */
export async function hasModulePermission(key: string, legacyRoles: readonly string[]): Promise<boolean> {
  const { allowed } = await requireModulePermission(key, legacyRoles, "");
  return allowed;
}
