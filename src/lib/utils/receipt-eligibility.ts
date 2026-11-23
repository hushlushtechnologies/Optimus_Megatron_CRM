/*
|--------------------------------------------------------------------------
| MAY THIS PAYMENT HAVE A RECEIPT?
|--------------------------------------------------------------------------
|
| Pure, and separate from the query, because this is the decision that
| decides whether the dealership tells a customer in writing that it has
| their money — and a decision that needs a database connection to exercise
| is a decision that does not get tested.
|
| Two conditions, both necessary:
|
|   Verified      A Recorded payment is one employee's claim that money
|                 arrived; nobody has confirmed it. A receipt for one would
|                 assert on paper a fact this module does not yet believe,
|                 in the customer's hand, where it is hardest to withdraw.
|
|   Incoming      Money going out is a refund. A refund says the opposite
|                 thing about who owes whom, and a refund printed under the
|                 word "receipt" is worse than no document at all.
|
| The default is refusal. A status this code has not been taught about does
| NOT get a receipt — the safe direction for an unknown state is to decline,
| because every way of being wrong here ends with a document in a
| customer's hand.
*/

export type ReceiptEligibility =
  | { allowed: true }
  | { allowed: false; reason: "refund" }
  | { allowed: false; reason: "unverified"; current: string };

export interface ReceiptCandidate {
  status: string;
  direction: string;
}

export function receiptEligibility(candidate: ReceiptCandidate): ReceiptEligibility {
  /*
   * Direction is checked first on purpose. A reversed refund is both a
   * refund and unverified, and "that payment is a refund" is the more
   * useful of the two answers — fixing the verification state would not
   * make a receipt appear.
   */
  if (candidate.direction !== "in") {
    return { allowed: false, reason: "refund" };
  }

  if (candidate.status !== "Verified") {
    return { allowed: false, reason: "unverified", current: candidate.status || "unknown" };
  }

  return { allowed: true };
}

export interface ReceiptCheck {
  /** Null when the payment is missing or the lookup failed. */
  eligibility: ReceiptEligibility | null;
  /** Set when the lookup itself failed — never treated as a refusal. */
  error: string | null;
  /** True when no row came back: missing, or hidden by row-level security. */
  missing: boolean;
}

/**
 * The refusal to show the person, or null when a receipt may be issued.
 *
 * A failed lookup is neither a refusal nor an approval: it returns a
 * message saying the check could not be made. Letting a timeout fall
 * through to "allowed" would mean the control disappears exactly when the
 * database is unhealthy, which is when it is least safe to assume anything.
 */
export function receiptRefusal(check: ReceiptCheck): string | null {
  if (check.error) {
    return "The payment couldn't be checked just now, so no receipt was issued. Please try again.";
  }

  if (check.missing) return "That payment could not be found.";

  if (!check.eligibility) return "That payment could not be checked.";

  if (check.eligibility.allowed) return null;

  if (check.eligibility.reason === "refund") {
    return "That payment is a refund, so it has no receipt. A receipt records money received.";
  }

  return check.eligibility.current === "Recorded"
    ? "That payment is still awaiting verification, so a receipt can't be issued yet. Verify it first."
    : `That payment is ${check.eligibility.current.toLowerCase()}, so no receipt can be issued for it.`;
}
