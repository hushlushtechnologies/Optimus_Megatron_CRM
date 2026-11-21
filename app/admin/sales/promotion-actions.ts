"use server";

import { revalidatePath } from "next/cache";

import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import { evaluateOffersForCar } from "@/src/lib/supabase/offer-evaluation";
import { STACKING_POLICY_LABELS } from "@/src/lib/types/offers";
import { FINAL_DEAL_STATUSES } from "@/src/lib/types/sales";
import { filsToDecimalString, formatFils, toFils } from "@/src/lib/utils/sales-money";

/*
|--------------------------------------------------------------------------
| APPLYING A PROMOTION TO A DEAL (Phase 16)
|--------------------------------------------------------------------------
|
| THE DESIGN, AND WHY IT IS THIS SHAPE.
|
| The existing pricing path is a database function, save_deal_pricing, which
| the Sales module calls with one discount figure. It owns the approval
| threshold, the fees, the VAT and the deal's price history. Its source is
| not in this repository, so its internals are not something to reason
| about or reimplement.
|
| So nothing here changes it. A promotion's discount is ADDED to the
| manual discount and the sum goes through that same function. Three things
| follow, and all three are requirements from the plan:
|
|   Approval cannot be bypassed. The combined figure is what the threshold
|   is tested against, so a promotion large enough to need approval needs
|   it — "no discount should bypass existing authorized approval."
|
|   Fees and VAT behave exactly as they do today, because the same function
|   computes them from the same inputs.
|
|   The deal's price history keeps working, because the write goes through
|   the path that records it.
|
| What the promotion adds on top is a redemption row carrying a snapshot of
| the campaign's terms. That is what makes "promotion changes must not
| retroactively modify completed sales" true: the campaign can be edited
| afterwards and the snapshot still says what this deal was given.
|
| THE DISCOUNT IS RECALCULATED HERE. The client sends which promotion, never
| how much. "The authoritative final pricing must be validated server-side."
*/

interface Result {
  error: string | null;
  warning?: string;
  /** What was actually applied, for the message. */
  appliedFils?: string;
  needsApproval?: boolean;
}

type SavedRow = {
  out_needs_approval: boolean | null;
  out_updated_at: string | null;
};

function refresh(dealId: string) {
  revalidatePath(`/admin/sales/${dealId}`);
  revalidatePath("/admin/sales");
}

/* =========================================================
   APPLY
========================================================= */

