import { createClient } from "@/src/lib/supabase/server";
import type { SalesSupabaseClient } from "@/src/lib/supabase/sales-permissions";
import type {
  ReservationDetailResult,
  ReservationListRow,
  ReservationLookupsResult,
  ReservationSettings,
  ReservationSort,
  ReservationSummary,
  ReservationTab,
} from "@/src/lib/types/reservations";
import type { ReservationSource } from "@/src/lib/types/sales";
import type { DealActivityItem } from "@/src/lib/types/sales-detail";
import { UNASSIGNED_RESERVATION_OWNER } from "@/src/lib/utils/reservation-params";
import { cleanSearchTerm, phoneDigitsForSearch } from "@/src/lib/utils/test-drive-list-filters";

export const RESERVATION_COLUMNS = [
  "id", "reservation_number", "status", "source", "is_live",
  "requested_at", "requested_by", "requested_by_name", "confirmed_at", "starts_at", "expires_at",
  "closed_at", "closed_reason", "notes", "updated_at",
  "customer_id", "customer_name", "customer_number", "customer_phone", "customer_photo_url",
  "car_id", "vehicle_title", "stock_id", "brand_name", "listed_price",
  "location_id", "location_name", "owner_id", "owner_name",
    "lead_id", "lead_number", "deal_id", "deal_number", "deposit_verified", "deposit_waived",
].join(", ");

export const RESERVATION_SORT_MAP: Record<ReservationSort, { column: string; ascending: boolean }> = {
  expiry: { column: "expires_at", ascending: true },
  oldest: { column: "requested_at", ascending: true },
  newest: { column: "requested_at", ascending: false },
  "recently-updated": { column: "updated_at", ascending: false },
};

const HISTORY_STATUSES = ["Converted", "Cancelled", "Released", "Expired", "Rejected"];

interface SettingsRow {
  currency: string;
  reservation_default_days: number | string;
  reservation_max_days: number | string;
  reservation_deposit_mode: "none" | "fixed" | "percent";
  reservation_deposit_value: number | string;
}

const SETTINGS_COLUMNS =
  "currency, reservation_default_days, reservation_max_days, reservation_deposit_mode, reservation_deposit_value";

export function toReservationSettings(row: SettingsRow): ReservationSettings {
  return {
    currency: row.currency,
    defaultDays: Number(row.reservation_default_days),
    maxDays: Number(row.reservation_max_days),
    depositMode: row.reservation_deposit_mode,
    depositValue: Number(row.reservation_deposit_value),
  };
}

interface ListQueryOptions {
  columns: string;
  search?: string;
  tab: ReservationTab;
  showroom?: string | null;
  owner?: string | null;
  source?: ReservationSource | null;
  count?: boolean;
}

export function buildReservationListQuery(supabase: SalesSupabaseClient, options: ListQueryOptions) {
  const { columns, search = "", tab, showroom = null, owner = null, source = null, count = false } = options;

  let query = supabase.from("vehicle_reservation_list").select(columns, count ? { count: "exact" } : undefined);

  if (tab === "requests") query = query.eq("status", "Requested");
  else if (tab === "active") query = query.eq("status", "Confirmed");
  else if (tab === "history") query = query.in("status", HISTORY_STATUSES);

  const term = cleanSearchTerm(search);
  if (term) {
    const like = `%${term}%`;
    const clauses = [
      `reservation_number.ilike."${like}"`,
      `customer_name.ilike."${like}"`,
      `customer_number.ilike."${like}"`,
      `vehicle_title.ilike."${like}"`,
      `stock_id.ilike."${like}"`,
      `deal_number.ilike."${like}"`,
      `lead_number.ilike."${like}"`,
    ];
    const digits = phoneDigitsForSearch(term);
    if (digits) clauses.push(`customer_phone_digits.ilike."%${digits}%"`);
    query = query.or(clauses.join(","));
  }

  if (showroom) query = query.eq("location_id", showroom);
  if (owner === UNASSIGNED_RESERVATION_OWNER) query = query.is("owner_id", null);
  else if (owner) query = query.eq("owner_id", owner);
  if (source) query = query.eq("source", source);

  return query;
}

interface GetRowsParams {
  page: number;
  pageSize: number;
  sort: ReservationSort;
  search: string;
  tab: ReservationTab;
  showroom: string | null;
  owner: string | null;
  source: ReservationSource | null;
}

