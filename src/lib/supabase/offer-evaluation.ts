import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import type {
  CustomerOfferAssignment,
  OfferCarContext,
  OfferCustomerContext,
  OfferEvaluation,
  Promotion,
  PromotionCode,
} from "@/src/lib/types/offers";
import { eligibilityNote } from "@/src/lib/utils/offer-eligibility-note";
import { evaluateOffers } from "@/src/lib/utils/offer-rules";
import { toFils } from "@/src/lib/utils/sales-money";

/*
|--------------------------------------------------------------------------
| WHICH OFFERS APPLY, DECIDED ON THE SERVER
|--------------------------------------------------------------------------
|
| One function behind both Phase 15 and Phase 16, because they ask the same
| question with different amounts of context:
|
|   Inventory (15) asks about a car with no customer in mind, so it gets
|   targeting and the campaign's own validity. Customer eligibility is
|   reported as "depends on the customer" rather than guessed.
|
|   Sales (16) asks about a car AND a customer on a real deal, so it gets
|   the full answer including private assignments and per-customer limits.
|
| Both get the same shapes from the same engine, so the two screens cannot
| disagree about what a campaign does.
|
| NOTHING HERE WRITES. It reports. Applying an offer to a deal is a separate,
| explicit step, and the figure is recalculated there rather than trusted
| from this reply — which is what "the authoritative final pricing must be
| validated server-side" requires.
*/

const PROMOTION_COLUMNS = `
  id, name, reference, description, promotion_type, status,
  discount_type, discount_value,
  starts_at, ends_at, priority,
  max_redemptions, max_per_customer, redemption_count,
  min_purchase_fils, max_discount_fils, points_multiplier, stacking_policy,
  archived_at,
  promotion_targets ( id, target_kind, target_id ),
  promotion_eligibility_rules ( id, rule_kind, operator, value )
`;

type RawPromotion = {
  id: string;
  name: string;
  reference: string | null;
  description: string | null;
  promotion_type: string;
  status: string;
  discount_type: string;
  discount_value: number | string;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  max_redemptions: number | null;
  max_per_customer: number | null;
  redemption_count: number;
  min_purchase_fils: string | number | null;
  max_discount_fils: string | number | null;
  points_multiplier: number | string | null;
  stacking_policy: string;
  archived_at: string | null;
  promotion_targets: { id: string; target_kind: string; target_id: string }[] | null;
  promotion_eligibility_rules:
    | { id: string; rule_kind: string; operator: string; value: unknown }[]
    | null;
};

/** A bigint from a column that may arrive as a string, a number or null. */
function bigintOrNull(value: string | number | null): bigint | null {
  if (value === null || value === undefined || value === "") return null;

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function toPromotion(raw: RawPromotion): Promotion {
  return {
    id: raw.id,
    name: raw.name,
    reference: raw.reference,
    description: raw.description,
    promotionType: raw.promotion_type as Promotion["promotionType"],
    status: raw.status as Promotion["status"],

    discountType: raw.discount_type as Promotion["discountType"],
    discountValue: Number(raw.discount_value ?? 0),

    startsAt: raw.starts_at,
    endsAt: raw.ends_at,
    priority: Number(raw.priority ?? 0),

    maxRedemptions: raw.max_redemptions === null ? null : Number(raw.max_redemptions),
    maxPerCustomer: raw.max_per_customer === null ? null : Number(raw.max_per_customer),
    redemptionCount: Number(raw.redemption_count ?? 0),

    minPurchaseFils: bigintOrNull(raw.min_purchase_fils),
    maxDiscountFils: bigintOrNull(raw.max_discount_fils),
    pointsMultiplier: raw.points_multiplier === null ? null : Number(raw.points_multiplier),
    stackingPolicy: raw.stacking_policy as Promotion["stackingPolicy"],

    archivedAt: raw.archived_at,

    targets: (raw.promotion_targets ?? []).map((row) => ({
      id: row.id,
      targetKind: row.target_kind as "car" | "brand" | "model" | "collection" | "location",
      targetId: row.target_id,
    })),

    eligibilityRules: (raw.promotion_eligibility_rules ?? []).map((row) => ({
      id: row.id,
      ruleKind: row.rule_kind as never,
      operator: row.operator as never,
      value: row.value,
    })),
  };
}

/* =========================================================
   THE CAR
========================================================= */

export async function loadCarContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  carId: string,
  /** Overrides the listed price — Sales uses the proposed price instead. */
  priceFilsOverride?: bigint,
): Promise<OfferCarContext | null> {
  const { data, error } = await supabase
    .from("cars")
    .select("id, brand_id, model_id, collection_id, location_id, regular_price")
    .eq("id", carId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("loadCarContext error:", error);
    return null;
  }

  const row = data as unknown as {
    id: string;
    brand_id: string | null;
    model_id: string | null;
    collection_id: string | null;
    location_id: string | null;
    regular_price: number | string | null;
  };

  const listed = toFils(row.regular_price === null ? null : String(row.regular_price));

  return {
    id: row.id,
    brandId: row.brand_id,
    modelId: row.model_id,
    collectionId: row.collection_id,
    locationId: row.location_id,
    priceFils: priceFilsOverride ?? listed ?? 0n,
  };
}

