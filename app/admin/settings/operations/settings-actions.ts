"use server";

import { revalidatePath } from "next/cache";
import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import {
  dealRuleSettingsSchema,
  paymentControlSettingsSchema,
  reservationSettingsSchema,
} from "@/src/lib/validation/settings-sections";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import { filsToDecimalString, toFils } from "@/src/lib/utils/sales-money";
import type { SettingsActionResult } from "@/src/lib/types/sales-pricing";

/*
|------------------------------------------------------------------------------
| Field-scoped writes to sales_settings
|------------------------------------------------------------------------------
|
| Three actions, one per settings page, each writing only the columns its own
| page shows. settings-sections.ts explains at length why the single
| all-columns action it replaces is unsafe once more than one page edits this
| row; the short version is that an all-columns write sends stale values for
| the fields the page does not show, so saving the hold length can quietly put
| the discount threshold back to what it was when the page loaded. That is not
| hypothetical — verify/scoped-writes.sql demonstrates it against a real
| Postgres, and it was reachable in Sprint 8 too whenever two people had the
| settings page open at once.
|
| WHY EACH ACTION SPELLS OUT ITS OWN .update()
|
| The obvious tidy-up here is one helper taking a patch object. I wrote it
| that way first, and checks/check-settings-write-scope.py could not read it:
| the column list arrived as a spread variable, so the script reported "cannot
| judge" and exited zero. A check that cannot see the one property that
| matters is worse than no check, because it looks like coverage.
|
| So the column list is a literal at each call site, where both a reader and
| the script can see it. The duplication is three lines of error handling; what
| it buys is that re-introducing an all-columns write fails a check instead of
| passing one.
|
| WHO MAY WRITE — deliberately unchanged from Sprint 8.
|
| Every action starts at `beginSalesAction("settings")`, the same guard the
| Sprint 8 action used, which checks the `sales.settings` permission key. The
| database checks it again through RLS, which is what makes a zero-row result
| meaningful.
|
| The Sprint 10 category key `settings.operations` governs who can OPEN these
| pages, not who can write. Making it a second write requirement was tempting —
| stricter is usually safer — but it would mean that on the day this deploys,
| anyone holding `sales.settings` and not the brand-new key loses the ability
| to change settings they could change yesterday, with the UI unable to explain
| why. It would also replace a database-enforced gate with one that exists only
| in this file. So the write gate stays where the database can see it.
|
|------------------------------------------------------------------------------
*/

/**
 * `sales_settings` holds exactly one row, keyed by a boolean `id` that is
 * always true. `.eq("id", true)` is not a typo.
 */
const SETTINGS_ROW = true;

function refresh() {
  revalidatePath("/admin/settings/operations/reservations");
  revalidatePath("/admin/settings/operations/sales");
  revalidatePath("/admin/settings/operations/payments");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/reservations");
}

/**
 * Turn the result of a scoped update into an answer.
 *
 * The zero-row case is the one worth having a function for. An RLS refusal is
 * not an error — it is an UPDATE that matched no rows. Without reading rows
 * back, a refused save would return `{ error: null }` and the page would say
 * "Settings saved" having saved nothing at all. So every action selects `id`
 * and an empty result is treated as a refusal.
 */
function settle(
  result: { data: unknown[] | null; error: { message?: string } | null },
  label: string,
): SettingsActionResult {
  if (result.error) {
    console.error(`${label} error:`, result.error);
    return { error: mapSalesDbError(result.error) };
  }
  if (!result.data || result.data.length === 0) {
    return { error: "The settings could not be saved. You may not have permission to change them." };
  }
  refresh();
  return { error: null };
}

/** Reservations page: how long a hold lasts and what deposit takes one. */
export async function updateReservationSettingsAction(input: unknown): Promise<SettingsActionResult> {
  const start = await beginSalesAction("settings");
  if (!start.ok) return { error: start.error };

  const parsed = reservationSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the settings and try again." };
  }
  const v = parsed.data;

  // A fixed deposit is money and is stored as a decimal string built from fils,
  // never from a float. A percentage is stored as typed.
  let depositValue = "0";
  if (v.depositMode === "fixed") {
    const fils = toFils(v.depositValue);
    if (fils === null) return { error: "Please check the deposit amount." };
    depositValue = filsToDecimalString(fils);
  } else if (v.depositMode === "percent") {
    depositValue = v.depositValue;
  }

  const result = await start.supabase
    .from("sales_settings")
    .update({
      reservation_default_days: v.reservationDefaultDays,
      reservation_max_days: v.reservationMaxDays,
      reservation_deposit_mode: v.depositMode,
      reservation_deposit_value: depositValue,
      updated_by: start.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", SETTINGS_ROW)
    .select("id");

  return settle(result, "updateReservationSettingsAction");
}

/** Sales page: the discount that needs no approval, and whether fees apply. */
export async function updateDealRuleSettingsAction(input: unknown): Promise<SettingsActionResult> {
  const start = await beginSalesAction("settings");
  if (!start.ok) return { error: start.error };

  const parsed = dealRuleSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the settings and try again." };
  }

  const result = await start.supabase
    .from("sales_settings")
    .update({
      discount_auto_approve_percent: parsed.data.discountAutoApprovePercent,
      fees_enabled: parsed.data.feesEnabled,
      updated_by: start.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", SETTINGS_ROW)
    .select("id");

  return settle(result, "updateDealRuleSettingsAction");
}

/** Payments page: the two financial safeguards. */
export async function updatePaymentControlSettingsAction(input: unknown): Promise<SettingsActionResult> {
  const start = await beginSalesAction("settings");
  if (!start.ok) return { error: start.error };

  const parsed = paymentControlSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the settings and try again." };
  }

  const result = await start.supabase
    .from("sales_settings")
    .update({
      confirm_min_deposit_percent: parsed.data.confirmMinDepositPercent,
      payments_require_separate_verifier: parsed.data.separateVerifier,
      updated_by: start.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", SETTINGS_ROW)
    .select("id");

  return settle(result, "updatePaymentControlSettingsAction");
}
