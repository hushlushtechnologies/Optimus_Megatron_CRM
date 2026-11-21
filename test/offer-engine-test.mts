import type {
  CustomerOfferAssignment,
  OfferCarContext,
  OfferCustomerContext,
  Promotion,
  PromotionCode,
} from "../src/lib/types/offers.ts";
import { carIsTargeted, discountForPrice, evaluateOffers } from "../src/lib/utils/offer-rules";

let fails = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = typeof got === "bigint" ? got.toString() : JSON.stringify(got);
  const w = typeof want === "bigint" ? want.toString() : JSON.stringify(want);
  if (g !== w) {
    console.log(`FAIL ${label}: got ${g}, wanted ${w}`);
    fails++;
  } else console.log(`ok   ${label} = ${g}`);
};

const AED = (n: number) => BigInt(n) * 100n;

const base = (over: Partial<Promotion>): Promotion => ({
  id: "p1",
  name: "Test",
  reference: null,
  description: null,
  promotionType: "general",
  status: "active",
  discountType: "fixed",
  discountValue: 25000,
  startsAt: null,
  endsAt: null,
  priority: 0,
  maxRedemptions: null,
  maxPerCustomer: null,
  redemptionCount: 0,
  minPurchaseFils: null,
  maxDiscountFils: null,
  pointsMultiplier: null,
  stackingPolicy: "none",
  archivedAt: null,
  targets: [],
  eligibilityRules: [],
  ...over,
});

const ferrari: OfferCarContext = {
  id: "car-ferrari",
  brandId: "b-ferrari",
  modelId: "m-296",
  collectionId: "c-luxury",
  locationId: "l-dubai",
  priceFils: AED(1_200_000),
};
const amg: OfferCarContext = {
  id: "car-amg",
  brandId: "b-merc",
  modelId: "m-g63",
  collectionId: "c-premium",
  locationId: "l-dubai",
  priceFils: AED(800_000),
};

const ahmed: OfferCustomerContext = {
  id: "ahmed",
  lifecycleStatus: "VIP",
  tagIds: ["t-vip"],
  completedDeals: 3,
  lifetimeSpendFils: AED(2_500_000),
  interestedBrandIds: ["b-ferrari"],
};
const mohammed: OfferCustomerContext = {
  id: "mohammed",
  lifecycleStatus: "Active",
  tagIds: [],
  completedDeals: 0,
  lifetimeSpendFils: 0n,
  interestedBrandIds: ["b-merc"],
};

console.log("--- exact money, no floats ---");
eq("AED 25,000 fixed off", discountForPrice(base({}), AED(1_200_000)), AED(25_000));
// 7.5% of 1,200,000 = 90,000 exactly. A float would risk 89999.999...
eq(
  "7.5% of 1.2m is exact",
  discountForPrice(base({ discountType: "percentage", discountValue: 7.5 }), AED(1_200_000)),
  AED(90_000),
);
// 3.33% of 999,999.99 — the awkward one.
// 99,999,999 x 333bps = 33,299,999,667; /10,000 = 3,329,999.9667; half-up = 3,330,000.
eq(
  "3.33% of 999999.99 rounds half-up",
  discountForPrice(base({ discountType: "percentage", discountValue: 3.33 }), 99_999_999n),
  3_330_000n,
);
eq("discount capped at the price", discountForPrice(base({ discountValue: 9_999_999 }), AED(100)), AED(100));
eq(
  "max_discount_fils caps it",
  discountForPrice(
    base({ discountType: "percentage", discountValue: 50, maxDiscountFils: AED(30_000) }),
    AED(1_200_000),
  ),
  AED(30_000),
);

console.log("\n--- targeting: overlapping targets must not double up ---");
const overlapping = base({
  targets: [
    { id: "t1", targetKind: "brand", targetId: "b-ferrari" },
    { id: "t2", targetKind: "collection", targetId: "c-luxury" },
    { id: "t3", targetKind: "car", targetId: "car-ferrari" },
  ],
});
eq("car matching three targets matches once", carIsTargeted(overlapping, ferrari), true);
const r = evaluateOffers({ promotions: [overlapping], customer: ahmed, car: ferrari, assignments: [] });
eq("…and yields exactly one discount", r.eligible.length, 1);
eq("…of the single amount", r.eligible[0].discountFils, AED(25_000));
eq("no targets = every vehicle", carIsTargeted(base({}), amg), true);

