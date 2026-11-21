import { previewDiscountFils } from "../src/lib/utils/offer-form-preview.ts";

/*
 * The form's live preview.
 *
 * It calls the engine's own discountForPrice, so these tests are really
 * checking two things: that the wiring is right, and that the three
 * form-only concepts — an example price, a minimum, a cap — behave the way
 * the labels on screen claim.
 *
 * Every expectation below is in fils. AED 250,000 is 25,000,000 fils.
 */

let pass = 0;
let fail = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  const a = typeof actual === "bigint" ? actual.toString() : JSON.stringify(actual);
  const b = typeof expected === "bigint" ? expected.toString() : JSON.stringify(expected);

  if (a === b) {
    console.log(`ok   ${label} = ${a}`);
    pass += 1;
  } else {
    console.log(`FAIL ${label}`);
    console.log(`       expected ${b}`);
    console.log(`       actual   ${a}`);
    fail += 1;
  }
}

const base = { maxDiscountText: "", minPurchaseText: "" };

console.log("\n--- a percentage off ---");

{
  const r = previewDiscountFils({
    ...base,
    priceText: "250000",
    discountType: "percentage",
    discountValue: "15",
  });
  eq("15% of AED 250,000", r.discountFils, 3_750_000n);
  eq("  original kept", r.originalFils, 25_000_000n);
  eq("  not capped", r.cappedByMax, false);
}

{
  /*
   * 7.5% is the case that goes wrong in floating point: 0.075 is not exact
   * in binary, which is why the engine goes via basis points instead.
   *
   * 19,999,999 fils × 750 bps / 10,000 = 1,499,999.925 fils exactly. The
   * engine rounds half-up, so that becomes 1,500,000 — a tenth of a fil in
   * the customer's favour. I first wrote 1,499,999 here, which is what
   * truncation would give; the engine is right and the expectation was
   * wrong. Writing the arithmetic out is the only way to be sure which.
   */
  const r = previewDiscountFils({
    ...base,
    priceText: "199999.99",
    discountType: "percentage",
    discountValue: "7.5",
  });
  eq("7.5% of AED 199,999.99 (rounds half-up)", r.discountFils, 1_500_000n);
}

{
  const r = previewDiscountFils({
    ...base,
    priceText: "100",
    discountType: "percentage",
    discountValue: "100",
  });
  eq("100% is the whole price", r.discountFils, 10_000n);
}

console.log("\n--- a fixed amount off ---");

{
  const r = previewDiscountFils({
    ...base,
    priceText: "250000",
    discountType: "fixed",
    discountValue: "5000",
  });
  eq("AED 5,000 off", r.discountFils, 500_000n);
}

{
  /* A discount can never exceed what is being bought. */
  const r = previewDiscountFils({
    ...base,
    priceText: "1000",
    discountType: "fixed",
    discountValue: "5000",
  });
  eq("AED 5,000 off an AED 1,000 car", r.discountFils, 100_000n);
}

console.log("\n--- the cap ---");

{
  const r = previewDiscountFils({
    ...base,
    maxDiscountText: "20000",
    priceText: "500000",
    discountType: "percentage",
    discountValue: "10",
  });
  eq("10% of 500k capped at 20k", r.discountFils, 2_000_000n);
  eq("  reports the cap bit", r.cappedByMax, true);
}

{
  const r = previewDiscountFils({
    ...base,
    maxDiscountText: "20000",
    priceText: "100000",
    discountType: "percentage",
    discountValue: "10",
  });
  eq("10% of 100k under the cap", r.discountFils, 1_000_000n);
  eq("  cap not reported", r.cappedByMax, false);
}

{
  /* Exactly at the cap is not capped: nothing was taken away. */
  const r = previewDiscountFils({
    ...base,
    maxDiscountText: "10000",
    priceText: "100000",
    discountType: "percentage",
    discountValue: "10",
  });
  eq("10% of 100k exactly at a 10k cap", r.discountFils, 1_000_000n);
  eq("  not reported as capped", r.cappedByMax, false);
}

console.log("\n--- the minimum price ---");

{
  const r = previewDiscountFils({
    ...base,
    minPurchaseText: "100000",
    priceText: "50000",
    discountType: "percentage",
    discountValue: "10",
  });
  eq("below the minimum: no discount", r.discountFils, 0n);
  eq("  and says why", r.belowMinimum, true);
}

{
  /* Exactly at the minimum qualifies — "minimum" includes itself. */
  const r = previewDiscountFils({
    ...base,
    minPurchaseText: "100000",
    priceText: "100000",
    discountType: "percentage",
    discountValue: "10",
  });
  eq("exactly at the minimum qualifies", r.discountFils, 1_000_000n);
  eq("  not below", r.belowMinimum, false);
}

console.log("\n--- half-finished input ---");

{
  const r = previewDiscountFils({
    ...base,
    priceText: "",
    discountType: "percentage",
    discountValue: "10",
  });
  eq("no price yet", r.originalFils, null);
  eq("  no discount", r.discountFils, 0n);
}

{
  const r = previewDiscountFils({
    ...base,
    priceText: "250000",
    discountType: "percentage",
    discountValue: "",
  });
  eq("no discount typed yet", r.discountFils, 0n);
  eq("  but the price is known", r.originalFils, 25_000_000n);
}

{
  const r = previewDiscountFils({
    ...base,
    priceText: "abc",
    discountType: "percentage",
    discountValue: "10",
  });
  eq("price is not a number", r.originalFils, null);
}

{
  const r = previewDiscountFils({
    ...base,
    priceText: "0",
    discountType: "percentage",
    discountValue: "10",
  });
  eq("a free car", r.originalFils, null);
}

{
  const r = previewDiscountFils({
    ...base,
    priceText: "250000",
    discountType: "percentage",
    discountValue: "-5",
  });
  eq("a negative discount is no discount", r.discountFils, 0n);
}

console.log(`\n${pass} passed, ${fail} failed`);

if (fail > 0) process.exit(1);
console.log("ALL PASS");