export async function applyPromotionToDealAction(input: {
  dealId: string;
  promotionId: string;
  /** The deal's updated_at, so a concurrent edit is caught. */
  expectedUpdatedAt: string;
  /** A code the customer quoted, if the campaign needs one. */
  code?: string | null;
  note?: string;
}): Promise<Result> {
  /* Changing a deal's price is a Sales act, so it needs the Sales key. */
  const start = await beginSalesAction("edit");
  if (!start.ok) return { error: start.error };

  const { supabase } = start;

  /* ---- The deal as it stands ---- */

  const { data: dealRow, error: dealError } = await supabase
    .from("sales_deals")
    .select("id, car_id, customer_id, status, proposed_price, discount_amount, updated_at")
    .eq("id", input.dealId)
    .maybeSingle();

  if (dealError) {
    console.error("applyPromotionToDeal deal error:", dealError);
    return { error: "The deal couldn't be read. Try again." };
  }

  if (!dealRow) return { error: "That deal no longer exists." };

  const deal = dealRow as unknown as {
    id: string;
    car_id: string;
    customer_id: string;
    status: string;
    proposed_price: number | string | null;
    discount_amount: number | string | null;
    updated_at: string;
  };

  /*
   * A finished deal is finished. Changing the price of a completed or
   * cancelled sale is what "preserve verified payment records" and
   * "protect existing transactions and committed pricing" rule out.
   *
   * FINAL_DEAL_STATUSES is the Sales module's own list, used rather than a
   * list written here — my first version checked for "delivered", which is
   * not a deal status at all in this app (delivery is tracked separately).
   *
   * Nothing else is checked. save_deal_pricing may well refuse other
   * statuses too, and duplicating rules whose source is not in this
   * repository is how the two drift apart. Its error surfaces as-is.
   */
  if ((FINAL_DEAL_STATUSES as string[]).includes(deal.status)) {
    return {
      error: `This deal is ${deal.status.toLowerCase()}, so its pricing can't be changed. Nothing was applied.`,
    };
  }

  if (deal.updated_at !== input.expectedUpdatedAt) {
    return {
      error: "Somebody else changed this deal while you were looking at it. Refresh and try again.",
    };
  }

  const proposedFils = toFils(deal.proposed_price === null ? null : String(deal.proposed_price));

  if (proposedFils === null || proposedFils <= 0n) {
    return {
      error: "Set the deal's proposed price before applying a promotion to it.",
    };
  }

  const manualFils = toFils(deal.discount_amount === null ? null : String(deal.discount_amount)) ?? 0n;

  /* ---- Retired fees: refuse rather than drop them ---- */

  /*
   * save_deal_pricing takes the full list of fee type ids and rebuilds the
   * deal's fees from it. A fee whose type has since been retired has a null
   * fee_type_id, so it cannot be passed back — and calling the function
   * without it would silently delete that fee from the deal.
   *
   * The pricing dialog handles this by showing retired fees separately so
   * somebody can decide. This shortcut has nowhere to show that, so it
   * refuses and points at the dialog instead. Quietly removing a charge
   * from a deal is not an acceptable side effect of applying a discount.
   */
  const { data: feeRows, error: feeError } = await supabase
    .from("sales_deal_fees")
    .select("fee_type_id, name")
    .eq("deal_id", input.dealId);

  if (feeError) {
    console.error("applyPromotionToDeal fees error:", feeError);
    return { error: "The deal's fees couldn't be read, so nothing was changed. Try again." };
  }

  const fees = (feeRows ?? []) as { fee_type_id: string | null; name: string }[];
  const retired = fees.filter((fee) => !fee.fee_type_id);

  if (retired.length > 0) {
    return {
      error:
        `This deal has ${retired.length === 1 ? "a fee" : "fees"} from a retired fee type ` +
        `(${retired.map((fee) => fee.name).join(", ")}). Use Edit pricing so you can decide what ` +
        `happens to ${retired.length === 1 ? "it" : "them"} — applying a promotion here would remove ` +
        `${retired.length === 1 ? "it" : "them"}.`,
    };
  }

  const feeTypeIds = fees
    .map((fee) => fee.fee_type_id)
    .filter((id): id is string => Boolean(id));

  /* ---- Re-evaluate, server-side ---- */

  const evaluated = await evaluateOffersForCar({
    carId: deal.car_id,
    customerId: deal.customer_id,
    priceFils: proposedFils,
    codeText: input.code ?? null,
    manualDiscountFils: manualFils,
  });

  if (!evaluated) {
    return { error: "The promotion couldn't be checked against this deal. Nothing was changed." };
  }

  const chosen = evaluated.evaluation.eligible.find(
    (offer) => offer.promotion.id === input.promotionId,
  );

  if (!chosen) {
    /* Say why, using the engine's own reason rather than a generic refusal. */
    const refused = evaluated.evaluation.rejected.find(
      (rejected) => rejected.promotion.id === input.promotionId,
    );

    if (refused) {
      return { error: `${refused.promotion.name} can't be applied: ${refused.message}` };
    }

    return { error: "That promotion doesn't apply to this deal." };
  }

  /* ---- Stacking, explicitly ---- */

  /*
   * The engine already refuses a campaign blocked by stacking, so reaching
   * here means the combination is permitted. This re-states it for the
   * message, so somebody applying a discount on top of a manual one is told
   * which policy allowed it rather than left to assume.
   */
  const stacked = manualFils > 0n;
  const policy = chosen.promotion.stackingPolicy;

  const combinedFils = manualFils + chosen.discountFils;

  if (combinedFils >= proposedFils) {
    return {
      error:
        `That would take the price to zero or below — ${formatFils(combinedFils)} off ` +
        `${formatFils(proposedFils)}. Lower the manual discount first.`,
    };
  }

  /* ---- Save, through the existing path ---- */

  const note =
    (input.note?.trim() ? `${input.note.trim()} — ` : "") +
    `Promotion applied: ${chosen.promotion.name} (${formatFils(chosen.discountFils)})` +
    (stacked ? `, on top of a manual discount of ${formatFils(manualFils)}` : "");

  const { data: savedData, error: saveError } = await supabase.rpc("save_deal_pricing", {
    p_deal_id: input.dealId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_proposed: filsToDecimalString(proposedFils),
    p_discount: filsToDecimalString(combinedFils),
    p_fee_type_ids: feeTypeIds,
    p_note: note.slice(0, 500),
  });

  if (saveError) {
    console.error("applyPromotionToDeal save error:", saveError);
    return {
      error: "The deal's pricing couldn't be saved, so no promotion was applied. Try again.",
    };
  }

  const saved = (Array.isArray(savedData) ? savedData[0] : savedData) as SavedRow | undefined;

  /* ---- Record the redemption, with its snapshot ---- */

  /*
   * After the save, deliberately. If this fails, the deal has the discount
   * and the deal's own price history records it — but there is no promotion
   * record, so the campaign's usage count is short by one. That is reported
   * as a warning.
   *
   * The other order would be worse: a redemption for a price change that
   * never happened would count against the campaign's limits and show on
   * its Redemptions tab as money given away that nobody received.
   */
  const { error: redemptionError } = await supabase.from("offer_redemptions").insert({
    promotion_id: chosen.promotion.id,
    customer_id: deal.customer_id,
    deal_id: input.dealId,
    code_id: chosen.code?.id ?? null,
    assignment_id: chosen.assignment?.id ?? null,
    discount_fils: chosen.discountFils.toString(),
    terms: {
      promotion_name: chosen.promotion.name,
      reference: chosen.promotion.reference,
      discount_type: chosen.promotion.discountType,
      discount_value: chosen.promotion.discountValue,
      stacking_policy: policy,
      max_discount_fils: chosen.promotion.maxDiscountFils?.toString() ?? null,
      min_purchase_fils: chosen.promotion.minPurchaseFils?.toString() ?? null,
      proposed_price_fils: proposedFils.toString(),
      manual_discount_fils: manualFils.toString(),
      combined_discount_fils: combinedFils.toString(),
      explanation: chosen.explanation,
      code: chosen.code?.code ?? null,
      captured_at: new Date().toISOString(),
    },
    status: "applied",
    redeemed_by: start.userId,
  });

  refresh(input.dealId);

  if (redemptionError) {
    console.error("applyPromotionToDeal redemption error:", redemptionError);

    return {
      error: null,
      warning:
        `The discount was applied to the deal, but recording it against ${chosen.promotion.name} ` +
        `failed — so the campaign's usage count is one short. The deal's own price history is correct.`,
      appliedFils: chosen.discountFils.toString(),
      needsApproval: Boolean(saved?.out_needs_approval),
    };
  }

  return {
    error: null,
    appliedFils: chosen.discountFils.toString(),
    needsApproval: Boolean(saved?.out_needs_approval),
    warning: saved?.out_needs_approval
      ? `${formatFils(combinedFils)} off needs approval before this deal can be confirmed.`
      : undefined,
  };
}