console.log("\n--- the plan's own scenario: Ahmed's private offer ---");
const ahmedOffer = base({ id: "p-ahmed", promotionType: "customer", discountValue: 25000 });
const assignment: CustomerOfferAssignment = {
  id: "a1",
  promotionId: "p-ahmed",
  customerId: "ahmed",
  carId: "car-ferrari",
  dealId: null,
  validFrom: null,
  validTo: null,
  discountOverrideFils: null,
  status: "active",
  notes: null,
};

const forAhmed = evaluateOffers({
  promotions: [ahmedOffer],
  customer: ahmed,
  car: ferrari,
  assignments: [assignment],
});
eq("Ahmed gets it", forAhmed.eligible.length, 1);
eq("…AED 25,000", forAhmed.eligible[0].discountFils, AED(25_000));

const forMohammed = evaluateOffers({
  promotions: [ahmedOffer],
  customer: mohammed,
  car: ferrari,
  assignments: [assignment],
});
eq("Mohammed does NOT get it", forMohammed.eligible.length, 0);
eq("…and is told why", forMohammed.rejected[0].reason, "assignment_required");

// Ahmed's offer is pinned to the Ferrari; it must not apply to the AMG.
const wrongCar = evaluateOffers({
  promotions: [ahmedOffer],
  customer: ahmed,
  car: amg,
  assignments: [assignment],
});
eq("pinned offer doesn't apply to another car", wrongCar.rejected[0].reason, "car_not_targeted");

console.log("\n--- VIP via lifecycle_status, not a boolean ---");
const vipOnly = base({
  id: "p-vip",
  eligibilityRules: [{ id: "r1", ruleKind: "lifecycle_status", operator: "in", value: ["VIP"] }],
});
eq(
  "VIP Ahmed qualifies",
  evaluateOffers({ promotions: [vipOnly], customer: ahmed, car: ferrari, assignments: [] }).eligible.length,
  1,
);
eq(
  "Active Mohammed does not",
  evaluateOffers({ promotions: [vipOnly], customer: mohammed, car: ferrari, assignments: [] }).rejected[0]
    .reason,
  "customer_not_eligible",
);

console.log("\n--- an unknown rule kind must fail CLOSED ---");
const broken = base({
  id: "p-broken",
  eligibilityRules: [{ id: "r1", ruleKind: "something_new" as never, operator: "in", value: ["x"] }],
});
eq(
  "unknown rule rejects rather than admitting everyone",
  evaluateOffers({ promotions: [broken], customer: ahmed, car: ferrari, assignments: [] }).rejected[0].reason,
  "customer_not_eligible",
);

console.log("\n--- no silent double discounting ---");
const noStack = base({ id: "p-nostack", stackingPolicy: "none" });
const withManual = base({ id: "p-stackable", stackingPolicy: "with_manual" });

const manualOnDeal = { manualDiscountFils: AED(10_000) };
eq(
  "non-stacking campaign blocked by a manual discount",
  evaluateOffers({ promotions: [noStack], customer: ahmed, car: ferrari, assignments: [], ...manualOnDeal })
    .rejected[0].reason,
  "blocked_by_stacking",
);
eq(
  "stackable one is allowed",
  evaluateOffers({
    promotions: [withManual],
    customer: ahmed,
    car: ferrari,
    assignments: [],
    ...manualOnDeal,
  }).eligible.length,
  1,
);
eq(
  "loyalty also blocks a non-stacking campaign",
  evaluateOffers({
    promotions: [noStack],
    customer: ahmed,
    car: ferrari,
    assignments: [],
    loyaltyPointsApplied: 1000,
  }).rejected[0].reason,
  "blocked_by_stacking",
);
eq(
  "with_manual does NOT imply with_loyalty",
  evaluateOffers({
    promotions: [withManual],
    customer: ahmed,
    car: ferrari,
    assignments: [],
    loyaltyPointsApplied: 1000,
  }).rejected[0].reason,
  "blocked_by_stacking",
);

