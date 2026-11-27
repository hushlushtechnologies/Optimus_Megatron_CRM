"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import { canEditCategory, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import { isUndefinedColumnError } from "@/src/lib/utils/settings-db-errors";
import { locationSchema } from "@/src/lib/validation/settings-sections";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import type { SettingsActionResult } from "@/src/lib/types/sales-pricing";

/*
|------------------------------------------------------------------------------
| Showrooms
|------------------------------------------------------------------------------
|
| `public.locations` is read by inventory, customers, leads, test drives,
| reservations, enquiries, sales and delivery — nine modules filter or file
| records by showroom. Nothing in the app can add or rename one. The rows that
| exist were put there by hand in Supabase, and a new showroom today means
| someone opening the SQL editor.
|
| So this is the one genuinely new piece of writing in this batch, and it is
| the one with the least ground under it:
|
| PERMISSION. There is no existing `locations` permission key to reuse, and no
| RLS policy for the table anywhere in this repo — the table predates these
| migrations, so whatever policies it has live in the Supabase project and are
| not visible from the code. This action therefore checks
| `settings.organization` itself, and that check is the only one I can promise.
| sql/13 adds a matching RLS policy so the database enforces the same rule; it
| only ADDS a policy and drops nothing, because policies I cannot see are
| policies I must not replace. Until it is run, this action is the whole gate.
|
| NO DELETE. Every one of those nine modules references `locations.id` with
| `on delete set null`. Deleting a showroom would not fail and would not warn:
| it would blank the location on every historical record that pointed at it, so
| a car sold last March would forget which showroom sold it, and the showroom
| breakdown in the Sprint 9 sales report would quietly move those deals into
| "no showroom". Switching a showroom off keeps all of that and removes it from
| every picker, which is what "we closed that branch" actually means.
|
|------------------------------------------------------------------------------
*/

function refresh() {
  revalidatePath("/admin/settings/organization/locations");
  // Nine modules read this table for their filters and forms.
  ["/admin/inventory", "/admin/sales", "/admin/reservations", "/admin/test-drives", "/admin/enquiries"].forEach(
    (path) => revalidatePath(path),
  );
}

export async function saveShowroomAction(input: unknown): Promise<SettingsActionResult> {
  const access = await currentSettingsAccess();
  if (!canEditCategory(access, "organization")) {
    return { error: "You don't have permission to change showrooms." };
  }

  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the showroom and try again." };
  }
  const v = parsed.data;
  const supabase = await createClient();

  /*
   * The address column may not exist (see getShowroomSettings). Writing it
   * when it is absent fails the whole statement, so it is only included when
   * the caller actually has a value for it, and a 42703 retries without it
   * rather than telling Shahida the save failed for no clear reason.
   */
  const base = { name: v.name, is_active: v.isActive, sort_order: v.sortOrder };
  const withAddress = { ...base, address: v.address === "" ? null : v.address };

  const attempt = async (payload: Record<string, unknown>) => {
    if (v.id) {
      return supabase.from("locations").update(payload).eq("id", v.id).select("id");
    }
    return supabase.from("locations").insert(payload).select("id");
  };

  let result = await attempt(withAddress);
  if (result.error && isUndefinedColumnError(result.error)) {
    result = await attempt(base);
  }

  if (result.error) {
    console.error("saveShowroomAction error:", result.error);
    return { error: mapSalesDbError(result.error) };
  }
  if (!result.data || result.data.length === 0) {
    return {
      error: v.id
        ? "That showroom could not be saved. You may not have permission to change it."
        : "The showroom could not be added. You may not have permission to add one.",
    };
  }

  refresh();
  return { error: null };
}
