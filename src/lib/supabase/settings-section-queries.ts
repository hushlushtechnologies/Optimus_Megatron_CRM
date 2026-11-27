import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { toFeeType } from "@/src/lib/supabase/sales-pricing-queries";
import { isUndefinedColumnError } from "@/src/lib/utils/settings-db-errors";
import { describeSettingsChange } from "@/src/lib/utils/sales-settings-history";
import { inHistoryScope, type HistoryScope, type SettingsEntity } from "@/src/lib/utils/settings-history-scope";
import type { FeeType, FullSalesSettings, SettingsHistoryItem } from "@/src/lib/types/sales-pricing";

const SETTINGS_COLUMNS =
  "currency, discount_auto_approve_percent, fees_enabled, reservation_default_days, reservation_max_days, reservation_deposit_mode, reservation_deposit_value, confirm_min_deposit_percent, payments_require_separate_verifier, vat_rate_percent";

interface SettingsRow {
  currency: string;
  discount_auto_approve_percent: number | string;
  fees_enabled: boolean;
  reservation_default_days: number | string;
  reservation_max_days: number | string;
  reservation_deposit_mode: "none" | "fixed" | "percent";
  reservation_deposit_value: number | string;
  confirm_min_deposit_percent: number | string;
  payments_require_separate_verifier: boolean;
  vat_rate_percent: number | string | null;
}

interface HistoryRow {
  id: string;
  entity: SettingsEntity;
  changed_by: string | null;
  changed_at: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown>;
}

function toSettings(row: SettingsRow): FullSalesSettings {
  return {
    currency: row.currency,
    discountAutoApprovePercent: Number(row.discount_auto_approve_percent),
    feesEnabled: Boolean(row.fees_enabled),
    reservationDefaultDays: Number(row.reservation_default_days),
    reservationMaxDays: Number(row.reservation_max_days),
    reservationDepositMode: row.reservation_deposit_mode,
    reservationDepositValue: Number(row.reservation_deposit_value),
    confirmMinDepositPercent: Number(row.confirm_min_deposit_percent),
    paymentsRequireSeparateVerifier: Boolean(row.payments_require_separate_verifier),
    vatRatePercent: row.vat_rate_percent === null ? null : Number(row.vat_rate_percent),
  };
}

/** The one settings row. `{ status: "error" }` when it could not be read — never a default. */
export async function getSettingsRow(): Promise<
  { status: "ok"; settings: FullSalesSettings } | { status: "error" }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sales_settings").select(SETTINGS_COLUMNS).maybeSingle();

  if (error || !data) {
    console.error("getSettingsRow error:", error);
    return { status: "error" };
  }
  return { status: "ok", settings: toSettings(data as unknown as SettingsRow) };
}

/**
 * Recent changes for one settings page. null when the history could not be
 * read, which the pages show as an error rather than as "no changes yet" —
 * those two mean very different things to anyone auditing a safeguard.
 *
 * The row limit is applied before scoping, so a page whose fields change
 * rarely can show nothing while a busier page fills up. Raising the fetch
 * limit above the display limit gives the quiet pages a chance.
 */
export async function getScopedSettingsHistory(
  scope: HistoryScope,
  limit = 10,
): Promise<SettingsHistoryItem[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_settings_history")
    .select("id, entity, changed_by, changed_at, old_values, new_values")
    .order("changed_at", { ascending: false })
    .limit(120);

  if (error) {
    console.error("getScopedSettingsHistory error:", error);
    return null;
  }

  const rows = ((data ?? []) as unknown as HistoryRow[]).filter((row) =>
    inHistoryScope(row.entity, row.old_values, row.new_values, scope),
  );

  const ids = Array.from(new Set(rows.map((row) => row.changed_by).filter((id): id is string => !!id)));
  const { data: profiles, error: profilesError } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as { id: string; full_name: string | null }[], error: null };
  if (profilesError) console.error("getScopedSettingsHistory names error:", profilesError);

  return rows
    .map((row) => ({
      id: row.id,
      entity: row.entity,
      changed_at: row.changed_at,
      changed_by_name: row.changed_by
        ? (profiles?.find((profile) => profile.id === row.changed_by)?.full_name ?? "Unknown")
        : "System",
      changes: describeSettingsChange(row.entity, row.old_values, row.new_values),
    }))
    .filter((item) => item.changes.length > 0)
    .slice(0, limit);
}

/** Who can approve a discount above the threshold. null when the lookup failed. */
export async function getDiscountApproverRoles(): Promise<string[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_permission_grants")
    .select("roles(name)")
    .eq("permission", "sales.approve_discount");

  if (error) {
    console.error("getDiscountApproverRoles error:", error);
    return null;
  }

  return Array.from(
    new Set(
      ((data ?? []) as unknown as { roles: { name: string } | { name: string }[] | null }[])
        .map((row) => (Array.isArray(row.roles) ? row.roles[0]?.name : row.roles?.name))
        .filter((name): name is string => !!name),
    ),
  ).sort();
}

/**
 * Every fee type, switched on or off. null when the read failed.
 *
 * null is not an empty list. "No fees yet. Add one if you charge for things
 * like registration" is a reasonable thing to show someone who has no fees,
 * and a dangerous thing to show someone whose fees did not load — they would
 * reasonably conclude their fees had been wiped.
 */
export async function getFeeTypes(): Promise<FeeType[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_fee_types")
    .select("id, name, calc_mode, value, is_active, sort_order")
    .order("sort_order")
    .order("name");

  if (error) {
    console.error("getFeeTypes error:", error);
    return null;
  }
  return ((data ?? []) as unknown as Parameters<typeof toFeeType>[0][]).map(toFeeType);
}

export interface ShowroomRow {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ShowroomSettings {
  showrooms: ShowroomRow[];
  /**
   * False when `locations.address` does not exist yet. The page hides the
   * address field and says what to run, rather than showing a field whose
   * saves would fail.
   */
  addressSupported: boolean;
}

/**
 * Every showroom, active or not, in display order.
 *
 * `locations` predates the migrations in this repo and every other query in
 * the app reads only `id, name` from it, so whether it has an `address` column
 * is not knowable from the code. The wide select is tried first and a missing
 * column — and only a missing column — falls back to the narrow one.
 */
export async function getShowroomSettings(): Promise<
  { status: "ok"; data: ShowroomSettings } | { status: "error" }
> {
  const supabase = await createClient();

  const wide = await supabase
    .from("locations")
    .select("id, name, address, is_active, sort_order")
    .order("sort_order")
    .order("name");

  if (!wide.error) {
    return { status: "ok", data: { showrooms: mapShowrooms(wide.data), addressSupported: true } };
  }

  if (!isUndefinedColumnError(wide.error)) {
    console.error("getShowroomSettings error:", wide.error);
    return { status: "error" };
  }

  const narrow = await supabase
    .from("locations")
    .select("id, name, is_active, sort_order")
    .order("sort_order")
    .order("name");

  if (narrow.error) {
    console.error("getShowroomSettings narrow error:", narrow.error);
    return { status: "error" };
  }
  return { status: "ok", data: { showrooms: mapShowrooms(narrow.data), addressSupported: false } };
}

function mapShowrooms(data: unknown): ShowroomRow[] {
  const rows = (data ?? []) as {
    id: string;
    name: string | null;
    address?: string | null;
    is_active: boolean;
    sort_order: number | string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name?.trim() || "Unnamed showroom",
    address: row.address ?? null,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order ?? 0),
  }));
}
