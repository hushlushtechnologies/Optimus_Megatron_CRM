import "server-only";

import { createClient } from "@/src/lib/supabase/server";

/*
|------------------------------------------------------------------------------
| Reading your own notification preferences
|------------------------------------------------------------------------------
|
| Three outcomes, kept apart because the page says something different for
| each and because collapsing them is how a settings screen ends up lying:
|
|   null                the read failed. The switches must NOT be rendered —
|                       they would show everything as on, and changing one
|                       would write that wrong state back.
|   installed: false    sql/15 has not been run. Everybody gets everything,
|                       and the page says what to run.
|   disabledKeys        the real answer.
|
| The middle one is the reason this is not just a try/catch returning an empty
| array. "No preferences stored" and "the preferences table does not exist"
| both produce an empty list, and only one of them means the switches work.
|
|------------------------------------------------------------------------------
*/

export type MyNotificationPreferences =
  | { installed: false }
  | { installed: true; disabledKeys: string[] };

export async function getMyNotificationPreferences(): Promise<MyNotificationPreferences | null> {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("preference_key, enabled")
    .eq("user_id", auth.user.id);

  if (error) {
    // 42P01 is "relation does not exist": the migration has not been run.
    if (error.code === "42P01") return { installed: false };
    console.error("getMyNotificationPreferences error:", error);
    return null;
  }

  const rows = (data ?? []) as { preference_key: string; enabled: boolean }[];

  return {
    installed: true,
    // A row means off. `enabled` is false in practice, but it is read rather
    // than assumed so that a row someone set to true behaves as on.
    disabledKeys: rows.filter((row) => row.enabled !== true).map((row) => row.preference_key),
  };
}