console.log("\n--- dates and limits ---");
const future = base({ id: "p-future", startsAt: new Date(Date.now() + 86400000).toISOString() });
const past = base({ id: "p-past", endsAt: new Date(Date.now() - 86400000).toISOString() });
eq(
  "not started",
  evaluateOffers({ promotions: [future], customer: ahmed, car: ferrari, assignments: [] }).rejected[0].reason,
  "not_started",
);
eq(
  "ended",
  evaluateOffers({ promotions: [past], customer: ahmed, car: ferrari, assignments: [] }).rejected[0].reason,
  "ended",
);
eq(
  "campaign limit reached",
  evaluateOffers({
    promotions: [base({ maxRedemptions: 5, redemptionCount: 5 })],
    customer: ahmed,
    car: ferrari,
    assignments: [],
  }).rejected[0].reason,
  "campaign_limit_reached",
);
eq(
  "per-customer limit reached",
  evaluateOffers({
    promotions: [base({ id: "p1", maxPerCustomer: 1 })],
    customer: ahmed,
    car: ferrari,
    assignments: [],
    customerRedemptionCounts: { p1: 1 },
  }).rejected[0].reason,
  "customer_limit_reached",
);
eq(
  "already on this deal",
  evaluateOffers({
    promotions: [base({ id: "p1" })],
    customer: ahmed,
    car: ferrari,
    assignments: [],
    appliedPromotionIds: ["p1"],
  }).rejected[0].reason,
  "already_applied_to_deal",
);
eq(
  "below minimum purchase",
  evaluateOffers({
    promotions: [base({ minPurchaseFils: AED(2_000_000) })],
    customer: ahmed,
    car: ferrari,
    assignments: [],
  }).rejected[0].reason,
  "below_minimum_purchase",
);

console.log("\n--- codes ---");
const codePromo = base({ id: "p-code", promotionType: "code", discountValue: 5000 });
const code: PromotionCode = {
  id: "c1",
  promotionId: "p-code",
  code: "LUXURY2027",
  usageLimit: 10,
  perCustomerLimit: 1,
  usedCount: 0,
  isActive: true,
};
eq(
  "no code typed",
  evaluateOffers({ promotions: [codePromo], customer: ahmed, car: ferrari, assignments: [] }).rejected[0]
    .reason,
  "code_required",
);
eq(
  "right code works",
  evaluateOffers({ promotions: [codePromo], customer: ahmed, car: ferrari, assignments: [], code }).eligible
    .length,
  1,
);
eq(
  "inactive code",
  evaluateOffers({
    promotions: [codePromo],
    customer: ahmed,
    car: ferrari,
    assignments: [],
    code: { ...code, isActive: false },
  }).rejected[0].reason,
  "code_inactive",
);
eq(
  "exhausted code",
  evaluateOffers({
    promotions: [codePromo],
    customer: ahmed,
    car: ferrari,
    assignments: [],
    code: { ...code, usedCount: 10 },
  }).rejected[0].reason,
  "code_limit_reached",
);

console.log("\n--- determinism: ties never depend on row order ---");
const a = base({ id: "aaa", priority: 5, discountValue: 10000 });
const b = base({ id: "bbb", priority: 5, discountValue: 10000 });
const order1 = evaluateOffers({ promotions: [a, b], customer: ahmed, car: ferrari, assignments: [] }).best!
  .promotion.id;
const order2 = evaluateOffers({ promotions: [b, a], customer: ahmed, car: ferrari, assignments: [] }).best!
  .promotion.id;
eq("same winner whichever order they arrive in", order1, order2);

const high = base({ id: "high", priority: 10, discountValue: 5000 });
const big = base({ id: "big", priority: 1, discountValue: 50000 });
eq(
  "priority beats a bigger discount",
  evaluateOffers({ promotions: [high, big], customer: ahmed, car: ferrari, assignments: [] }).best!.promotion
    .id,
  "high",
);

console.log("\n--- a points-multiplier campaign with no discount is still eligible ---");
eq(
  "double points, no money off",
  evaluateOffers({
    promotions: [base({ id: "p-pts", discountType: "fixed", discountValue: 0, pointsMultiplier: 2 })],
    customer: ahmed,
    car: ferrari,
    assignments: [],
  }).eligible.length,
  1,
);

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