/** Returns null (not an empty list) when the query fails, so the page can say so. */
export async function getReservationRows(
  params: GetRowsParams,
): Promise<{ rows: ReservationListRow[]; totalCount: number } | null> {
  const supabase = await createClient();
  const from = (params.page - 1) * params.pageSize;
  const sortConfig = RESERVATION_SORT_MAP[params.sort];

  const { data, error, count } = await buildReservationListQuery(supabase, {
    columns: RESERVATION_COLUMNS,
    search: params.search,
    tab: params.tab,
    showroom: params.showroom,
    owner: params.owner,
    source: params.source,
    count: true,
  })
    .order(sortConfig.column, { ascending: sortConfig.ascending, nullsFirst: false })
    .order("requested_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + params.pageSize - 1);

  if (error) {
    console.error("getReservationRows error:", error);
    return null;
  }
  return { rows: (data ?? []) as unknown as ReservationListRow[], totalCount: count ?? 0 };
}

export async function getReservationSummary(): Promise<ReservationSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_reservation_summary");
  if (error) {
    console.error("getReservationSummary error:", error);
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, number | string | null> | undefined;
  if (!row) return null;

  const num = (value: number | string | null | undefined) => Number(value ?? 0);
  return {
    requestsWaiting: num(row.requests_waiting),
    activeHolds: num(row.active_holds),
    expiringSoon: num(row.expiring_soon),
    convertedMonth: num(row.converted_month),
  };
}

export async function getReservationLookups(): Promise<ReservationLookupsResult> {
  try {
    const supabase = await createClient();
    const [showrooms, owners, settings] = await Promise.all([
      supabase.from("locations").select("id, name").eq("is_active", true).order("sort_order"),
      supabase.rpc("list_reservation_owners"),
      supabase.from("sales_settings").select(SETTINGS_COLUMNS).maybeSingle(),
    ]);

    [showrooms.error, owners.error, settings.error].forEach((error) => {
      if (error) console.error("getReservationLookups error:", error);
    });

    const ownerRows = (owners.data ?? []) as unknown as { id: string; full_name: string | null }[];
    const settingsRow = settings.error ? null : (settings.data as unknown as SettingsRow | null);

    return {
      failed: !!(showrooms.error || owners.error || settings.error || !settingsRow),
      lookups: {
        showrooms: showrooms.data ?? [],
        owners: ownerRows.map((owner) => ({ id: owner.id, name: owner.full_name?.trim() || "Unnamed staff" })),
        settings: settingsRow ? toReservationSettings(settingsRow) : null,
      },
    };
  } catch (error) {
    console.error("getReservationLookups threw:", error);
    return { failed: true, lookups: { showrooms: [], owners: [], settings: null } };
  }
}

interface ActivityRow {
  id: string;
  activity_type: string;
  description: string;
  changed_by: string | null;
  changed_at: string;
}

/** Everything the reservation page shows. A failed history list is shown as a gap, not as "no history". */
export async function getReservationDetail(id: string): Promise<ReservationDetailResult> {
  const supabase = await createClient();

  const [viewResult, baseResult, settingsResult, activityResult] = await Promise.all([
    supabase.from("vehicle_reservation_list").select(RESERVATION_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("vehicle_reservations").select("confirmed_by").eq("id", id).maybeSingle(),
    supabase.from("sales_settings").select(SETTINGS_COLUMNS).maybeSingle(),
    supabase
      .from("sales_activity")
      .select("id, activity_type, description, changed_by, changed_at")
      .eq("reservation_id", id)
      .order("changed_at", { ascending: false })
      .limit(200),
  ]);

  if (viewResult.error || baseResult.error || settingsResult.error || !settingsResult.data) {
    console.error("getReservationDetail error:", viewResult.error ?? baseResult.error ?? settingsResult.error);
    return { status: "error" };
  }
  if (!viewResult.data || !baseResult.data) return { status: "not_found" };

  if (activityResult.error) console.error("getReservationDetail activity error:", activityResult.error);

  const row = viewResult.data as unknown as ReservationListRow;
  const confirmedBy = (baseResult.data as unknown as { confirmed_by: string | null }).confirmed_by;
  const activities = activityResult.error ? null : ((activityResult.data ?? []) as unknown as ActivityRow[]);

  const userIds = new Set<string>();
  if (confirmedBy) userIds.add(confirmedBy);
  activities?.forEach((activity) => {
    if (activity.changed_by) userIds.add(activity.changed_by);
  });

  const { data: profiles, error: profilesError } = userIds.size
    ? await supabase.from("profiles").select("id, full_name").in("id", Array.from(userIds))
    : { data: [] as { id: string; full_name: string | null }[], error: null };
  if (profilesError) console.error("getReservationDetail names error:", profilesError);

  const personName = (userId: string | null): string =>
    userId ? (profiles?.find((p) => p.id === userId)?.full_name ?? "Unknown") : "System";

  const timeline: DealActivityItem[] | null = activities
    ? activities.map((activity) => ({
        id: activity.id,
        activity_type: activity.activity_type,
        description: activity.description,
        changedByName: personName(activity.changed_by),
        changed_at: activity.changed_at,
      }))
    : null;

  return {
    status: "ok",
    data: {
      reservation: { ...row, confirmed_by_name: confirmedBy ? personName(confirmedBy) : null },
      timeline,
      settings: toReservationSettings(settingsResult.data as unknown as SettingsRow),
    },
  };
}