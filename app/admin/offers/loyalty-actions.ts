"use server";

import { revalidatePath } from "next/cache";

import { beginOfferAction } from "@/src/lib/supabase/offer-permissions";
import { notifyPointsAdjusted } from "@/src/lib/notifications/offer-notifications";
import { noticePointsRedeemed } from "@/src/lib/supabase/loyalty-settlement";
import {
  adjustPointsSchema,
  commitReservationSchema,
  earnRuleSchema,
  loyaltySettingsSchema,
  releaseReservationSchema,
  reservePointsSchema,
} from "@/src/lib/validation/loyalty";
import type { ZodError } from "zod";

/*
|--------------------------------------------------------------------------
| LOYALTY ACTIONS
|--------------------------------------------------------------------------
|
| Settings are a plain update — the table's own constraint is the real guard
| against enabling an unconfigured program, and a trigger records who
| changed what.
|
| Everything that moves points goes through a database function instead.
| Those functions hold a row lock across the check and the write, which
| application code cannot do: two requests spending the same points would
| both pass a balance check written here before either of them wrote.
*/

interface Result {
  error: string | null;
  message?: string;
}

function firstIssue(error: ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

/** Maps a function's raised reason code to a sentence. */
function explain(message: string, known: Record<string, string>, fallback: string): string {
  const key = Object.keys(known).find((reason) => message.includes(reason));
  return key ? known[key] : fallback;
}

/* =========================================================
   SETTINGS (Phase 17)
========================================================= */

export async function saveLoyaltySettingsAction(input: unknown): Promise<Result> {
  const start = await beginOfferAction("loyaltySettings");
  if (!start.ok) return { error: start.error };

  const parsed = loyaltySettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "Please check the settings and try again.") };
  }

  const v = parsed.data;

  const { error } = await start.supabase
    .from("loyalty_settings")
    .update({
      is_enabled: v.isEnabled,
      earn_points_per_1000_aed: v.earnPointsPer1000Aed,
      earn_basis: v.earnBasis,
      redeem_points_per_aed: v.redeemPointsPerAed,
      min_redeem_points: v.minRedeemPoints,
      max_redeem_points: v.maxRedeemPoints,
      max_redeem_bps_of_deal: v.maxRedeemPercentOfDeal,
      expiry_months: v.expiryMonths,
      refund_policy: v.refundPolicy,
      allow_negative_balance: v.allowNegativeBalance,
      updated_by: start.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) {
    console.error("saveLoyaltySettings error:", error);

    /*
     * The database refuses to enable the program without both rates. The
     * schema catches it first with a better message, so reaching here means
     * something bypassed the form — but the message should still be useful.
     */
    if (error.message.includes("loyalty_settings_enabled_needs_config")) {
      return {
        error: "The program can't be switched on until both the earn rate and the redemption rate are set.",
      };
    }

    if (error.message.includes("loyalty_settings_redeem_range")) {
      return { error: "The maximum redemption is below the minimum." };
    }

    return { error: "The settings couldn't be saved. Try again." };
  }

  revalidatePath("/admin/offers/settings");
  revalidatePath("/admin/offers");

  return {
    error: null,
    message: v.isEnabled
      ? "Saved. The loyalty program is on."
      : "Saved. The loyalty program is off, so nothing earns or redeems.",
  };
}

export async function saveEarnRuleAction(input: unknown): Promise<Result> {
  const start = await beginOfferAction("loyaltySettings");
  if (!start.ok) return { error: start.error };

  const parsed = earnRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "Please check the rule and try again.") };
  }

  const v = parsed.data;

  const { error } = await start.supabase
    .from("loyalty_earn_rules")
    .update({
      is_enabled: v.isEnabled,
      multiplier: v.multiplier,
      collection_ids: v.collectionIds,
      updated_by: start.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("event_key", v.eventKey);

  if (error) {
    console.error("saveEarnRule error:", error);
    return { error: "The rule couldn't be saved. Try again." };
  }

  revalidatePath("/admin/offers/settings");

  return { error: null };
}

/* =========================================================
   ADJUSTMENTS (Phase 21)
========================================================= */

export async function adjustCustomerPointsAction(input: unknown): Promise<Result> {
  const start = await beginOfferAction("loyaltyAdjust");
  if (!start.ok) return { error: start.error };

  const parsed = adjustPointsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "Please check the details and try again.") };
  }

  const v = parsed.data;

  const { error } = await start.supabase.rpc("adjust_loyalty_points", {
    p_customer_id: v.customerId,
    p_points: v.points,
    p_reason: v.reason,
    p_actor_id: start.userId,
    p_entry_type: v.entryType,
  });

  if (error) {
    console.error("adjustCustomerPoints error:", error);

    /* The trigger's own message names the resulting balance, so it is kept. */
    if (error.message.includes("Negative balances are not allowed")) {
      return {
        error:
          "That would take the balance below zero, which the current policy doesn't allow. " +
          "Take away fewer points, or change the policy in loyalty settings.",
      };
    }

    return {
      error: explain(
        error.message,
        {
          reason_required: "Say why this adjustment is being made.",
          actor_required: "Your account couldn't be identified. Sign in again.",
          points_must_be_non_zero: "Enter a number of points to add or take away.",
          bad_entry_type: "That kind of adjustment isn't allowed.",
        },
        "The adjustment couldn't be made. Try again.",
      ),
    };
  }

  /*
   * Sprint 8 Phase 23: a manual adjustment is the one action in the loyalty
   * module that creates value out of nothing, and the plan names
   * unauthorised manual adjustment as a case to test. So this notification
   * goes further than the others — to the customer's relationship manager
   * and to whoever owns the loyalty programme. Oversight of a hand-written
   * credit should not depend on somebody thinking to go and look.
   */
  await notifyPointsAdjusted(v.customerId, v.points, v.reason, start.userId);

  revalidatePath(`/admin/customers/${v.customerId}`);

  return {
    error: null,
    message:
      v.points > 0
        ? `${v.points.toLocaleString()} points added.`
        : `${Math.abs(v.points).toLocaleString()} points taken away.`,
  };
}

