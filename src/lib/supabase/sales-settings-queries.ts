import { createClient } from "@/src/lib/supabase/server";
import { toFeeType } from "@/src/lib/supabase/sales-pricing-queries";
import { describeSettingsChange } from "@/src/lib/utils/sales-settings-history";
import type { FeeType, FullSalesSettings, SettingsHistoryItem } from "@/src/lib/types/sales-pricing";

export interface SalesSettingsPageData {
  settings: FullSalesSettings;
  /** Every fee type, switched on or off. */
  feeTypes: FeeType[];
  /** null when the lookup failed. */
  approverRoles: string[] | null;
  /** null when the lookup failed. */
  history: SettingsHistoryItem[] | null;
}

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
  entity: "settings" | "fee" | "company" | "checklist";
  changed_by: string | null;
  changed_at: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown>;
}

export async function getSalesSettingsPageData(): Promise<
  { status: "ok"; data: SalesSettingsPageData } | { status: "error" }
> {
  const supabase = await createClient();

  const [settingsResult, typesResult, rolesResult, historyResult] = await Promise.all([
    supabase
      .from("sales_settings")
      .select(
        "currency, discount_auto_approve_percent, fees_enabled, reservation_default_days, reservation_max_days, reservation_deposit_mode, reservation_deposit_value, confirm_min_deposit_percent, payments_require_separate_verifier, vat_rate_percent",
      )
      .maybeSingle(),
    supabase
      .from("sales_fee_types")
      .select("id, name, calc_mode, value, is_active, sort_order")
      .order("sort_order")
      .order("name"),
    supabase.from("role_permission_grants").select("roles(name)").eq("permission", "sales.approve_discount"),
    supabase
      .from("sales_settings_history")
      .select("id, entity, changed_by, changed_at, old_values, new_values")
      .order("changed_at", { ascending: false })
      .limit(40),
  ]);

  if (settingsResult.error || typesResult.error || !settingsResult.data) {
    console.error("getSalesSettingsPageData error:", settingsResult.error ?? typesResult.error);
    return { status: "error" };
  }
  if (rolesResult.error) console.error("getSalesSettingsPageData roles error:", rolesResult.error);
  if (historyResult.error) console.error("getSalesSettingsPageData history error:", historyResult.error);

  const s = settingsResult.data as unknown as SettingsRow;

  const approverRoles = rolesResult.error
    ? null
    : Array.from(
        new Set(
          ((rolesResult.data ?? []) as unknown as { roles: { name: string } | { name: string }[] | null }[])
            .map((row) => (Array.isArray(row.roles) ? row.roles[0]?.name : row.roles?.name))
            .filter((name): name is string => !!name),
        ),
      ).sort();

  let history: SettingsHistoryItem[] | null = null;
  if (!historyResult.error) {
    const rows = (historyResult.data ?? []) as unknown as HistoryRow[];
    const ids = Array.from(new Set(rows.map((row) => row.changed_by).filter((id): id is string => !!id)));

    const { data: profiles, error: profilesError } = ids.length
      ? await supabase.from("profiles").select("id, full_name").in("id", ids)
      : { data: [] as { id: string; full_name: string | null }[], error: null };
    if (profilesError) console.error("getSalesSettingsPageData names error:", profilesError);

    history = rows
      .map((row) => ({
        id: row.id,
        entity: row.entity,
        changed_at: row.changed_at,
        changed_by_name: row.changed_by
          ? (profiles?.find((p) => p.id === row.changed_by)?.full_name ?? "Unknown")
          : "System",
        changes: describeSettingsChange(row.entity, row.old_values, row.new_values),
      }))
      .filter((item) => item.changes.length > 0)
      .slice(0, 12);
  }

  return {
    status: "ok",
    data: {
      settings: {
        currency: s.currency,
        discountAutoApprovePercent: Number(s.discount_auto_approve_percent),
        feesEnabled: Boolean(s.fees_enabled),
        reservationDefaultDays: Number(s.reservation_default_days),
        reservationMaxDays: Number(s.reservation_max_days),
        reservationDepositMode: s.reservation_deposit_mode,
        reservationDepositValue: Number(s.reservation_deposit_value),
        confirmMinDepositPercent: Number(s.confirm_min_deposit_percent),
        paymentsRequireSeparateVerifier: Boolean(s.payments_require_separate_verifier),
        vatRatePercent: s.vat_rate_percent === null ? null : Number(s.vat_rate_percent),
      },
      feeTypes: ((typesResult.data ?? []) as unknown as Parameters<typeof toFeeType>[0][]).map(toFeeType),
      approverRoles,
      history,
    },
  };
}
