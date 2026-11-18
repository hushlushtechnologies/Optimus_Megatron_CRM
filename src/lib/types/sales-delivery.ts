export type DeliveryStatus = "Preparing" | "Scheduled" | "Delivered" | "Cancelled";
export type DeliveryMode = "showroom" | "address";
export type DeliveryRule = "balance_paid" | "invoice_issued";
export type DeliveryItemState = "pending" | "done" | "waived";
export type DeliveryItemAction = "done" | "undo" | "waive" | "unwaive";

/** One row of public.sales_delivery_list. Names are already resolved. */
export interface DeliveryRecord {
  id: string;
  deal_id: string;
  status: DeliveryStatus;
  planned_at: string | null;
  delivery_mode: DeliveryMode | null;
  location_id: string | null;
  location_name: string | null;
  address: string | null;
  handover_staff_id: string | null;
  handover_staff_name: string | null;
  prep_notes: string | null;
  delivered_at: string | null;
  handed_over_by_name: string | null;
  handover_notes: string | null;
  created_at: string;
  created_by_name: string | null;
  /** The delivery's version. Changes only work if nobody changed it in the meantime. */
  updated_at: string;
}

export interface DeliveryItem {
  id: string;
  label: string;
  rule: DeliveryRule | null;
  is_required: boolean;
  sort_order: number;
  state: DeliveryItemState;
  note: string | null;
  actioned_at: string | null;
  actioned_by_name: string | null;
  /** For an automatic check: whether the deal meets it right now. */
  rule_met: boolean;
  /** Ticked, waived, or met by the deal. */
  is_ready: boolean;
}

export type DealDeliveryResult =
  { status: "ok"; delivery: DeliveryRecord | null; items: DeliveryItem[] } | { status: "error" };

export interface DeliveryLookups {
  staff: { id: string; name: string }[];
  showrooms: { id: string; name: string }[];
}

export interface DeliveryTemplate {
  id: string;
  label: string;
  rule: DeliveryRule | null;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface DeliveryActionResult {
  error: string | null;
}