/* =========================================================
   THE CUSTOMER
========================================================= */

/**
 * Everything the eligibility rules ask about a customer.
 *
 * Built from what the app already holds — no new customer columns, and no
 * second tagging system. `interestedBrandIds` comes from
 * customer_vehicle_relations where the relationship is "Interested", joined
 * through to the car's brand.
 */
export async function loadCustomerContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerId: string,
): Promise<OfferCustomerContext | null> {
  const [profile, tags, summary, interests] = await Promise.all([
    supabase
      .from("customer_profiles")
      .select("id, lifecycle_status")
      .eq("id", customerId)
      .maybeSingle(),

    supabase.from("customer_tag_links").select("tag_id").eq("customer_id", customerId),

    supabase.rpc("get_customer_sales_summary", { p_customer_id: customerId }),

    supabase
      .from("customer_vehicle_relations")
      .select("car:cars(brand_id)")
      .eq("customer_id", customerId)
      .eq("relationship_type", "Interested"),
  ]);

  if (profile.error || !profile.data) {
    if (profile.error) console.error("loadCustomerContext profile error:", profile.error);
    return null;
  }

  const row = profile.data as unknown as { id: string; lifecycle_status: string | null };

  const summaryRow = (Array.isArray(summary.data) ? summary.data[0] : summary.data) as
    | Record<string, number | string | null>
    | undefined;

  /*
   * purchased_total is a decimal from the summary function, so it goes
   * through toFils rather than being multiplied by 100 here.
   */
  const lifetimeSpend =
    summaryRow && summaryRow.purchased_total !== null && summaryRow.purchased_total !== undefined
      ? toFils(String(summaryRow.purchased_total))
      : null;

  const brandIds = new Set<string>();

  for (const relation of (interests.data ?? []) as unknown as {
    car: { brand_id: string | null } | null;
  }[]) {
    if (relation.car?.brand_id) brandIds.add(relation.car.brand_id);
  }

  return {
    id: row.id,
    lifecycleStatus: row.lifecycle_status ?? "",
    tagIds: ((tags.data ?? []) as { tag_id: string }[]).map((link) => link.tag_id),
    completedDeals: summaryRow ? Number(summaryRow.completed_deals ?? 0) : 0,
    lifetimeSpendFils: lifetimeSpend ?? 0n,
    interestedBrandIds: [...brandIds],
  };
}

/* =========================================================
   THE EVALUATION
========================================================= */

