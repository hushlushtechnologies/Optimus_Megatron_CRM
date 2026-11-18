import type { SalesDealStatus } from "@/src/lib/types/sales";

/*
|--------------------------------------------------------------------------
| LEAD ↔ SALES INTEGRATION (Sprint 6 Phase 15)
|--------------------------------------------------------------------------
|
| The sales side of a lead, and the lead side of a deal. Deliberately small:
| the Sales module stays the place where a deal is worked on, and the Lead
| Detail page only shows enough to understand and navigate.
*/

/** One deal linked to a lead, as the Lead Detail Sales tab shows it. */
export interface LeadDealRow {
  id: string;
  deal_number: string;
  status: SalesDealStatus;
  vehicle_title: string;
  stock_id: string;
  car_id: string | null;
  owner_name: string | null;
  location_name: string | null;
  currency: string;
  proposed_price: number | null;
  agreed_price: number | null;
  total_due: number | null;
  verified_paid: number | null;
  balance_due: number | null;
  reservation_id: string | null;
  reservation_number: string | null;
  reservation_status: string | null;
  reservation_expires_at: string | null;
  created_at: string;
}

/** A deal of the same customer that is not yet linked to any lead. */
export interface LinkableDealOption {
  id: string;
  deal_number: string;
  status: SalesDealStatus;
  vehicle_title: string;
  stock_id: string;
  car_id: string | null;
  owner_name: string | null;
  created_at: string;
}

/**
 * Everything the Sales tab needs.
 *
 * `deals` is null when the lookup failed, which is different from "this lead
 * has no deals" — the tab says so rather than showing an empty state.
 */
export interface LeadSalesData {
  deals: LeadDealRow[] | null;
  /** True while at least one linked deal is still open (not Completed or Cancelled). */
  hasActiveDeal: boolean;
  /** The open deal's number, for the duplicate warning on the Create Deal action. */
  activeDealNumber: string | null;
}

export interface LinkDealResult {
  error: string | null;
  dealNumber?: string;
}
