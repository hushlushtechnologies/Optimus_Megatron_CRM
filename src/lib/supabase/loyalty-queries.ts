import "server-only";

import { createClient } from "@/src/lib/supabase/server";

/*
|--------------------------------------------------------------------------
| READING THE LOYALTY PROGRAM
|--------------------------------------------------------------------------
|
| The wallet is a cache that a trigger maintains; the ledger is the truth.
| Everything here reads both and says which is which, because the one
| question somebody will ask when a balance looks wrong is "does the ledger
| agree" — and check_loyalty_wallets answers it.
*/

export interface LoyaltySettings {
  isEnabled: boolean;
  earnPointsPer1000Aed: number | null;
  earnBasis: "agreed_price" | "net_price" | "proposed_price";
  redeemPointsPerAed: number | null;
  minRedeemPoints: number | null;
  maxRedeemPoints: number | null;
  maxRedeemBpsOfDeal: number | null;
  expiryMonths: number | null;
  refundPolicy: "reverse_earned" | "keep_earned" | "reverse_and_restore_redeemed";
  allowNegativeBalance: boolean;
  updatedAt: string;
  updatedByName: string | null;
}

export interface LoyaltyEarnRule {
  eventKey: string;
  isEnabled: boolean;
  multiplier: number;
  collectionIds: string[];
  notes: string | null;
  updatedAt: string;
}

export async function getLoyaltySettings(): Promise<{
  settings: LoyaltySettings;
  rules: LoyaltyEarnRule[];
} | null> {
  const supabase = await createClient();

  const [settingsResult, rulesResult] = await Promise.all([
    supabase
      .from("loyalty_settings")
      .select(
        `is_enabled, earn_points_per_1000_aed, earn_basis, redeem_points_per_aed,
         min_redeem_points, max_redeem_points, max_redeem_bps_of_deal,
         expiry_months, refund_policy, allow_negative_balance,
         updated_at, updated_by`,
      )
      .eq("id", true)
      .maybeSingle(),

    supabase
      .from("loyalty_earn_rules")
      .select("event_key, is_enabled, multiplier, collection_ids, notes, updated_at")
      .order("event_key"),
  ]);

  if (settingsResult.error || !settingsResult.data) {
    if (settingsResult.error) console.error("getLoyaltySettings error:", settingsResult.error);
    return null;
  }

  const row = settingsResult.data as unknown as Record<string, unknown>;

  let updatedByName: string | null = null;

  if (row.updated_by) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", row.updated_by as string)
      .maybeSingle();

    updatedByName = (data as { full_name: string | null } | null)?.full_name ?? null;
  }

  const num = (value: unknown): number | null =>
    value === null || value === undefined ? null : Number(value);

  return {
    settings: {
      isEnabled: Boolean(row.is_enabled),
      earnPointsPer1000Aed: num(row.earn_points_per_1000_aed),
      earnBasis: row.earn_basis as LoyaltySettings["earnBasis"],
      redeemPointsPerAed: num(row.redeem_points_per_aed),
      minRedeemPoints: num(row.min_redeem_points),
      maxRedeemPoints: num(row.max_redeem_points),
      maxRedeemBpsOfDeal: num(row.max_redeem_bps_of_deal),
      expiryMonths: num(row.expiry_months),
      refundPolicy: row.refund_policy as LoyaltySettings["refundPolicy"],
      allowNegativeBalance: Boolean(row.allow_negative_balance),
      updatedAt: row.updated_at as string,
      updatedByName,
    },

    rules: ((rulesResult.data ?? []) as Record<string, unknown>[]).map((rule) => ({
      eventKey: rule.event_key as string,
      isEnabled: Boolean(rule.is_enabled),
      multiplier: Number(rule.multiplier ?? 1),
      collectionIds: (rule.collection_ids as string[] | null) ?? [],
      notes: (rule.notes as string | null) ?? null,
      updatedAt: rule.updated_at as string,
    })),
  };
}

/* =========================================================
   A CUSTOMER'S WALLET (Phase 18)
========================================================= */

export interface LoyaltyLedgerEntry {
  id: string;
  entryType: string;
  points: number;
  source: string;
  dealId: string | null;
  reason: string | null;
  actorName: string | null;
  expiresAt: string | null;
  consumedPoints: number;
  createdAt: string;
}

