import { changedKeys } from "@/src/lib/utils/sales-settings-history";

/*
|------------------------------------------------------------------------------
| Which history belongs on which settings page
|------------------------------------------------------------------------------
|
| One Sales Settings page used to show one "Recent changes" list covering
| everything. Sprint 10 splits that page up, so each page shows the changes to
| its own fields: the Payments page should not be where you go to find out that
| the reservation hold moved, and the Reservations page should not be the place
| a weakened payment safeguard shows up.
|
| The rule each page needs is "did this change touch a column I own", so the
| scopes below are written as column lists. Two properties matter, and
| settings-history-scope-test.mts checks both:
|
|   Every writable sales_settings column appears in exactly one scope.
|
|     A column in no scope is a column whose changes appear on no page. It is
|     still recorded in sales_settings_history, but nobody looking at Settings
|     would ever see it — an audit trail you cannot reach from the screen that
|     changed it is not much of an audit trail.
|
|     A column in two scopes is reported twice, which makes a single change
|     look like two and is just as misleading in the other direction.
|
| `currency` and `vat_rate_percent` are in scopes even though no page writes
| them. They can still change by hand in SQL, and when they do the change
| should surface where someone would look for it.
|
|------------------------------------------------------------------------------
*/

export type SettingsEntity = "settings" | "fee" | "company" | "checklist";

export interface HistoryScope {
  /** Non-settings history rows this page is responsible for. */
  readonly entities: readonly SettingsEntity[];
  /** sales_settings columns this page is responsible for. */
  readonly settingsKeys: readonly string[];
}

export const RESERVATION_HISTORY: HistoryScope = {
  entities: ["settings"],
  settingsKeys: [
    "reservation_default_days",
    "reservation_max_days",
    "reservation_deposit_mode",
    "reservation_deposit_value",
  ],
};

export const SALES_HISTORY: HistoryScope = {
  entities: ["settings", "fee", "checklist"],
  settingsKeys: ["discount_auto_approve_percent", "fees_enabled", "vat_rate_percent"],
};

export const PAYMENT_HISTORY: HistoryScope = {
  entities: ["settings"],
  settingsKeys: ["confirm_min_deposit_percent", "payments_require_separate_verifier"],
};

export const COMPANY_HISTORY: HistoryScope = {
  entities: ["company"],
  settingsKeys: [],
};

export const REGIONAL_HISTORY: HistoryScope = {
  entities: ["settings"],
  settingsKeys: ["currency"],
};

/** Every scope, for the coverage check. Add a scope here when you add one above. */
export const ALL_HISTORY_SCOPES: readonly HistoryScope[] = [
  RESERVATION_HISTORY,
  SALES_HISTORY,
  PAYMENT_HISTORY,
  COMPANY_HISTORY,
  REGIONAL_HISTORY,
];

/**
 * Every column of `sales_settings` that a change could meaningfully be
 * reported for. Bookkeeping columns (`id`, `updated_at`, `updated_by`) are
 * excluded here and in changedKeys.
 */
export const SETTINGS_COLUMNS: readonly string[] = [
  "currency",
  "discount_auto_approve_percent",
  "fees_enabled",
  "reservation_default_days",
  "reservation_max_days",
  "reservation_deposit_mode",
  "reservation_deposit_value",
  "confirm_min_deposit_percent",
  "payments_require_separate_verifier",
  "vat_rate_percent",
];

/**
 * Does this history row belong on the page that owns `scope`?
 *
 * A `settings` row qualifies only when a column the scope owns actually
 * changed. A row from another entity qualifies on entity alone, because those
 * rows are about one fee or one checklist item rather than a set of columns.
 */
export function inHistoryScope(
  entity: SettingsEntity,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
  scope: HistoryScope,
): boolean {
  if (!scope.entities.includes(entity)) return false;
  if (entity !== "settings") return true;

  const owned = new Set(scope.settingsKeys);
  return changedKeys(oldValues, newValues).some((key) => owned.has(key));
}
