"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/src/lib/supabase/server";
import { canEditCategory, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import type { SettingsActionResult } from "@/src/lib/types/sales-pricing";

/*
|------------------------------------------------------------------------------
| How early staff may check a customer in
|------------------------------------------------------------------------------
|
| One number per showroom. Enforced on every check-in by
| loadCheckInOpensMinutes, so this is a real control over real behaviour.
|
| The upsert is on location_id, which is this table's key: a showroom has one
| window or none. Clearing the value deletes the row rather than writing zero,
| because zero means "only at the appointment time" and absent means "use the
| default" — two different intentions that must not collapse into one.
|
|------------------------------------------------------------------------------
*/

const schema = z.object({
  locationId: z.string().uuid(),
  /** null clears it back to the default. */
  minutes: z
    .number()
    .int("Enter a whole number of minutes.")
    .min(0, "Use 0 or more. 0 means check-in opens at the appointment time.")
    .max(1440, "Use 1440 minutes (24 hours) or less.")
    .nullable(),
});

export async function setCheckInWindowAction(input: unknown): Promise<SettingsActionResult> {
  const access = await currentSettingsAccess();
  if (!canEditCategory(access, "operations")) {
    return { error: "Changing check-in windows needs the operations settings permission." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the value and try again." };
  }
  const { locationId, minutes } = parsed.data;

  const supabase = await createClient();

  const result =
    minutes === null
      ? await supabase
          .from("test_drive_location_settings")
          .delete()
          .eq("location_id", locationId)
          .select("location_id")
      : await supabase
          .from("test_drive_location_settings")
          .upsert(
            { location_id: locationId, check_in_opens_minutes_before: minutes },
            { onConflict: "location_id" },
          )
          .select("location_id");

  if (result.error) {
    console.error("setCheckInWindowAction error:", result.error);
    return { error: mapSalesDbError(result.error) };
  }

  /*
   * A delete that matched nothing is fine — it means the showroom was already
   * on the default, which is the state being asked for. An upsert that
   * matched nothing is a refusal.
   */
  if (minutes !== null && (!result.data || result.data.length === 0)) {
    return { error: "That couldn't be saved. You may not have permission to change it." };
  }

  revalidatePath("/admin/settings/operations/test-drives");
  revalidatePath("/admin/test-drives");
  return { error: null };
}
