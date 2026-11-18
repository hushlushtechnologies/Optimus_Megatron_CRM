import { createClient } from "@/src/lib/supabase/server";
import type { SupabaseServerClient } from "@/src/lib/supabase/test-drive-action-helpers";
import type { TestDriveListRow, TestDriveSort } from "@/src/lib/types/test-drive";
import {
  EMPTY_TEST_DRIVE_FILTERS,
  UNASSIGNED_STAFF,
  cleanSearchTerm,
  phoneDigitsForSearch,
  type TestDriveListFilters,
} from "@/src/lib/utils/test-drive-list-filters";

export const LIST_COLUMNS = [
  "id",
  "test_drive_number",
  "status",
  "scheduled_start",
  "scheduled_end",
  "duration_minutes",
  "created_at",
  "updated_at",
  "checked_in_at",
  "customer_id",
  "customer_name",
  "customer_number",
  "customer_photo_url",
  "car_id",
  "vehicle_title",
  "stock_id",
  "brand_name",
  "model_name",
  "location_id",
  "location_name",
  "assigned_staff_id",
  "staff_name",
  "lead_id",
  "lead_number",
  "request_source_name",
].join(", ");

export const SORT_MAP: Record<TestDriveSort, { column: string; ascending: boolean }> = {
  upcoming: { column: "upcoming_sort_key", ascending: true },
  newest: { column: "created_at", ascending: false },
  oldest: { column: "created_at", ascending: true },
  "recently-updated": { column: "updated_at", ascending: false },
  "date-asc": { column: "scheduled_start", ascending: true },
  "date-desc": { column: "scheduled_start", ascending: false },
};

export interface TestDriveListQueryOptions {
  columns: string;
  search?: string;
  filters?: TestDriveListFilters;
  /** false (default): active rows only. true: archived rows only. */
  archived?: boolean;
  /** Ask for the exact total as well. */
  count?: boolean;
}

/**
 * The one place that turns search and filters into a query on test_drive_list.
 * It returns the query without ordering or paging, so the table, exports and
 * bulk actions can each add their own.
 */
export function buildTestDriveListQuery(supabase: SupabaseServerClient, options: TestDriveListQueryOptions) {
  const {
    columns,
    search = "",
    filters = EMPTY_TEST_DRIVE_FILTERS,
    archived = false,
    count = false,
  } = options;

  let query = supabase.from("test_drive_list").select(columns, count ? { count: "exact" } : undefined);

  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

  // --- Search ---
  const term = cleanSearchTerm(search);
  if (term) {
    const like = `%${term}%`;
    const clauses = [
      `test_drive_number.ilike."${like}"`,
      `customer_name.ilike."${like}"`,
      `customer_number.ilike."${like}"`,
      `vehicle_title.ilike."${like}"`,
      `stock_id.ilike."${like}"`,
    ];
    const digits = phoneDigitsForSearch(term);
    if (digits) clauses.push(`customer_phone_digits.ilike."%${digits}%"`);
    query = query.or(clauses.join(","));
  }

  // --- Filters ---
  if (filters.status.length > 0) query = query.in("status", filters.status);
  if (filters.showroom) query = query.eq("location_id", filters.showroom);
  if (filters.staff === UNASSIGNED_STAFF) query = query.is("assigned_staff_id", null);
  else if (filters.staff) query = query.eq("assigned_staff_id", filters.staff);
  if (filters.from) query = query.gte("scheduled_day", filters.from);
  if (filters.to) query = query.lte("scheduled_day", filters.to);
  if (filters.brand) query = query.eq("brand_id", filters.brand);
  if (filters.model) query = query.eq("model_id", filters.model);
  if (filters.vehicle) query = query.eq("car_id", filters.vehicle);
  if (filters.source) query = query.eq("request_source_id", filters.source);
  if (filters.lead === "linked") query = query.not("lead_id", "is", null);
  if (filters.lead === "none") query = query.is("lead_id", null);
  if (filters.checkedIn === "yes") query = query.not("checked_in_at", "is", null);
  if (filters.checkedIn === "no") query = query.is("checked_in_at", null);

  return query;
}

interface GetTestDriveRowsParams {
  page: number;
  pageSize: number;
  sort: TestDriveSort;
  search?: string;
  filters?: TestDriveListFilters;
  archived?: boolean;
}

/** Returns null (not an empty list) when the query fails, so the page can say so. */
export async function getTestDriveRows({
  page,
  pageSize,
  sort,
  search,
  filters,
  archived,
}: GetTestDriveRowsParams): Promise<{ rows: TestDriveListRow[]; totalCount: number } | null> {
  const supabase = await createClient();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sortConfig = SORT_MAP[sort];

  // The extra created_at and id keys make the order fully deterministic.
  // Without them, rows that tie on the chosen sort could repeat or vanish
  // between pages.
  const { data, error, count } = await buildTestDriveListQuery(supabase, {
    columns: LIST_COLUMNS,
    search,
    filters,
    archived,
    count: true,
  })
    .order(sortConfig.column, { ascending: sortConfig.ascending })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);

  if (error) {
    console.error("getTestDriveRows error:", error);
    return null;
  }

  return { rows: (data ?? []) as unknown as TestDriveListRow[], totalCount: count ?? 0 };
}
