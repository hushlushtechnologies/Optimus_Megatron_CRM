import type { ReservationListRow } from "@/src/lib/types/reservations";
import type {
  PaymentDirection,
  PaymentKind,
  PaymentMethod,
  PaymentStatus,
  SalesDealStatus,
} from "@/src/lib/types/sales";

export interface CustomerSalesSummary {
  openDeals: number;
  completedDeals: number;
  cancelledDeals: number;
  /** Total due on completed deals. */
  purchasedTotal: number;
  /** Still to collect on confirmed deals. */
  balanceOpen: number;
  activeReservations: number;
  lastDealAt: string | null;
  currency: string;
}

export interface CustomerDealRow {
  id: string;
  deal_number: string;
  status: SalesDealStatus;
  vehicle_title: string;
  stock_id: string;
  owner_name: string | null;
  currency: string;
  proposed_price: number | null;
  agreed_price: number | null;
  total_due: number | null;
  verified_paid: number | null;
  balance_due: number | null;
  created_at: string;
}

export interface CustomerPaymentRow {
  id: string;
  deal_id: string | null;
  deal_number: string | null;
  reservation_id: string | null;
  reservation_number: string | null;
  direction: PaymentDirection;
  kind: PaymentKind;
  amount: number;
  currency: string;
  method: PaymentMethod;
  paid_on: string;
  status: PaymentStatus;
}

/** Each part is null when it couldn't be loaded, which is different from "there are none". */
export interface CustomerSalesData {
  summary: CustomerSalesSummary | null;
  deals: CustomerDealRow[] | null;
  reservations: ReservationListRow[] | null;
  payments: CustomerPaymentRow[] | null;
}
