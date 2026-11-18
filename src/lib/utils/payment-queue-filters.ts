import {
  EMPTY_PAYMENT_FILTERS,
  PAYMENT_FILTER_PARAM_KEYS,
  PAYMENT_SORTS,
  type PaymentQueueFilters,
  type PaymentSortId,
  type PaymentSortOption,
} from "@/src/lib/types/payment-queue";
import type { PaymentDirection, PaymentKind, PaymentMethod } from "@/src/lib/types/sales";
import { readParam } from "@/src/lib/utils/test-drive-list-filters";

/*
|--------------------------------------------------------------------------
| PAYMENT QUEUE FILTERS
|--------------------------------------------------------------------------
|
| Pure functions, no server imports, so the page and the client component can
| share one definition of what a filter means. Anything the URL can't be
| trusted to hold — a method that doesn't exist, a date that isn't a date, an
| amount with letters in it — is dropped rather than passed to the database.
*/

type RawParams = Record<string, string | string[] | undefined>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_RE = /^\d{1,12}(\.\d{1,2})?$/;

const METHODS: PaymentMethod[] = ["Cash", "Card", "Bank Transfer", "Cheque", "Finance Company", "Other"];

const KINDS: PaymentKind[] = ["Reservation Deposit", "Deposit", "Instalment", "Balance", "Refund"];

const DIRECTIONS: PaymentDirection[] = ["in", "out"];

/* =========================================================
   VALUE READERS
========================================================= */

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | "" {
  return (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

function asDate(value: string): string {
  if (!DATE_RE.test(value)) return "";

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "";

  return value;
}

function asAmount(value: string): string {
  return AMOUNT_RE.test(value) ? value : "";
}

/* =========================================================
   PARSE
========================================================= */

/** Turns raw URL values into filters that are safe to query with. */
export function parsePaymentFilters(params: RawParams): PaymentQueueFilters {
  const recordedBy = readParam(params, "by");

  const from = asDate(readParam(params, "from"));
  const to = asDate(readParam(params, "to"));

  const minAmount = asAmount(readParam(params, "min"));
  const maxAmount = asAmount(readParam(params, "max"));

  /*
   * A backwards range would return nothing and look like a bug rather than a
   * typo, so the pair is kept only when it makes sense. The same for amounts.
   */
  const datesValid = from === "" || to === "" || from <= to;
  const amountsValid = minAmount === "" || maxAmount === "" || Number(minAmount) <= Number(maxAmount);

  return {
    method: oneOf(readParam(params, "method"), METHODS),
    kind: oneOf(readParam(params, "kind"), KINDS),
    direction: oneOf(readParam(params, "direction"), DIRECTIONS),
    recordedBy: UUID_RE.test(recordedBy) ? recordedBy.toLowerCase() : "",
    from: datesValid ? from : "",
    to: datesValid ? to : "",
    minAmount: amountsValid ? minAmount : "",
    maxAmount: amountsValid ? maxAmount : "",
  };
}

/** The sort asked for, or the sensible default for this tab. */
export function parsePaymentSort(raw: string, awaitingTab: boolean): PaymentSortOption {
  const found = PAYMENT_SORTS.find((option) => option.id === raw);
  if (found) return found;

  /*
   * Awaiting verification is a work queue, so the longest wait comes first.
   * Every other tab is a record of what happened, so the newest comes first.
   */
  const fallback: PaymentSortId = awaitingTab ? "oldest" : "newest";
  return PAYMENT_SORTS.find((option) => option.id === fallback) ?? PAYMENT_SORTS[0];
}

/* =========================================================
   COUNT AND WRITE
========================================================= */

export function countActivePaymentFilters(filters: PaymentQueueFilters): number {
  return Object.values(filters).filter((value) => value !== "").length;
}

export function hasActivePaymentFilters(filters: PaymentQueueFilters): boolean {
  return countActivePaymentFilters(filters) > 0;
}

/** Writes filters onto params, deleting the keys that are no longer set. */
export function writePaymentFiltersToParams(params: URLSearchParams, filters: PaymentQueueFilters) {
  const pairs: [string, string][] = [
    ["method", filters.method],
    ["kind", filters.kind],
    ["direction", filters.direction],
    ["by", filters.recordedBy],
    ["from", filters.from],
    ["to", filters.to],
    ["min", filters.minAmount],
    ["max", filters.maxAmount],
  ];

  for (const [key, value] of pairs) {
    if (value === "") params.delete(key);
    else params.set(key, value);
  }
}

/** Removes every filter param, leaving the tab, search and sort untouched. */
export function clearPaymentFilterParams(params: URLSearchParams) {
  for (const key of PAYMENT_FILTER_PARAM_KEYS) params.delete(key);
}

export { EMPTY_PAYMENT_FILTERS };
