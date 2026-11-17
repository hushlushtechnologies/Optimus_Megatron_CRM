import type { SalesDealStatus } from "@/src/lib/types/sales";
import type { SalesListRow } from "@/src/lib/types/sales-list";
import type { PaymentDirection, PaymentKind, PaymentMethod, PaymentStatus } from "@/src/lib/types/sales";
import type { VehicleDealContext } from "@/src/lib/types/sales-deal-form";

/** The list row plus everything only the detail page needs. */
export interface SalesDealDetail extends SalesListRow {
  customer_phone: string | null;
  fees_amount: number;
  tax_amount: number;
  price_approved_by_name: string | null;
  price_approved_at: string | null;
  notes: string | null;
  reserved_at: string | null;
  confirmed_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancellation_refund_note: string | null;
  created_by_name: string | null;
}

export interface DealReservation {
  id: string;
  reservation_number: string;
  status: string;
  source: string;
  starts_at: string | null;
  expires_at: string | null;
  confirmed_at: string | null;
  confirmed_by_name: string | null;
  closed_reason: string | null;
}

export interface DealPayment {
  id: string;
  kind: PaymentKind;
  direction: PaymentDirection;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  paid_on: string;
  status: PaymentStatus;
  status_reason: string | null;
  recorded_by_name: string;
  recorded_at: string;
  verified_by_name: string | null;
  verified_at: string | null;
  reversed_by_name: string | null;
  reversed_at: string | null;
    recorded_by: string | null;
}

export interface DealPriceChange {
  id: string;
  listed_price: number | null;
  proposed_price: number | null;
  discount_amount: number;
  fees_amount: number;
  tax_amount: number;
  agreed_price: number | null;
  approved_by_name: string | null;
  changed_by_name: string;
  changed_at: string;
    note: string | null;
}

export interface DealStatusChange {
  id: string;
  old_status: SalesDealStatus | null;
  new_status: SalesDealStatus;
  reason: string | null;
  changed_by_name: string;
  changed_at: string;
}

export interface DealActivityItem {
  id: string;
  activity_type: string;
  description: string;
  changedByName: string;
  changed_at: string;
}

/** The rules the page needs to explain what is still missing. */
export interface DealSettings {
  autoApprovePercent: number;
  minDepositPercent: number;
  currency: string;
}

export interface SalesDealDetailData {
  deal: SalesDealDetail;
  reservation: DealReservation | null;
  /** null means the lookup failed, which is different from "nothing has happened yet". */
  payments: DealPayment[] | null;
  priceHistory: DealPriceChange[] | null;
  statusChanges: DealStatusChange[] | null;
  timeline: DealActivityItem[] | null;
  /** Who gave the current owner this deal, and when. name is null when the system did it. */
  assignedBy: { name: string | null; at: string } | null;
  /** null when the deal is finished or the check failed. */
  vehicleContext: VehicleDealContext | null;
  settings: DealSettings;
}

export type SalesDealDetailResult =
  { status: "ok"; data: SalesDealDetailData } | { status: "not_found" } | { status: "error" };

export interface ReadinessItem {
  key: string;
  label: string;
  done: boolean;
  detail: string | null;
}

export interface ReadinessGroup {
  title: string;
  /** Not every deal goes through this step, such as reserving the vehicle. */
  optional: boolean;
  items: ReadinessItem[];
  ready: boolean;
}