export interface OwnerCandidate {
  id: string;
  name: string;
  /** Draft, negotiation and reserved deals they own. */
  openDeals: number;
  /** Confirmed deals they own that haven't been delivered yet. */
  awaitingDelivery: number;
  isCurrent: boolean;
}

export type OwnerCandidatesResult = { status: "ok"; candidates: OwnerCandidate[] } | { status: "error" };

export interface OwnerActionResult {
  error: string | null;
}

export interface AssignmentHistoryItem {
  id: string;
  previous_owner_name: string | null;
  new_owner_name: string | null;
  /** "System" when the database did it. */
  changed_by_name: string;
  changed_at: string;
  reason: string | null;
}
