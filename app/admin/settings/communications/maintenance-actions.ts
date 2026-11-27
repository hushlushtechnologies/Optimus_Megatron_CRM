"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import { canEditCategory, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import type { SettingsActionResult } from "@/src/lib/types/sales-pricing";

/*
|------------------------------------------------------------------------------
| Running the maintenance jobs by hand
|------------------------------------------------------------------------------
|
| Two permission checks for one action, which is not redundancy:
|
|   here           so the button does not appear or work for the wrong person
|   in the database  inside trigger_maintenance_now(), because that function is
|                  granted to authenticated and is therefore callable straight
|                  from the API whatever this file does
|
| The database check is the one that matters. This one exists so the person
| gets a sentence rather than a raw Postgres error.
|
| Note which permission: `settings.system`, not `settings.communications`.
| The page lives under Communications because that is where the brief's
| information architecture puts scheduled reminders, but three of these four
| jobs move loyalty points and campaign states. Opening the page to read it is
| a communications matter; setting a points-expiry backlog running is not.
|
|------------------------------------------------------------------------------
*/

export async function runMaintenanceNowAction(): Promise<
  SettingsActionResult & { summary?: string }
> {
  const access = await currentSettingsAccess();
  if (!canEditCategory(access, "system")) {
    return { error: "Running the maintenance jobs needs the system settings permission." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("trigger_maintenance_now");

  if (error) {
    console.error("runMaintenanceNowAction error:", error);

    // 42883 is "function does not exist" — sql/14 has not been run.
    if (error.code === "42883") {
      return {
        error:
          "The scheduler isn't installed yet. Run sql/14-sprint-10-maintenance-scheduler.sql in Supabase first.",
      };
    }
    // 42501 is the permission check inside the function.
    if (error.code === "42501") {
      return { error: "Running the maintenance jobs needs the system settings permission." };
    }
    return { error: "The jobs could not be run. Nothing has been changed." };
  }

  const rows = (data ?? []) as { job: string; outcome: string; detail: Record<string, unknown> | null }[];

  /*
   * A run where every job failed is not a success, and must not be reported
   * as one. A run where SOME failed is reported with the count, because the
   * ones that worked did real work and saying otherwise would be wrong too.
   */
  const failed = rows.filter((row) => row.outcome === "failed");
  const skipped = rows.some((row) => row.outcome === "skipped");

  revalidatePath("/admin/settings/communications/reminders");

  if (skipped) {
    return {
      error: null,
      summary: "Another run was already going, so this one was skipped. Nothing ran twice.",
    };
  }
  if (failed.length === rows.length && rows.length > 0) {
    return { error: "Every job failed. The run history below shows what each one reported." };
  }
  if (failed.length > 0) {
    return {
      error: null,
      summary: `${rows.length - failed.length} of ${rows.length} jobs finished; ${failed.length} failed. The history below has the details.`,
    };
  }
  return { error: null, summary: `All ${rows.length} jobs finished.` };
}