export interface EvaluateForCarInput {
  carId: string;
  /** Omitted on the Inventory screen, where there is no customer in mind. */
  customerId?: string | null;
  /** Sales passes the proposed price; Inventory lets the listed price stand. */
  priceFils?: bigint;
  /** A code somebody typed, to be looked up and considered. */
  codeText?: string | null;
  /** A manual discount already on the deal, in fils. */
  manualDiscountFils?: bigint;
  /** Campaign ids already applied to this deal. */
  appliedPromotionIds?: string[];
}

export interface EvaluationResult {
  evaluation: OfferEvaluation;
  car: OfferCarContext;
  /** Null when no customer was given, which is not the same as not found. */
  customer: OfferCustomerContext | null;
  /** Set when a code was given and matched something. */
  code: PromotionCode | null;
  /** Set when a code was given and did not match. */
  codeProblem: string | null;
}

export async function evaluateOffersForCar(
  input: EvaluateForCarInput,
): Promise<EvaluationResult | null> {
  const supabase = await createClient();

  const car = await loadCarContext(supabase, input.carId, input.priceFils);
  if (!car) return null;

  const customer = input.customerId
    ? await loadCustomerContext(supabase, input.customerId)
    : null;

  /*
   * Live campaigns only, and archived ones never. `is_active` is the derived
   * column the trigger maintains, so this is the same set Inventory's
   * dropdown shows — but the engine re-checks the window against its own
   * clock anyway, so a stale cache cannot let an expired campaign through.
   */
  const { data: promotionRows, error: promotionError } = await supabase
    .from("promotions")
    .select(PROMOTION_COLUMNS)
    .is("archived_at", null)
    .in("status", ["active", "scheduled", "paused"]);

  if (promotionError) {
    console.error("evaluateOffersForCar promotions error:", promotionError);
    return null;
  }

  const promotions = ((promotionRows ?? []) as unknown as RawPromotion[]).map(toPromotion);

  /* ---- The customer's private offers ---- */

  let assignments: CustomerOfferAssignment[] = [];

  if (input.customerId) {
    const { data } = await supabase
      .from("customer_offer_assignments")
      .select(
        "id, promotion_id, customer_id, car_id, deal_id, valid_from, valid_to, discount_override_fils, status, notes",
      )
      .eq("customer_id", input.customerId)
      .eq("status", "active");

    assignments = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      promotionId: row.promotion_id as string,
      customerId: row.customer_id as string,
      carId: (row.car_id as string | null) ?? null,
      dealId: (row.deal_id as string | null) ?? null,
      validFrom: (row.valid_from as string | null) ?? null,
      validTo: (row.valid_to as string | null) ?? null,
      discountOverrideFils: bigintOrNull(row.discount_override_fils as string | number | null),
      status: row.status as CustomerOfferAssignment["status"],
      notes: (row.notes as string | null) ?? null,
    }));
  }

  /* ---- A code, if one was typed ---- */

  let code: PromotionCode | null = null;
  let codeProblem: string | null = null;

  if (input.codeText && input.codeText.trim() !== "") {
    const typed = input.codeText.trim();

    const { data } = await supabase
      .from("promotion_codes")
      .select("id, promotion_id, code, usage_limit, per_customer_limit, used_count, is_active")
      .ilike("code", typed)
      .maybeSingle();

    if (!data) {
      codeProblem = `No campaign uses the code ${typed.toUpperCase()}.`;
    } else {
      const row = data as unknown as Record<string, unknown>;

      code = {
        id: row.id as string,
        promotionId: row.promotion_id as string,
        code: row.code as string,
        usageLimit: row.usage_limit === null ? null : Number(row.usage_limit),
        perCustomerLimit: row.per_customer_limit === null ? null : Number(row.per_customer_limit),
        usedCount: Number(row.used_count ?? 0),
        isActive: Boolean(row.is_active),
      };
    }
  }

  /* ---- How many times this customer has used each campaign ---- */

  let customerRedemptionCounts: Record<string, number> = {};

  if (input.customerId) {
    const { data } = await supabase
      .from("offer_redemptions")
      .select("promotion_id")
      .eq("customer_id", input.customerId)
      .eq("status", "applied");

    customerRedemptionCounts = ((data ?? []) as { promotion_id: string }[]).reduce<
      Record<string, number>
    >((counts, row) => {
      counts[row.promotion_id] = (counts[row.promotion_id] ?? 0) + 1;
      return counts;
    }, {});
  }

  /*
   * With no customer, the engine still needs a context. A blank one makes
   * every customer-dependent rule fail, which is why the Inventory screen
   * reports those campaigns as "depends on the customer" rather than
   * "not eligible" — see offer-eligibility-note.ts.
   */
  const customerContext: OfferCustomerContext =
    customer ??
    {
      id: "",
      lifecycleStatus: "",
      tagIds: [],
      completedDeals: 0,
      lifetimeSpendFils: 0n,
      interestedBrandIds: [],
    };

  const evaluation = evaluateOffers({
    promotions,
    customer: customerContext,
    car,
    assignments,
    code,
    appliedPromotionIds: input.appliedPromotionIds ?? [],
    customerRedemptionCounts,
    manualDiscountFils: input.manualDiscountFils ?? 0n,
  });

  return { evaluation, car, customer, code, codeProblem };
}