export interface LoyaltyWalletView {
  /** Null when loyalty has never credited this customer. */
  exists: boolean;

  availablePoints: number;
  reservedPoints: number;
  /** available minus reserved — what can actually be spent today. */
  spendablePoints: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  expiredPoints: number;

  /** Points expiring within 60 days, oldest first. */
  expiringSoon: { points: number; expiresAt: string }[];
  expiringSoonTotal: number;

  entries: LoyaltyLedgerEntry[];

  /** Live holds against deals, so a held balance is explainable. */
  holds: { id: string; dealId: string; points: number; expiresAt: string }[];

  /**
   * Does the cache agree with the ledger?
   *
   * The wallet is maintained by a trigger. If the two ever disagree the
   * ledger is right, so the screen says so rather than showing a number it
   * cannot justify.
   */
  ledgerSum: number;
  agrees: boolean;
}

export async function getCustomerLoyalty(customerId: string): Promise<LoyaltyWalletView | null> {
  const supabase = await createClient();

  const [wallet, ledger, holds] = await Promise.all([
    supabase
      .from("loyalty_wallets")
      .select(
        "available_points, reserved_points, lifetime_earned, lifetime_redeemed, expired_points",
      )
      .eq("customer_id", customerId)
      .maybeSingle(),

    supabase
      .from("loyalty_ledger")
      .select(
        `id, entry_type, points, source, deal_id, reason, actor_id,
         expires_at, consumed_points, created_at`,
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("loyalty_reservations")
      .select("id, deal_id, points, expires_at")
      .eq("customer_id", customerId)
      .eq("status", "held")
      .order("created_at"),
  ]);

  if (ledger.error) {
    console.error("getCustomerLoyalty ledger error:", ledger.error);
    return null;
  }

  const entries = (ledger.data ?? []) as unknown as Record<string, unknown>[];

  /* Actor names in one query rather than one per row. */
  const actorIds = [
    ...new Set(entries.map((row) => row.actor_id).filter((id): id is string => Boolean(id))),
  ];

  const names = new Map<string, string>();

  if (actorIds.length > 0) {
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);

    for (const row of (data ?? []) as { id: string; full_name: string | null }[]) {
      names.set(row.id, row.full_name ?? "Unknown");
    }
  }

  const walletRow = wallet.data as unknown as Record<string, unknown> | null;

  const available = Number(walletRow?.available_points ?? 0);
  const reserved = Number(walletRow?.reserved_points ?? 0);

  /*
   * Summed from the ledger, independently of the cache. These two must
   * agree; the screen shows a warning if they don't.
   */
  const ledgerSum = entries.reduce((total, row) => total + Number(row.points ?? 0), 0);

  /* Credits that still have life in them and expire within 60 days. */
  const horizon = Date.now() + 60 * 24 * 60 * 60 * 1000;

  const expiringSoon = entries
    .filter((row) => {
      if (row.entry_type !== "earn" && row.entry_type !== "adjust") return false;
      if (!row.expires_at) return false;

      const left = Number(row.points ?? 0) - Number(row.consumed_points ?? 0);
      if (left <= 0) return false;

      const at = new Date(row.expires_at as string).getTime();
      return at > Date.now() && at <= horizon;
    })
    .map((row) => ({
      points: Number(row.points ?? 0) - Number(row.consumed_points ?? 0),
      expiresAt: row.expires_at as string,
    }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

  return {
    exists: walletRow !== null || entries.length > 0,

    availablePoints: available,
    reservedPoints: reserved,
    spendablePoints: available - reserved,
    lifetimeEarned: Number(walletRow?.lifetime_earned ?? 0),
    lifetimeRedeemed: Number(walletRow?.lifetime_redeemed ?? 0),
    expiredPoints: Number(walletRow?.expired_points ?? 0),

    expiringSoon,
    expiringSoonTotal: expiringSoon.reduce((total, item) => total + item.points, 0),

    entries: entries.map((row) => ({
      id: row.id as string,
      entryType: row.entry_type as string,
      points: Number(row.points ?? 0),
      source: row.source as string,
      dealId: (row.deal_id as string | null) ?? null,
      reason: (row.reason as string | null) ?? null,
      actorName: row.actor_id ? (names.get(row.actor_id as string) ?? null) : null,
      expiresAt: (row.expires_at as string | null) ?? null,
      consumedPoints: Number(row.consumed_points ?? 0),
      createdAt: row.created_at as string,
    })),

    holds: ((holds.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      dealId: row.deal_id as string,
      points: Number(row.points ?? 0),
      expiresAt: row.expires_at as string,
    })),

    ledgerSum,

    /*
     * Only meaningful when the whole ledger fits in the 100 rows read. Past
     * that the sum is partial, so a mismatch would be a false alarm.
     */
    agrees: entries.length < 100 ? ledgerSum === available : true,
  };
}

/* =========================================================
   A CUSTOMER'S OFFERS (Phase 22)

   Their private assignments and what they have redeemed. Recent purchases
   are NOT duplicated here — the Vehicles / Deals tab already lists them, and
   the plan says not to redesign the Customer module. This links there
   instead.
========================================================= */

export interface CustomerPersonalOffer {
  id: string;
  promotionId: string;
  promotionName: string;
  status: "active" | "used" | "expired" | "cancelled";
  discountOverrideFils: string | null;
  carTitle: string | null;
  validFrom: string | null;
  validTo: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CustomerRedemption {
  id: string;
  promotionId: string;
  promotionName: string;
  dealId: string | null;
  code: string | null;
  discountFils: string;
  status: "applied" | "reversed";
  reversalReason: string | null;
  redeemedAt: string;
}

export interface CustomerOffersView {
  personalOffers: CustomerPersonalOffer[];
  redemptions: CustomerRedemption[];
  /** Sum of applied discounts, in fils, as a string. */
  totalSavedFils: string;
}

export async function getCustomerOffers(customerId: string): Promise<CustomerOffersView | null> {
  const supabase = await createClient();

  const [assignments, redemptions] = await Promise.all([
    supabase
      .from("customer_offer_assignments")
      .select(
        `id, promotion_id, status, discount_override_fils, valid_from, valid_to, notes, created_at,
         promotion:promotions(name), car:cars(display_title)`,
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("offer_redemptions")
      .select(
        `id, promotion_id, deal_id, discount_fils, status, reversal_reason, redeemed_at,
         promotion:promotions(name), code:promotion_codes(code)`,
      )
      .eq("customer_id", customerId)
      .order("redeemed_at", { ascending: false })
      .limit(50),
  ]);

  if (assignments.error && redemptions.error) {
    console.error("getCustomerOffers error:", assignments.error);
    return null;
  }

  let totalSaved = 0n;

  const redemptionRows = ((redemptions.data ?? []) as unknown as Record<string, unknown>[]).map(
    (row) => {
      const promotion = row.promotion as { name: string | null } | null;
      const code = row.code as { code: string | null } | null;

      if (row.status === "applied") {
        totalSaved += BigInt((row.discount_fils as string | number | null) ?? 0);
      }

      return {
        id: row.id as string,
        promotionId: row.promotion_id as string,
        promotionName: promotion?.name ?? "A campaign that has since been removed",
        dealId: (row.deal_id as string | null) ?? null,
        code: code?.code ?? null,
        discountFils: String(row.discount_fils ?? "0"),
        status: row.status as CustomerRedemption["status"],
        reversalReason: (row.reversal_reason as string | null) ?? null,
        redeemedAt: row.redeemed_at as string,
      };
    },
  );

  return {
    personalOffers: ((assignments.data ?? []) as unknown as Record<string, unknown>[]).map(
      (row) => {
        const promotion = row.promotion as { name: string | null } | null;
        const car = row.car as { display_title: string | null } | null;

        return {
          id: row.id as string,
          promotionId: row.promotion_id as string,
          promotionName: promotion?.name ?? "A campaign that has since been removed",
          status: row.status as CustomerPersonalOffer["status"],
          discountOverrideFils:
            row.discount_override_fils === null ? null : String(row.discount_override_fils),
          carTitle: car?.display_title ?? null,
          validFrom: (row.valid_from as string | null) ?? null,
          validTo: (row.valid_to as string | null) ?? null,
          notes: (row.notes as string | null) ?? null,
          createdAt: row.created_at as string,
        };
      },
    ),

    redemptions: redemptionRows,
    totalSavedFils: totalSaved.toString(),
  };
}
