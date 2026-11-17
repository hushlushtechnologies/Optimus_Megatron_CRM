export type FeeMode = "fixed" | "percent";


export interface FeeType {
  id: string;
  name: string;
  calc_mode: FeeMode;
  /** An amount for "fixed", a percentage of the net price for "percent". */
  value: number;
  is_active: boolean;
  sort_order: number;
}

/** What was charged on a deal, kept exactly as it was when the pricing was saved. */
export interface DealFee {
  id: string;
  fee_type_id: string | null;
  name: string;
  calc_mode: FeeMode;
  rate: number;
  amount: number;
}

export interface PricingExtras {
  /** null means the lookup failed, which is different from "no fees". */
  fees: DealFee[] | null;
  /** Active fee types the editor can offer. null when the lookup failed. */
  feeTypes: FeeType[] | null;
  feesEnabled: boolean | null;
}

export interface SavePricingResult {
  error: string | null;
  /** The pricing saved, but a follow-up step (approving) did not. */
  warning?: string;
}

export interface FullSalesSettings {
  currency: string;
  discountAutoApprovePercent: number;
  feesEnabled: boolean;
  reservationDefaultDays: number;
  reservationMaxDays: number;
  reservationDepositMode: "none" | "fixed" | "percent";
  reservationDepositValue: number;
  confirmMinDepositPercent: number;
  paymentsRequireSeparateVerifier: boolean;
  vatRatePercent: number | null;
}

export interface SettingsHistoryItem {
  id: string;
      entity: "settings" | "fee" | "company" | "checklist";
  changed_at: string;
  changed_by_name: string;
  changes: string[];
  
}

export interface SettingsActionResult {
  error: string | null;
}