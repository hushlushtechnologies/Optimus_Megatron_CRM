import { upsertPromotionSchema } from "../src/lib/validation/offers.ts";
import { discountForPrice } from "../src/lib/utils/offer-rules.ts";
import { computePricePreview } from "../src/lib/utils/price-preview.ts";
import { filsToDecimalString, toFils } from "../src/lib/utils/sales-money.ts";

/*
 * Discount rates that cannot be represented exactly.
 *
 * percentToBps does Math.round(percent * 100), and says so in its own
 * comment: percentages have at most two decimals. So 12.345% silently
 * becomes 12.35% — AED 50 on a million-dirham car, given away by a rounding
 * step nobody chose.
 *
 * A fixed discount is worse: discountForPrice does
 * Math.round(discountValue), because the legacy column is whole dirhams. So
 * AED 5,000.50 silently becomes AED 5,000.
 *
 * Worse than either on its own, Inventory's own preview uses float maths and
 * does NOT round the rate, so the two screens would show different discounts
 * for the same campaign on the same car.
 *
 * The schema now refuses what cannot be represented, so nothing is rounded
 * quietly. These tests check the refusal, and then check that the two
 * calculations agree on everything that is accepted.
 */

let pass = 0;
let fail = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`ok   ${label}`);
    pass += 1;
  } else {
    console.log(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    fail += 1;
  }
}

const base = {
  name: "Precision Test",
  promotionType: "general" as const,
  startsAt: "",
  endsAt: "",
  targets: [],
  eligibilityRules: [],
};

function accepts(discountType: "percentage" | "fixed", discountValue: number): boolean {
  return upsertPromotionSchema.safeParse({ ...base, discountType, discountValue }).success;
}

console.log("\n--- percentages: two decimals is the limit ---");

eq("15% accepted", accepts("percentage", 15), true);
eq("7.5% accepted", accepts("percentage", 7.5), true);
eq("12.35% accepted", accepts("percentage", 12.35), true);
eq("3.33% accepted", accepts("percentage", 3.33), true);
eq("0.01% accepted (one basis point)", accepts("percentage", 0.01), true);
eq("100% accepted", accepts("percentage", 100), true);

eq("12.345% REFUSED", accepts("percentage", 12.345), false);
eq("7.555% REFUSED", accepts("percentage", 7.555), false);
eq("0.001% REFUSED (less than a basis point)", accepts("percentage", 0.001), false);

console.log("\n--- fixed amounts: whole dirhams ---");

eq("AED 5,000 accepted", accepts("fixed", 5000), true);
eq("AED 1 accepted", accepts("fixed", 1), true);
eq("AED 999,999 accepted", accepts("fixed", 999999), true);

eq("AED 5,000.50 REFUSED", accepts("fixed", 5000.5), false);
eq("AED 0.99 REFUSED", accepts("fixed", 0.99), false);

console.log("\n--- over 100% is still refused, for the right reason ---");

eq("101% refused", accepts("percentage", 101), false);

console.log("\n--- the two calculations agree on what IS accepted ---");

/*
 * Inventory's float preview against the fils engine. These must match, or a
 * car shows one discount on the Inventory screen and another on the deal.
 */
const prices = [250000, 199999.99, 85000, 1000000, 123456.78, 999999.99, 12345.67, 450000];
const promos = [
  { discount_type: "percentage" as const, discount_value: 15 },
  { discount_type: "percentage" as const, discount_value: 7.5 },
  { discount_type: "percentage" as const, discount_value: 3.33 },
  { discount_type: "percentage" as const, discount_value: 12.35 },
  { discount_type: "percentage" as const, discount_value: 100 },
  { discount_type: "fixed" as const, discount_value: 5000 },
];

let identical = 0;
const divergences: string[] = [];

for (const price of prices) {
  for (const promo of promos) {
    /* Only compare what the schema would let somebody create. */
    if (!accepts(promo.discount_type, promo.discount_value)) continue;

    const float = computePricePreview(price, { id: "x", name: "x", ...promo });
    if (!float) continue;

    const priceFils = toFils(price)!;
    const engine = discountForPrice(
      {
        discountType: promo.discount_type,
        discountValue: promo.discount_value,
        maxDiscountFils: null,
      },
      priceFils,
    );

    const floatFils = toFils(float.discountAmount.toFixed(2))!;

    if (engine === floatFils) identical += 1;
    else {
      divergences.push(
        `${price} @ ${promo.discount_value}: float ${filsToDecimalString(floatFils)}, ` +
          `engine ${filsToDecimalString(engine)}`,
      );
    }
  }
}

eq(`all ${identical} comparisons identical`, divergences.length, 0);

if (divergences.length > 0) {
  console.log("\ndivergences:");
  divergences.forEach((d) => console.log(`  ${d}`));
}

console.log("\n--- the one known rounding difference, documented ---");

/*
 * 7.5% of AED 1 is 0.075. The float preview truncates to 0.07; the engine
 * rounds half-up to 0.08. One fil, on a one-dirham car.
 *
 * Left alone deliberately: closing it means changing the rounding of a
 * shared Inventory function for a case that cannot arise on a vehicle. It is
 * asserted here so that it is a known quantity rather than a surprise.
 */
const tinyFloat = computePricePreview(1, {
  id: "x",
  name: "x",
  discount_type: "percentage",
  discount_value: 7.5,
})!;

const tinyEngine = discountForPrice(
  { discountType: "percentage", discountValue: 7.5, maxDiscountFils: null },
  toFils(1)!,
);

eq("float truncates 0.075 to 0.07", toFils(tinyFloat.discountAmount.toFixed(2))!.toString(), "7");
eq("engine rounds 0.075 to 0.08", tinyEngine.toString(), "8");
eq("the gap is exactly one fil", (tinyEngine - 7n).toString(), "1");

console.log(`\n${pass} passed, ${fail} failed`);

if (fail > 0) process.exit(1);
console.log("ALL PASS");
