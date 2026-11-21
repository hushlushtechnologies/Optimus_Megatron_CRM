import type { BeginSalesResult } from "@/src/lib/supabase/sales-permissions";
import {
  notifyPointsEarned,
  notifyPointsRedeemed,
} from "@/src/lib/notifications/offer-notifications";

// Not a "use server" file. It is imported by server actions and it reaches
// the notification helpers, which use the admin client.

/*
|--------------------------------------------------------------------------
| SETTLING LOYALTY WHEN A DEAL MOVES
|--------------------------------------------------------------------------
|
| Phase 19 built earn_loyalty_points(). Phase 23 found that nothing ever
| called it: the function was defined, granted and idempotent, and no
| customer could accrue a single point, because there was no call site. The
| plan's own test flow — "Complete Eligible Sale → Verify Qualification →
| Credit Points → Update Wallet" — had no code behind its third step.
|
| This is that call site, and it is the only one. Three transitions matter:
|
|   Confirmed    may credit, if the deal_confirmed rule is enabled
|   Completed    may credit, if the deal_completed rule is enabled
|   Cancelled    takes back what the sale earned
|
| Everything else is a no-op. A deal moving to Negotiation or Reserved earns
| nothing, which is the plan's rule: no points for a lead, an enquiry or an
| unpaid reservation.
|
| WHY THIS CANNOT FAIL THE TRANSITION
|
| Every error here is caught and logged, and the caller is told nothing. A
| sale that completed must stay completed. If the credit fails, the
| recoverable state is a missing credit — and earn_loyalty_for_deal is
| idempotent, so re-running the same transition repairs it, and
| rebuild_loyalty_wallet() repairs the cache. The unrecoverable state would
| be a sale stuck half-finished because the loyalty programme had a bad day.
|
| The decisions are all in the database, not here. This module chooses which
| event to raise; whether that event pays anything is settled inside
| earn_loyalty_for_deal, under the deal's real status, the programme's
| settings and the ledger's idempotency key.
*/

type SalesClient = Extract<BeginSalesResult, { ok: true }>["supabase"];

interface SettleInput {
  supabase: SalesClient;
  dealId: string;
  toStatus: string;
  actorId: string | null;
  /** The cancellation reason, when there is one. Required to reverse. */
  reason: string | null;
}

interface EarnRow {
  points: number | null;
  customer_id: string | null;
}

interface ReversalRow {
  reversed_points: number | null;
  restored_points: number | null;
  note: string | null;
}

/** The earn event a transition raises, or null when it raises none. */
function earnEventFor(toStatus: string): "deal_completed" | "deal_confirmed" | null {
  if (toStatus === "Completed") return "deal_completed";
  if (toStatus === "Confirmed") return "deal_confirmed";
  return null;
}

export interface SettlementOutcome {
  /** Points credited by this transition. Zero is the normal answer. */
  earned: number;
  /** Points clawed back by a cancellation. */
  reversed: number;
  /** Redeemed points handed back to the customer by a cancellation. */
  restored: number;
  /** Set when the reversal could not take everything back. */
  note: string | null;
}

const NOTHING: SettlementOutcome = { earned: 0, reversed: 0, restored: 0, note: null };

/**
 * Credit or claw back points for a deal that has just changed status.
 *
 * Returns what happened, for a caller that wants to say so. The sales
 * transition ignores it: nothing about a completed sale should read
 * differently because the loyalty programme is switched off.
 */
export async function settleLoyaltyForTransition(input: SettleInput): Promise<SettlementOutcome> {
  try {
    if (input.toStatus === "Cancelled") {
      return await reverseForCancellation(input);
    }

    const event = earnEventFor(input.toStatus);
    if (!event) return NOTHING;

    const { data, error } = await input.supabase.rpc("earn_loyalty_for_deal", {
      p_deal_id: input.dealId,
      p_event_key: event,
      p_actor_id: input.actorId,
    });

    if (error) {
      console.error("settleLoyaltyForTransition earn error:", error);
      return NOTHING;
    }

    /*
     * earn_loyalty_for_deal always returns exactly one row, so this is
     * defensive rather than load-bearing — but a function returning a table
     * arrives as an array through the RPC layer, and reading [0] off
     * something that is occasionally an object is how this breaks quietly.
     */
    const row = (Array.isArray(data) ? data[0] : data) as EarnRow | undefined;

    const earned = row?.points ?? 0;
    const customerId = row?.customer_id ?? null;

    if (earned > 0 && customerId) {
      await notifyPointsEarned(customerId, earned, input.dealId, input.actorId);
    }

    return { ...NOTHING, earned };
  } catch (error) {
    console.error("settleLoyaltyForTransition threw:", error);
    return NOTHING;
  }
}

/**
 * A cancelled sale gives its points back.
 *
 * The policy lives in loyalty_settings, and reverse_loyalty_for_deal reads
 * it: keep what was earned, reverse it, or reverse it and hand back what
 * the customer had already spent. This only asks.
 *
 * A reason is required by the database function, because a clawback with no
 * stated cause is the kind of ledger entry nobody can explain a year later.
 * The transition's own cancellation reason is used when there is one.
 */
async function reverseForCancellation(input: SettleInput): Promise<SettlementOutcome> {
  const reason = input.reason?.trim() || "Deal cancelled";

  const { data, error } = await input.supabase.rpc("reverse_loyalty_for_deal", {
    p_deal_id: input.dealId,
    p_reason: reason,
    p_actor_id: input.actorId,
  });

  if (error) {
    console.error("reverseForCancellation error:", error);
    return NOTHING;
  }

  const row = (Array.isArray(data) ? data[0] : data) as ReversalRow | undefined;

  return {
    earned: 0,
    reversed: row?.reversed_points ?? 0,
    restored: row?.restored_points ?? 0,
    note: row?.note ?? null,
  };
}

/*
|--------------------------------------------------------------------------
| REDEMPTION, FOR THE DEAL PRICING PANEL
|--------------------------------------------------------------------------
*/

interface RedemptionNoticeInput {
  customerId: string | null;
  points: number;
  dealId: string;
  actorId: string | null;
}

/**
 * Say that points were spent.
 *
 * Separate from the settlement above because redemption happens when
 * somebody applies points to a deal, not when the deal moves. Kept here so
 * both halves of "points moved because of a deal" sit in one file.
 */
export async function noticePointsRedeemed(input: RedemptionNoticeInput): Promise<void> {
  if (!input.customerId || input.points <= 0) return;

  await notifyPointsRedeemed(input.customerId, input.points, input.dealId, input.actorId);
}
