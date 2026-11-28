import "server-only";

import { createClient } from "@/src/lib/supabase/server";

import {
  decideModulePermission,
  type ModuleDecision,
  type ModuleSupabaseClient,
} from "@/src/lib/supabase/module-permission-core";

/*
| Key-based authorisation for callers that do not already hold a Supabase
| client — server actions, mainly. The decision itself lives in
| module-permission-core.ts, which imports nothing but types.
|
| The legacyRoles parameter is gone. See that file for why.
*/

const NOT_SIGNED_IN = "You must be signed in to do this.";

export async function requireModulePermission(
  key: string,
  deniedMessage: string,
): Promise<ModuleDecision> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { allowed: false, error: NOT_SIGNED_IN };

  return decideModulePermission(supabase as unknown as ModuleSupabaseClient, user.id, key, deniedMessage);
}

export async function hasModulePermission(key: string): Promise<boolean> {
  const { allowed } = await requireModulePermission(key, "");
  return allowed;
}
