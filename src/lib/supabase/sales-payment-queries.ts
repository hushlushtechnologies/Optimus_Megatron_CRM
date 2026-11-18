import "server-only";

import { createClient } from "@/src/lib/supabase/server";

import { PAYMENT_QUEUE_PAGE_SIZE } from "@/src/lib/constants/sales-payments";
import { cleanSearchTerm } from "@/src/lib/utils/test-drive-list-filters";

import type {
  PaymentExportResult,
  PaymentQueueFilters,
  PaymentQueueResult,
  PaymentRecorderOption,
  PaymentSortOption,
} from "@/src/lib/types/payment-queue";
import type { DealPayment } from "@/src/lib/types/sales-detail";
import type {
  PaymentQueueRow,
  PaymentQueueTab,
  PaymentRules,
  PaymentSummary,
} from "@/src/lib/types/sales-payments";

/* =========================================================
   TYPES
========================================================= */

/** Postgres returns numeric as a string to keep full precision. */
type PaymentRow = Omit<DealPayment, "amount"> & { amount: number | string };

type QueueRowRaw = Omit<PaymentQueueRow, "amount"> & { amount: number | string };

/**
 * The shape of a filtered select on sales_payment_list.
 *
 * Supabase's builder types are long and awkward to name, so the filter helper
 * is generic over "something with the filter methods we use". It keeps the
 * helper honest without reaching for `any`.
 */
interface FilterableQuery<T> {
  eq(column: string, value: string): T;
  in(column: string, values: readonly string[]): T;
  gte(column: string, value: string): T;
  lte(column: string, value: string): T;
  or(filters: string): T;
}

/* =========================================================
   COLUMNS
========================================================= */

const PAYMENT_COLUMNS =
  "id, kind, direction, amount, currency, method, reference, paid_on, status, status_reason, recorded_by, recorded_by_name, recorded_at, verified_by_name, verified_at, reversed_by_name, reversed_at";

const QUEUE_COLUMNS = `${PAYMENT_COLUMNS}, notes, deal_id, deal_number, reservation_id, reservation_number, customer_id, customer_name, customer_number, vehicle_title, stock_id`;

/**
 * How many payments one export may hold.
 *
 * Generous enough for a year of a busy showroom, low enough that a single
 * request can't exhaust the function's memory. The route tells the person
 * when the cap bit rather than handing them a quietly short file.
 */
export const PAYMENT_EXPORT_LIMIT = 5000;

/** How many rows the "recorded by" filter reads to build its list. */
const RECORDER_SCAN_LIMIT = 1000;

/* =========================================================
   SHARED FILTERS
========================================================= */

function applyTab<T extends FilterableQuery<T>>(query: T, tab: PaymentQueueTab): T {
  if (tab === "awaiting") return query.eq("status", "Recorded");
  if (tab === "verified") return query.eq("status", "Verified");
  if (tab === "closed") return query.in("status", ["Rejected", "Reversed"]);
  return query;
}

function applySearch<T extends FilterableQuery<T>>(query: T, search: string): T {
  const term = cleanSearchTerm(search);
  if (!term) return query;

  const like = `%${term}%`;

  return query.or(
    [
      `deal_number.ilike."${like}"`,
      `reservation_number.ilike."${like}"`,
      `reference.ilike."${like}"`,
      `customer_name.ilike."${like}"`,
      `customer_number.ilike."${like}"`,
    ].join(","),
  );
}

function applyFilters<T extends FilterableQuery<T>>(query: T, filters: PaymentQueueFilters): T {
  let next = query;

  if (filters.method) next = next.eq("method", filters.method);
  if (filters.kind) next = next.eq("kind", filters.kind);
  if (filters.direction) next = next.eq("direction", filters.direction);
  if (filters.recordedBy) next = next.eq("recorded_by", filters.recordedBy);

  if (filters.from) next = next.gte("paid_on", filters.from);
  if (filters.to) next = next.lte("paid_on", filters.to);

  if (filters.minAmount) next = next.gte("amount", filters.minAmount);
  if (filters.maxAmount) next = next.lte("amount", filters.maxAmount);

  return next;
}

function toQueueRows(data: unknown): PaymentQueueRow[] {
  return ((data ?? []) as QueueRowRaw[]).map((row) => ({ ...row, amount: Number(row.amount) }));
}

/* =========================================================
   PAYMENT RULES
========================================================= */

/**
 * The payment rules the screens need.
 *
 * A null value means the rule couldn't be loaded, which the screens treat as
 * the stricter answer rather than quietly allowing more.
 */
export async function getPaymentRules(): Promise<PaymentRules> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_settings")
    .select("payments_require_separate_verifier")
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("getPaymentRules error:", error);
    return { separateVerifier: null };
  }

  const settings = data as { payments_require_separate_verifier: boolean };

  return { separateVerifier: Boolean(settings.payments_require_separate_verifier) };
}

