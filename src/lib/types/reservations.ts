import type { ReservationSource, ReservationStatus } from "@/src/lib/types/sales";
import type { DealActivityItem } from "@/src/lib/types/sales-detail";

export type ReservationTab = "requests" | "active" | "history" | "all";
export type ReservationSort = "expiry" | "oldest" | "newest" | "recently-updated";

/** One row of public.vehicle_reservation_list. Names are already resolved. */
export interface ReservationListRow {
  id: string;
  reservation_number: string;
  status: ReservationStatus;
  source: ReservationSource;
  /** A confirmed hold that has not reached its expiry yet. */
  is_live: boolean;
  requested_at: string;
  requested_by: string | null;
  requested_by_name: string | null;
  confirmed_at: string | null;
  starts_at: string | null;
  expires_at: string | null;
  closed_at: string | null;
  closed_reason: string | null;
  notes: string | null;
  updated_at: string;
  customer_id: string;
  customer_name: string;
  customer_number: string;
  customer_phone: string | null;
  customer_photo_url: string | null;
  car_id: string;
  vehicle_title: string;
  stock_id: string;
  brand_name: string | null;
  listed_price: number | null;
  location_id: string;
  location_name: string;
  owner_id: string | null;
  owner_name: string | null;
  lead_id: string | null;
  lead_number: string | null;
  deal_id: string | null;
  deal_number: string | null;
    /** Verified deposit paid on this reservation, less refunds. */
  deposit_verified: number;
  deposit_waived: boolean;
}

export interface ReservationSummary {
  requestsWaiting: number;
  activeHolds: number;
  expiringSoon: number;
  convertedMonth: number;
}

export type ReservationActionKind = "confirm" | "reject" | "cancel" | "release" | "extend" | "convert";

export interface ReservationActionResult {
  error: string | null;
  dealId?: string;
  dealNumber?: string;
  /** The reservation was linked to the customer's existing open deal instead of making a new one. */
  linkedExisting?: boolean;
}

export interface CreateReservationResult {
  error: string | null;
  reservationId?: string;
  reservationNumber?: string;
}

export interface ReservationSettings {
  defaultDays: number;
  maxDays: number;
  depositMode: "none" | "fixed" | "percent";
  depositValue: number;
  currency: string;
}

export interface ReservationLookups {
  showrooms: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  /** null when the settings couldn't be loaded. Confirming and extending are paused until they can. */
  settings: ReservationSettings | null;
}

export interface ReservationLookupsResult {
  lookups: ReservationLookups;
  failed: boolean;
}

export interface ReservationDetail extends ReservationListRow {
  confirmed_by_name: string | null;
}

export interface ReservationDetailData {
  reservation: ReservationDetail;
  /** null means the lookup failed, which is different from "nothing has happened yet". */
  timeline: DealActivityItem[] | null;
  settings: ReservationSettings;
}

export type ReservationDetailResult =
  { status: "ok"; data: ReservationDetailData } | { status: "not_found" } | { status: "error" };