/* =========================================================
   REDEEMING AGAINST A DEAL (Phase 20)
========================================================= */

const RESERVE_REASONS: Record<string, string> = {
  loyalty_disabled: "The loyalty program is switched off.",
  conversion_not_configured: "The redemption rate hasn't been set in loyalty settings.",
  points_must_be_positive: "Enter how many points to use.",
  below_minimum_redemption: "That's fewer points than the minimum redemption allows.",
  above_maximum_redemption: "That's more points than the maximum redemption allows.",
  insufficient_points: "The customer doesn't have that many points available.",
  above_deal_ceiling: "Points can't cover that much of one deal under the current settings.",
  worth_nothing: "That many points are worth less than a fil.",
  deal_already_has_a_hold: "This deal already has points held against it.",
  no_wallet: "This customer has no loyalty wallet yet.",
};

export async function reservePointsForDealAction(
  input: unknown,
): Promise<Result & { reservationId?: string }> {
  const start = await beginOfferAction("loyaltyView");
  if (!start.ok) return { error: start.error };

  const parsed = reservePointsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "Please check the details and try again.") };
  }

  const v = parsed.data;

  /* The customer comes from the deal, never from the request. */
  const { data: deal } = await start.supabase
    .from("sales_deals")
    .select("customer_id")
    .eq("id", v.dealId)
    .maybeSingle();

  if (!deal) return { error: "That deal no longer exists." };

  const { data, error } = await start.supabase.rpc("reserve_loyalty_points", {
    p_customer_id: (deal as { customer_id: string }).customer_id,
    p_deal_id: v.dealId,
    p_points: v.points,
    p_actor_id: start.userId,
  });

  if (error) {
    console.error("reservePointsForDeal error:", error);
    return {
      error: explain(error.message, RESERVE_REASONS, "The points couldn't be held. Try again."),
    };
  }

  revalidatePath(`/admin/sales/${v.dealId}`);

  return {
    error: null,
    reservationId: data as string,
    message: `${v.points.toLocaleString()} points held against this deal.`,
  };
}

export async function commitPointsRedemptionAction(input: unknown): Promise<Result> {
  const start = await beginOfferAction("loyaltyView");
  if (!start.ok) return { error: start.error };

  const parsed = commitReservationSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };

  const { data, error } = await start.supabase.rpc("commit_loyalty_redemption", {
    p_reservation_id: parsed.data.reservationId,
    p_actor_id: start.userId,
  });

  if (error) {
    console.error("commitPointsRedemption error:", error);

    return {
      error: explain(
        error.message,
        {
          reservation_unknown: "That hold no longer exists.",
          reservation_not_held: "That hold has already been settled.",
          "Negative balances are not allowed":
            "The customer's balance has changed and no longer covers this. Release the hold and start again.",
        },
        "The redemption couldn't be completed. Try again.",
      ),
    };
  }

  /*
   * Sprint 8 Phase 23: say that points were spent.
   *
   * The ledger entry is read back rather than trusting anything the client
   * sent, because the authoritative record of how many points moved and
   * whose they were is the row the database just wrote. The function returns
   * that row's id for exactly this.
   *
   * A redeem entry carries negative points, so the sign is flipped for the
   * message. Failure here is logged and ignored: the redemption is committed
   * and must not be reported as failed because a notification did not land.
   */
  const ledgerId = typeof data === "string" ? data : null;

  if (ledgerId) {
    try {
      const { data: entry } = await start.supabase
        .from("loyalty_ledger")
        .select("customer_id, deal_id, points")
        .eq("id", ledgerId)
        .maybeSingle();

      const row = entry as { customer_id: string; deal_id: string | null; points: number } | null;

      if (row?.deal_id) {
        await noticePointsRedeemed({
          customerId: row.customer_id,
          points: Math.abs(row.points),
          dealId: row.deal_id,
          actorId: start.userId,
        });
      }
    } catch (notifyError) {
      console.error("commitPointsRedemption notify error:", notifyError);
    }
  }

  revalidatePath("/admin/sales");

  return { error: null, message: "Points redeemed." };
}

export async function releasePointsReservationAction(input: unknown): Promise<Result> {
  const start = await beginOfferAction("loyaltyView");
  if (!start.ok) return { error: start.error };

  const parsed = releaseReservationSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };

  const { error } = await start.supabase.rpc("release_loyalty_reservation", {
    p_reservation_id: parsed.data.reservationId,
    p_reason: parsed.data.reason || null,
  });

  if (error) {
    console.error("releasePointsReservation error:", error);
    return { error: "The hold couldn't be released. Try again." };
  }

  revalidatePath("/admin/sales");

  return { error: null, message: "Hold released. The points are available again." };
}
