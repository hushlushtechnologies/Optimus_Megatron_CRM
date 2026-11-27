import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import {
  SETTINGS_EDIT_KEYS,
  SETTINGS_PAGES,
  type SettingsCategoryId,
  type SettingsPage,
} from "@/src/lib/types/settings-registry";

/*
|--------------------------------------------------------------------------
| WHO CAN SEE AND WHO CAN CHANGE (Sprint 10, Phase 3)
|--------------------------------------------------------------------------
|
| One call to get_my_permissions(), one answer for the whole settings
| workspace — the same shape as report-permissions.ts in Sprint 9.
|
| TWO QUESTIONS, NOT ONE
|
|   May this person OPEN this page?     the module's own read key
|   May this person CHANGE it?          the category's edit key
|
| Keeping them apart matters more in settings than it did in reports. A sales
| manager often needs to know what the discount approval threshold is — it
| governs their own day — without being able to move it. Collapsing the two
| forces a choice between hiding the rule from the people it binds and
| letting them rewrite it.
|
| So read is broad and edit is narrow, and a page opened without the edit
| key renders its controls disabled with a line saying why, rather than
| disappearing.
|
| HIGH-RISK SETTINGS KEEP THEIR OWN KEY AS WELL
|
| The category key opens the door; the existing module key authorises the
| specific change. Changing a loyalty conversion rate needs
| settings.marketing AND loyalty.settings. That is deliberate: Sprint 10 is
| reorganising where settings live, and it should not become the sprint that
| quietly widened who can change what.
|
| Failing closed, as everywhere else here: a permission lookup that errors
| yields no permissions rather than all of them.
*/

export interface SettingsAccess {
  /** Page ids this person may open. */
  openable: readonly string[];
  /** Category ids this person may change anything in. */
  editable: readonly SettingsCategoryId[];
  /** Everything get_my_permissions() returned, for the specific checks. */
  keys: ReadonlySet<string>;
}

const NO_ACCESS: SettingsAccess = {
  openable: [],
  editable: [],
  keys: new Set(),
};

function pageIsOpen(page: SettingsPage, keys: ReadonlySet<string>): boolean {
  /*
   * An empty `anyOf` is a personal preference — appearance, your own
   * notification settings — which needs only a signed-in user. It is not a
   * loosening; there is nobody else's data on those pages.
   */
  if (page.anyOf.length === 0) return true;

  return page.anyOf.some((key) => keys.has(key));
}

export async function currentSettingsAccess(): Promise<SettingsAccess> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_my_permissions");

  if (error) {
    console.error("currentSettingsAccess: permission lookup failed:", error);
    return NO_ACCESS;
  }

  const keys: ReadonlySet<string> = new Set(
    Array.isArray(data) ? data.map((row) => String(row)) : [],
  );

  const editable = (
    Object.entries(SETTINGS_EDIT_KEYS) as [SettingsCategoryId, string][]
  )
    .filter(([, key]) => keys.has(key))
    .map(([category]) => category);

  return {
    openable: SETTINGS_PAGES.filter((page) => pageIsOpen(page, keys)).map((page) => page.id),
    editable,
    keys,
  };
}

/** May this person open this page at all? */
export function canOpenSettingsPage(access: SettingsAccess, id: string): boolean {
  return access.openable.includes(id);
}

/**
 * May this person change anything in this category?
 *
 * This is the door, not the specific change. A page whose values are
 * governed by a module key must check that too — see requiresAll below.
 */
export function canEditCategory(
  access: SettingsAccess,
  category: SettingsCategoryId,
): boolean {
  return access.editable.includes(category);
}

/**
 * May this person make a change that needs the category key AND a specific
 * module key?
 *
 * Both, deliberately. `settings.marketing` says someone is trusted with
 * marketing configuration; `loyalty.settings` says they are trusted with
 * what a point is worth. Sprint 10 should not become the sprint that merged
 * those by accident.
 */
export function canEditGuarded(
  access: SettingsAccess,
  category: SettingsCategoryId,
  moduleKey: string,
): boolean {
  return canEditCategory(access, category) && access.keys.has(moduleKey);
}

/**
 * The pages to show in navigation, in registry order.
 *
 * A page this person cannot open is left out entirely rather than shown
 * locked: a locked row tells them something about the business they have not
 * been given, and there is nothing they can do with it. A *planned* page is
 * different — that is shown, because the absence is ours and not theirs.
 */
export function visiblePages(access: SettingsAccess): readonly SettingsPage[] {
  return SETTINGS_PAGES.filter((page) => canOpenSettingsPage(access, page.id));
}

/**
 * Categories with at least one visible page.
 *
 * An empty category is not rendered. Showing "Marketing & Loyalty" with
 * nothing under it invites a click that goes nowhere.
 */
export function visibleCategories(access: SettingsAccess): readonly SettingsCategoryId[] {
  const seen = new Set<SettingsCategoryId>();

  for (const page of visiblePages(access)) seen.add(page.category);

  return [...seen];
}