/* =========================================================
   THE INVENTORY PANEL'S ROWS (Phase 15)

   Shaped for display and serialisable: every fils value leaves as a string,
   because a bigint does not survive the server-to-client boundary.

   Only campaigns that actually touch this vehicle are returned. A campaign
   aimed at a different brand is not "not eligible for this car" in any
   useful sense — it simply has nothing to do with it, and listing forty of
   those would bury the three that matter.
========================================================= */

export interface CarPromotionRowData {
  id: string;
  name: string;
  reference: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  discountFils: string | null;
  verdict: "eligible" | "not_eligible" | "depends_on_customer";
  message: string;
}

export interface CarPromotionsView {
  listedPriceFils: string | null;
  rows: CarPromotionRowData[];
  /*
   * The campaign chosen in the car's own dropdown.
   *
   * Read here rather than taken from CarDetail, because CarDetailPromotion
   * carries a name and a discount but no id — and adding one would mean
   * changing an Inventory type and its query for the sake of highlighting a
   * row. This function already reads `cars`.
   */
  selectedPromotionId: string | null;
}

export async function getCarPromotionsView(carId: string): Promise<CarPromotionsView | null> {
  const result = await evaluateOffersForCar({ carId });
  if (!result) return null;

  const { evaluation, car } = result;

  const supabase = await createClient();

  const { data: selected } = await supabase
    .from("cars")
    .select("promotion_id")
    .eq("id", carId)
    .maybeSingle();

  const rows: CarPromotionRowData[] = [
    ...evaluation.eligible.map((offer) => ({
      id: offer.promotion.id,
      name: offer.promotion.name,
      reference: offer.promotion.reference,
      status: offer.promotion.status,
      startsAt: offer.promotion.startsAt,
      endsAt: offer.promotion.endsAt,
      discountFils: offer.discountFils.toString(),
      verdict: "eligible" as const,
      message: offer.explanation,
    })),

    ...evaluation.rejected
      /*
       * A campaign that does not target this car has nothing to say about
       * it. Everything else is worth showing, including the maybes.
       */
      .filter((rejected) => rejected.reason !== "car_not_targeted")
      .map((rejected) => {
        const note = eligibilityNote(rejected.reason, false);

        return {
          id: rejected.promotion.id,
          name: rejected.promotion.name,
          reference: rejected.promotion.reference,
          status: rejected.promotion.status,
          startsAt: rejected.promotion.startsAt,
          endsAt: rejected.promotion.endsAt,
          discountFils: null,
          verdict: note.verdict,
          message: note.message,
        };
      }),
  ];

  return {
    listedPriceFils: car.priceFils > 0n ? car.priceFils.toString() : null,
    rows,
    selectedPromotionId:
      ((selected as { promotion_id: string | null } | null)?.promotion_id) ?? null,
  };
}
