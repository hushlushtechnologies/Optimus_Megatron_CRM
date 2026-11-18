import type { PaymentDirection, PaymentKind, PaymentMethod } from "@/src/lib/types/sales";
import type { PaymentQueueRow } from "@/src/lib/types/sales-payments";

/* =========================================================
   SORTING
========================================================= */

/**
 * How the queue is ordered.
 *
 * The id travels in the URL, so these strings are part of the app's public
 * surface: renaming one breaks a link someone has bookmarked. The column and
 * direction live here rather than in the query so the label and the ordering
 * can never drift apart.
 */
export type PaymentSortId = "oldest" | "newest" | "paid_desc" | "paid_asc" | "amount_desc" | "amount_asc";

export interface PaymentSortOption {
  id: PaymentSortId;
  label: string;
  column: "recorded_at" | "paid_on" | "amount";
  ascending: boolean;
}

export const PAYMENT_SORTS: PaymentSortOption[] = [
  { id: "oldest", label: "Waiting longest", column: "recorded_at", ascending: true },
  { id: "newest", label: "Recorded most recently", column: "recorded_at", ascending: false },
  { id: "paid_desc", label: "Date paid, newest first", column: "paid_on", ascending: false },
  { id: "paid_asc", label: "Date paid, oldest first", column: "paid_on", ascending: true },
  { id: "amount_desc", label: "Amount, largest first", column: "amount", ascending: false },
  { id: "amount_asc", label: "Amount, smallest first", column: "amount", ascending: true },
];

/* =========================================================
   FILTERS
========================================================= */

/**
 * Everything the queue can be narrowed by, beyond the tab and the search box.
 *
 * Empty string means "not filtering on this", which keeps the shape flat and
 * makes it trivial to read out of and write back into URL params.
 */
export interface PaymentQueueFilters {
  method: PaymentMethod | "";
  kind: PaymentKind | "";
  direction: PaymentDirection | "";
  /** The person who recorded the payment, by user id. */
  recordedBy: string;
  /** paid_on from, inclusive. yyyy-mm-dd. */
  from: string;
  /** paid_on to, inclusive. yyyy-mm-dd. */
  to: string;
  minAmount: string;
  maxAmount: string;
}

export const EMPTY_PAYMENT_FILTERS: PaymentQueueFilters = {
  method: "",
  kind: "",
  direction: "",
  recordedBy: "",
  from: "",
  to: "",
  minAmount: "",
  maxAmount: "",
};

/**
 * Every param this screen owns.
 *
 * Clearing filters deletes exactly these and leaves the rest of the URL alone,
 * so the tab and the search term survive a "Clear all".
 */
export const PAYMENT_FILTER_PARAM_KEYS = [
  "method",
  "kind",
  "direction",
  "by",
  "from",
  "to",
  "min",
  "max",
] as const;

/* =========================================================
   OPTIONS AND RESULTS
========================================================= */

/** One choice in the "recorded by" filter. */
export interface PaymentRecorderOption {
  id: string;
  name: string;
}

export interface PaymentQueueResult {
  rows: PaymentQueueRow[];
  totalCount: number;
}

export interface PaymentExportResult {
  rows: PaymentQueueRow[];
  /** How many match before the export cap. */
  total: number;
  truncated: boolean;
}
