"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/src/lib/supabase/server";
import { preferenceGroups } from "@/src/lib/types/notification-catalog";
import type { SettingsActionResult } from "@/src/lib/types/sales-pricing";

/*
|------------------------------------------------------------------------------
| Changing your own notification preferences
|------------------------------------------------------------------------------
|
| Your own, and only your own. The user id comes from the session and is never
| taken from the client, and the RLS policies in sql/15 check the same thing
| again — so even if this file were wrong, nobody could switch off somebody
| else's notifications.
|
| A mandatory group is refused here, by the check constraint in sql/15, and
| by the gate in create-notification.ts. Three places for one rule looks
| excessive until you notice they fail differently: this one gives a sentence,
| the constraint stops a hand-written insert, and the gate means that even a
| preference that somehow exists is not honoured.
|
| ON means no row. Switching something ON deletes the row rather than setting
| enabled = true, so the table only ever holds the exceptions. sql/15 explains
| why that default matters: a new staff member, and a notification type added
| next sprint, both receive without anybody having to backfill anything.
|
|------------------------------------------------------------------------------
*/

const schema = z.object({
  preferenceKey: z.string().min(1).max(64),
  enabled: z.boolean(),
});

export async function setNotificationPreferenceAction(input: unknown): Promise<SettingsActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  const { preferenceKey, enabled } = parsed.data;

  const group = preferenceGroups().find((candidate) => candidate.key === preferenceKey);
  if (!group) return { error: "That notification setting could not be found." };

  if (group.mandatory) {
    return {
      error: `${group.label} can't be switched off. ${group.mandatoryReason ?? ""}`.trim(),
    };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "You need to be signed in." };

  const result = enabled
    ? // ON is the absence of a row.
      await supabase
        .from("notification_preferences")
        .delete()
        .eq("user_id", auth.user.id)
        .eq("preference_key", preferenceKey)
    : await supabase.from("notification_preferences").upsert(
        {
          user_id: auth.user.id,
          preference_key: preferenceKey,
          enabled: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,preference_key" },
      );

  if (result.error) {
    console.error("setNotificationPreferenceAction error:", result.error);

    // 42P01: sql/15 has not been run yet.
    if (result.error.code === "42P01") {
      return {
        error:
          "Notification preferences aren't set up yet. Run sql/15-sprint-10-notification-preferences.sql in Supabase first.",
      };
    }
    // 23514: the check constraint caught a mandatory key.
    if (result.error.code === "23514") {
      return { error: `${group.label} can't be switched off.` };
    }
    return { error: "That couldn't be saved. Nothing has been changed." };
  }

  revalidatePath("/admin/settings/communications/notifications");
  return { error: null };
}
