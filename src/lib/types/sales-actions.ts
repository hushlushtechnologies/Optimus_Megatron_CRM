import type { SalesDealStatus } from "@/src/lib/types/sales";

/** The three moves available now. Reserve and complete arrive with reservations and delivery. */
export type DealTransitionKind = "negotiation" | "reserve" | "confirm" | "cancel";

export interface TransitionResult {
  error: string | null;
  newStatus?: SalesDealStatus;
}

export interface CancellationReason {
  id: string;
  name: string;
  requires_detail: boolean;
}
