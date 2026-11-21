import { REJECTION_MESSAGES, type RejectionReason } from "@/src/lib/types/offers";

/*
|--------------------------------------------------------------------------
| "NOT ELIGIBLE" VS "DEPENDS ON WHO IS BUYING"
|--------------------------------------------------------------------------
|
| Phase 15 asks Inventory for an "Eligibility Reason". The trap is that
| Inventory has no customer in mind, so every customer-dependent rule fails
| when the engine runs with a blank customer — and reporting that as "not
| eligible" would be wrong twice over:
|
|   it would tell somebody a campaign does not apply to a car when it
|   applies perfectly well to the right buyer, and
|
|   it would make the Inventory screen disagree with the Sales screen for
|   the same car and the same campaign.
|
| So the reasons are split in two. A reason about the CAR or the CAMPAIGN is
| final on Inventory — the car genuinely is not targeted, the campaign
| genuinely has ended. A reason about the CUSTOMER is unknown there, and is
| reported as such.
*/

/**
 * Reasons that depend on who is buying.
 *
 * With no customer in context these cannot be decided, so on a screen
 * without a customer they mean "unknown", not "no".
 */
const CUSTOMER_DEPENDENT: ReadonlySet<RejectionReason> = new Set<RejectionReason>([
  "customer_not_eligible",
  "customer_limit_reached",
  "assignment_required",
  "assignment_expired",
  "assignment_used",
  "code_required",
  "code_customer_limit_reached",
  /*
   * Stacking depends on what else is on the deal, and on Inventory there is
   * no deal at all — so this is unknown there for the same reason.
   */
  "blocked_by_stacking",
  "already_applied_to_deal",
]);

export type EligibilityVerdict = "eligible" | "not_eligible" | "depends_on_customer";

export interface EligibilityNote {
  verdict: EligibilityVerdict;
  /** One sentence, in the words somebody at a desk would use. */
  message: string;
}

/**
 * What to show for one campaign against one car.
 *
 * `hasCustomer` is the whole point of the signature: the same rejection
 * means different things with and without somebody buying.
 */
export function eligibilityNote(
  reason: RejectionReason,
  hasCustomer: boolean,
): EligibilityNote {
  if (!hasCustomer && CUSTOMER_DEPENDENT.has(reason)) {
    /*
     * Deliberately not the engine's own message. "This customer doesn't
     * qualify" is a sentence about a customer who is not there.
     */
    const specific: Partial<Record<RejectionReason, string>> = {
      assignment_required: "Only customers this has been assigned to can use it.",
      code_required: "The customer needs to quote a code for this.",
      customer_not_eligible: "Whether it applies depends on the customer's status and history.",
      customer_limit_reached: "Depends on how many times that customer has used it.",
      code_customer_limit_reached: "Depends on how many times that customer has used the code.",
      blocked_by_stacking: "Depends on what other discounts are on the deal.",
      already_applied_to_deal: "Depends on the deal it would be applied to.",
      assignment_expired: "Depends on the customer's own validity dates.",
      assignment_used: "Depends on whether that customer has already used it.",
    };

    return {
      verdict: "depends_on_customer",
      message: specific[reason] ?? "Whether it applies depends on the customer.",
    };
  }

  return { verdict: "not_eligible", message: REJECTION_MESSAGES[reason] };
}

/**
 * True when a reason is about the car or the campaign rather than the buyer.
 *
 * Exported so a screen can count "definitely does not apply" separately from
 * "cannot tell yet" without re-deriving the split.
 */
export function isFinalWithoutCustomer(reason: RejectionReason): boolean {
  return !CUSTOMER_DEPENDENT.has(reason);
}