/* =========================================================
   RESERVATION PAYMENTS
========================================================= */

/** Deposits and refunds for one reservation, newest first. null means it couldn't be loaded. */
export async function getReservationPayments(reservationId: string): Promise<DealPayment[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_payment_list")
    .select(PAYMENT_COLUMNS)
    .eq("reservation_id", reservationId)
    .order("recorded_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("getReservationPayments error:", error);
    return null;
  }

  return ((data ?? []) as unknown as PaymentRow[]).map((row) => ({ ...row, amount: Number(row.amount) }));
}

/* =========================================================
   PAYMENT SUMMARY
========================================================= */

export async function getPaymentSummary(): Promise<PaymentSummary | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_payment_summary");

  if (error) {
    console.error("getPaymentSummary error:", error);
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, number | string | null> | undefined;

  if (!row) return null;

  const num = (value: number | string | null | undefined) => Number(value ?? 0);

  return {
    awaitingCount: num(row.awaiting_count),
    awaitingAmount: num(row.awaiting_amount),
    verifiedMonth: num(row.verified_month),
    refundsAwaiting: num(row.refunds_awaiting),
    closed30d: num(row.closed_30d),
  };
}

/* =========================================================
   RECORDED-BY OPTIONS
========================================================= */

/**
 * The people who have recorded a payment this person can see.
 *
 * Postgres has no DISTINCT through the REST API, so the most recent rows are
 * read and deduplicated here. A name that falls outside the scan simply isn't
 * offered as a shortcut — the filter still works if its id is in the URL.
 */
export async function getPaymentRecorders(): Promise<PaymentRecorderOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_payment_list")
    .select("recorded_by, recorded_by_name")
    .not("recorded_by", "is", null)
    .order("recorded_at", { ascending: false })
    .limit(RECORDER_SCAN_LIMIT);

  if (error) {
    console.error("getPaymentRecorders error:", error);
    return [];
  }

  const rows = (data ?? []) as { recorded_by: string | null; recorded_by_name: string | null }[];
  const seen = new Map<string, string>();

  for (const row of rows) {
    if (!row.recorded_by || seen.has(row.recorded_by)) continue;
    seen.set(row.recorded_by, row.recorded_by_name?.trim() || "Unknown");
  }

  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/* =========================================================
   PAYMENT QUEUE
========================================================= */

export async function getPaymentQueue(params: {
  tab: PaymentQueueTab;
  search: string;
  page: number;
  filters: PaymentQueueFilters;
  sort: PaymentSortOption;
}): Promise<PaymentQueueResult | null> {
  const supabase = await createClient();

  const from = (params.page - 1) * PAYMENT_QUEUE_PAGE_SIZE;

  const base = supabase.from("sales_payment_list").select(QUEUE_COLUMNS, { count: "exact" });

  const filtered = applyFilters(applySearch(applyTab(base, params.tab), params.search), params.filters);

  /*
   * id is the tiebreaker on every sort. Without it two payments with the same
   * timestamp can swap places between pages, so a row is seen twice and
   * another is never seen at all.
   */
  const { data, error, count } = await filtered
    .order(params.sort.column, { ascending: params.sort.ascending })
    .order("id", { ascending: true })
    .range(from, from + PAYMENT_QUEUE_PAGE_SIZE - 1);

  if (error) {
    console.error("getPaymentQueue error:", error);
    return null;
  }

  return { rows: toQueueRows(data), totalCount: count ?? 0 };
}

/* =========================================================
   EXPORT ROWS
========================================================= */

/**
 * Every payment matching the current view, for an export.
 *
 * Deliberately the same tab, search and filters as the screen, so what
 * downloads is what was on display — the commonest complaint about an export
 * is that it doesn't match what the person was looking at.
 */
export async function getPaymentExportRows(params: {
  tab: PaymentQueueTab;
  search: string;
  filters: PaymentQueueFilters;
  sort: PaymentSortOption;
}): Promise<PaymentExportResult> {
  const supabase = await createClient();

  const base = supabase.from("sales_payment_list").select(QUEUE_COLUMNS, { count: "exact" });

  const filtered = applyFilters(applySearch(applyTab(base, params.tab), params.search), params.filters);

  const { data, error, count } = await filtered
    .order(params.sort.column, { ascending: params.sort.ascending })
    .order("id", { ascending: true })
    .range(0, PAYMENT_EXPORT_LIMIT - 1);

  if (error) {
    console.error("getPaymentExportRows error:", error);
    throw new Error("Unable to read the payments for this export.");
  }

  const rows = toQueueRows(data);
  const total = count ?? rows.length;

  return { rows, total, truncated: total > rows.length };
}
