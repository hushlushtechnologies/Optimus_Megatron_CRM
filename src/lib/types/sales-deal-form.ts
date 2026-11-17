export interface DealFormLookups {
  showrooms: { id: string; name: string }[];
  owners: { id: string; name: string }[];
}

/** What the database says about a vehicle for the deal being created. Counts and numbers only, no names. */
export interface VehicleDealContext {
  holderStatus: "Reserved" | "Confirmed" | "Completed" | null;
  holderDealNumber: string | null;
  openDeals: number;
  reservationNumber: string | null;
  reservationExpiresAt: string | null;
  customerOpenDealNumber: string | null;
  leadDealNumber: string | null;
  listedPrice: number | null;
}

export type VehicleDealContextResult = { status: "ok"; context: VehicleDealContext } | { status: "error" };

export interface CreateDealResult {
  error: string | null;
  dealId?: string;
  dealNumber?: string;
}

/** The numbers shown for pricing. Every amount is whole fils, never a floating-point number. */
export interface DealPricing {
  proposedFils: bigint | null;
  discountFils: bigint;
  netFils: bigint | null;
  listedFils: bigint | null;
  /** Discount as basis points of the proposed price (100 = 1%). */
  discountBps: number | null;
  thresholdBps: number;
  needsApproval: boolean;
  /** Proposed price minus listed price. Negative means below list. */
  vsListedFils: bigint | null;
}