/* =========================================================
   WHAT APPLIES TO THIS DEAL
========================================================= */

export interface DealOfferRow {
  id: string;
  name: string;
  reference: string | null;
  discountFils: string | null;
  explanation: string;
  verdict: "eligible" | "not_eligible";
  stackingLabel: string;
  requiresCode: boolean;
}

export async function getDealOffersAction(input: {
  dealId: string;
  code?: string | null;
}): Promise<{ rows: DealOfferRow[]; alreadyApplied: string[]; error: string | null }> {
  const start = await beginSalesAction("view");
  if (!start.ok) return { rows: [], alreadyApplied: [], error: start.error };

  const { data: dealRow } = await start.supabase
    .from("sales_deals")
    .select("id, car_id, customer_id, proposed_price, discount_amount")
    .eq("id", input.dealId)
    .maybeSingle();

  if (!dealRow) return { rows: [], alreadyApplied: [], error: "That deal no longer exists." };

  const deal = dealRow as unknown as {
    car_id: string;
    customer_id: string;
    proposed_price: number | string | null;
    discount_amount: number | string | null;
  };

  const proposedFils = toFils(deal.proposed_price === null ? null : String(deal.proposed_price));

  if (proposedFils === null || proposedFils <= 0n) {
    return {
      rows: [],
      alreadyApplied: [],
      error: "Set the deal's proposed price to see which promotions apply.",
    };
  }

  /* What is already on this deal, so the engine can refuse a second go. */
  const { data: appliedRows } = await start.supabase
    .from("offer_redemptions")
    .select("promotion_id")
    .eq("deal_id", input.dealId)
    .eq("status", "applied");

  const alreadyApplied = ((appliedRows ?? []) as { promotion_id: string }[]).map(
    (row) => row.promotion_id,
  );

  const manualFils = toFils(deal.discount_amount === null ? null : String(deal.discount_amount)) ?? 0n;

  const evaluated = await evaluateOffersForCar({
    carId: deal.car_id,
    customerId: deal.customer_id,
    priceFils: proposedFils,
    codeText: input.code ?? null,
    manualDiscountFils: manualFils,
    appliedPromotionIds: alreadyApplied,
  });

  if (!evaluated) {
    return { rows: [], alreadyApplied, error: "The promotions couldn't be checked." };
  }

  const rows: DealOfferRow[] = [
    ...evaluated.evaluation.eligible.map((offer) => ({
      id: offer.promotion.id,
      name: offer.promotion.name,
      reference: offer.promotion.reference,
      discountFils: offer.discountFils.toString(),
      explanation: offer.explanation,
      verdict: "eligible" as const,
      stackingLabel: STACKING_POLICY_LABELS[offer.promotion.stackingPolicy],
      requiresCode: offer.promotion.promotionType === "code",
    })),

    ...evaluated.evaluation.rejected
      /* A campaign aimed at another car has nothing to say about this deal. */
      .filter((rejected) => rejected.reason !== "car_not_targeted")
      .map((rejected) => ({
        id: rejected.promotion.id,
        name: rejected.promotion.name,
        reference: rejected.promotion.reference,
        discountFils: null,
        explanation: rejected.message,
        verdict: "not_eligible" as const,
        stackingLabel: STACKING_POLICY_LABELS[rejected.promotion.stackingPolicy],
        requiresCode: rejected.promotion.promotionType === "code",
      })),
  ];

  return { rows, alreadyApplied, error: evaluated.codeProblem };
}

/* =========================================================
   REDEEMING POINTS AGAINST A DEAL (Phase 20)

   Same shape as applying a promotion, and for the same reason: the points
   discount is added to whatever discount is already on the deal and the sum
   goes through save_deal_pricing, so approval, fees, VAT and price history
   all behave exactly as they do today.

   The order matters and is deliberate:

     1. reserve   locks the points so they cannot be spent twice
     2. save      puts the discount on the deal
     3. commit    turns the hold into a ledger entry

   If (2) fails, (1) is released and nothing happened. If (3) fails after
   (2) succeeded, the discount is on the deal and the hold is still standing
   — reported as a warning, because the alternative is a discount nobody can
   account for.

   Reserving first is what makes it safe: two people cannot both promise the
   same points, because the second reservation is refused by the row lock in
   reserve_loyalty_points.
========================================================= */

export async function applyPointsToDealAction(input: {
  dealId: string;
  points: number;
  expectedUpdatedAt: string;
}): Promise<Result> {
  const start = await beginSalesAction("edit");
  if (!start.ok) return { error: start.error };

  const { supabase } = start;

  const { data: dealRow, error: dealError } = await supabase
    .from("sales_deals")
    .select("id, customer_id, status, proposed_price, discount_amount, updated_at")
    .eq("id", input.dealId)
    .maybeSingle();

  if (dealError) {
    console.error("applyPointsToDeal deal error:", dealError);
    return { error: "The deal couldn't be read. Try again." };
  }

  if (!dealRow) return { error: "That deal no longer exists." };

  const deal = dealRow as unknown as {
    customer_id: string;
    status: string;
    proposed_price: number | string | null;
    discount_amount: number | string | null;
    updated_at: string;
  };

  if ((FINAL_DEAL_STATUSES as string[]).includes(deal.status)) {
    return {
      error: `This deal is ${deal.status.toLowerCase()}, so its pricing can't be changed.`,
    };
  }

  if (deal.updated_at !== input.expectedUpdatedAt) {
    return { error: "Somebody else changed this deal. Refresh and try again." };
  }

  const proposedFils = toFils(deal.proposed_price === null ? null : String(deal.proposed_price));

  if (proposedFils === null || proposedFils <= 0n) {
    return { error: "Set the deal's proposed price before redeeming points against it." };
  }

  const manualFils = toFils(deal.discount_amount === null ? null : String(deal.discount_amount)) ?? 0n;

  /* The retired-fee guard, same as the promotion path. */
  const { data: feeRows, error: feeError } = await supabase
    .from("sales_deal_fees")
    .select("fee_type_id, name")
    .eq("deal_id", input.dealId);

  if (feeError) {
    console.error("applyPointsToDeal fees error:", feeError);
    return { error: "The deal's fees couldn't be read, so nothing was changed." };
  }

  const fees = (feeRows ?? []) as { fee_type_id: string | null; name: string }[];
  const retired = fees.filter((fee) => !fee.fee_type_id);

  if (retired.length > 0) {
    return {
      error:
        `This deal has ${retired.length === 1 ? "a fee" : "fees"} from a retired fee type ` +
        `(${retired.map((fee) => fee.name).join(", ")}). Use Edit pricing instead — redeeming ` +
        `points here would remove ${retired.length === 1 ? "it" : "them"}.`,
    };
  }

  const feeTypeIds = fees.map((fee) => fee.fee_type_id).filter((id): id is string => Boolean(id));

  /* ---- 1. Reserve ---- */

  const { data: reservationId, error: reserveError } = await supabase.rpc(
    "reserve_loyalty_points",
    {
      p_customer_id: deal.customer_id,
      p_deal_id: input.dealId,
      p_points: input.points,
      p_actor_id: start.userId,
    },
  );

  if (reserveError) {
    console.error("applyPointsToDeal reserve error:", reserveError);

    const reasons: Record<string, string> = {
      loyalty_disabled: "The loyalty program is switched off.",
      conversion_not_configured: "The redemption rate hasn't been set in loyalty settings.",
      below_minimum_redemption: "That's fewer points than the minimum redemption allows.",
      above_maximum_redemption: "That's more points than the maximum redemption allows.",
      insufficient_points: "The customer doesn't have that many points available.",
      above_deal_ceiling: "Points can't cover that much of one deal under the current settings.",
      deal_already_has_a_hold: "This deal already has points held against it.",
      no_wallet: "This customer has no loyalty wallet yet.",
    };

    const key = Object.keys(reasons).find((reason) => reserveError.message.includes(reason));

    return { error: key ? reasons[key] : "The points couldn't be held. Nothing was changed." };
  }

  const holdId = reservationId as string;

  /* What the hold is worth, as the function recorded it. */
  const { data: holdRow } = await supabase
    .from("loyalty_reservations")
    .select("discount_fils")
    .eq("id", holdId)
    .maybeSingle();

  const pointsFils = BigInt((holdRow as { discount_fils: string | number } | null)?.discount_fils ?? 0);

  if (pointsFils <= 0n) {
    await supabase.rpc("release_loyalty_reservation", {
      p_reservation_id: holdId,
      p_reason: "The points were worth nothing, so nothing was applied.",
    });

    return { error: "Those points are worth less than a fil, so nothing was applied." };
  }

  const combinedFils = manualFils + pointsFils;

  if (combinedFils >= proposedFils) {
    await supabase.rpc("release_loyalty_reservation", {
      p_reservation_id: holdId,
      p_reason: "The combined discount would have taken the price to zero.",
    });

    return {
      error:
        `That would take the price to zero or below — ${formatFils(combinedFils)} off ` +
        `${formatFils(proposedFils)}. The points were not used.`,
    };
  }

  /* ---- 2. Save, through the existing path ---- */

  const note =
    `Loyalty points redeemed: ${input.points.toLocaleString()} points ` +
    `(${formatFils(pointsFils)})` +
    (manualFils > 0n ? `, on top of a manual discount of ${formatFils(manualFils)}` : "");

  const { data: savedData, error: saveError } = await supabase.rpc("save_deal_pricing", {
    p_deal_id: input.dealId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_proposed: filsToDecimalString(proposedFils),
    p_discount: filsToDecimalString(combinedFils),
    p_fee_type_ids: feeTypeIds,
    p_note: note.slice(0, 500),
  });

  if (saveError) {
    console.error("applyPointsToDeal save error:", saveError);

    /* The hold must not survive a failed save. */
    await supabase.rpc("release_loyalty_reservation", {
      p_reservation_id: holdId,
      p_reason: "The deal's pricing could not be saved.",
    });

    return {
      error: "The deal's pricing couldn't be saved, so no points were used. Try again.",
    };
  }

  const saved = (Array.isArray(savedData) ? savedData[0] : savedData) as SavedRow | undefined;

  /* ---- 3. Commit ---- */

  const { error: commitError } = await supabase.rpc("commit_loyalty_redemption", {
    p_reservation_id: holdId,
    p_actor_id: start.userId,
  });

  refresh(input.dealId);

  if (commitError) {
    console.error("applyPointsToDeal commit error:", commitError);

    return {
      error: null,
      warning:
        `The discount was applied to the deal, but the points are still only held rather than ` +
        `spent. Somebody needs to settle or release the hold on the customer's loyalty tab.`,
      needsApproval: Boolean(saved?.out_needs_approval),
    };
  }

  return {
    error: null,
    appliedFils: pointsFils.toString(),
    needsApproval: Boolean(saved?.out_needs_approval),
    warning: saved?.out_needs_approval
      ? `${formatFils(combinedFils)} off needs approval before this deal can be confirmed.`
      : undefined,
  };
}

/* =========================================================
   WHAT POINTS WOULD BE WORTH ON THIS DEAL
========================================================= */

export interface DealPointsView {
  loyaltyEnabled: boolean;
  /** Null when the customer has no wallet. */
  spendablePoints: number | null;
  pointsPerAed: number | null;
  minRedeem: number | null;
  maxRedeem: number | null;
  /** The ceiling in fils for THIS deal, from max_redeem_bps_of_deal. */
  dealCeilingFils: string | null;
  /** A hold already standing against this deal. */
  existingHold: { id: string; points: number } | null;
  /** Points already redeemed against this deal. */
  alreadyRedeemed: number;
  reason: string | null;
}

export async function getDealPointsAction(input: {
  dealId: string;
}): Promise<DealPointsView> {
  const empty: DealPointsView = {
    loyaltyEnabled: false,
    spendablePoints: null,
    pointsPerAed: null,
    minRedeem: null,
    maxRedeem: null,
    dealCeilingFils: null,
    existingHold: null,
    alreadyRedeemed: 0,
    reason: null,
  };

  const start = await beginSalesAction("view");
  if (!start.ok) return { ...empty, reason: start.error };

  const { data: dealRow } = await start.supabase
    .from("sales_deals")
    .select("customer_id")
    .eq("id", input.dealId)
    .maybeSingle();

  if (!dealRow) return { ...empty, reason: "That deal no longer exists." };

  const customerId = (dealRow as { customer_id: string }).customer_id;

  const [settings, wallet, hold, redeemed] = await Promise.all([
    start.supabase
      .from("loyalty_settings")
      .select("is_enabled, redeem_points_per_aed, min_redeem_points, max_redeem_points, max_redeem_bps_of_deal")
      .eq("id", true)
      .maybeSingle(),

    start.supabase
      .from("loyalty_wallets")
      .select("available_points, reserved_points")
      .eq("customer_id", customerId)
      .maybeSingle(),

    start.supabase
      .from("loyalty_reservations")
      .select("id, points")
      .eq("deal_id", input.dealId)
      .eq("status", "held")
      .maybeSingle(),

    start.supabase
      .from("loyalty_ledger")
      .select("points")
      .eq("deal_id", input.dealId)
      .eq("entry_type", "redeem"),
  ]);

  const s = settings.data as unknown as Record<string, unknown> | null;

  if (!s || !s.is_enabled) {
    return { ...empty, reason: "The loyalty program is switched off." };
  }

  const w = wallet.data as unknown as Record<string, unknown> | null;

  const available = Number(w?.available_points ?? 0);
  const reserved = Number(w?.reserved_points ?? 0);

  /* The deal ceiling, worked out server-side from the qualifying amount. */
  let ceilingFils: string | null = null;

  if (s.max_redeem_bps_of_deal) {
    const { data: qualifying } = await start.supabase.rpc("loyalty_qualifying_fils", {
      p_deal_id: input.dealId,
    });

    const base = BigInt((qualifying as string | number | null) ?? 0);

    if (base > 0n) {
      ceilingFils = ((base * BigInt(Number(s.max_redeem_bps_of_deal))) / 10000n).toString();
    }
  }

  const holdRow = hold.data as { id: string; points: number } | null;

  return {
    loyaltyEnabled: true,
    spendablePoints: w === null ? null : available - reserved,
    pointsPerAed: s.redeem_points_per_aed === null ? null : Number(s.redeem_points_per_aed),
    minRedeem: s.min_redeem_points === null ? null : Number(s.min_redeem_points),
    maxRedeem: s.max_redeem_points === null ? null : Number(s.max_redeem_points),
    dealCeilingFils: ceilingFils,
    existingHold: holdRow ? { id: holdRow.id, points: Number(holdRow.points) } : null,
    alreadyRedeemed: ((redeemed.data ?? []) as { points: number }[]).reduce(
      (total, row) => total + Math.abs(Number(row.points)),
      0,
    ),
    reason: s.redeem_points_per_aed === null ? "The redemption rate hasn't been set." : null,
  };
}
