import {
  ruleValueToInput,
  toDubaiLocalInput,
} from "../src/lib/utils/offer-detail-to-form.ts";
import { shapeRuleValue } from "../src/lib/utils/offer-rule-values.ts";

/*
 * Loading a saved campaign back into the form, and the round trip.
 *
 * This is the conversion where a silent bug does real damage: open a
 * campaign to fix a typo, save it, and its minimum price is a hundred times
 * what it was. So the pair of functions is tested together — shapeRuleValue
 * on the way in, ruleValueToInput on the way out — and the round trip has to
 * land back where it started.
 */

let pass = 0;
let fail = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);

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

console.log("\n--- timestamps: UTC instant to Dubai wall clock ---");

eq("midday UTC is 4pm in Dubai", toDubaiLocalInput("2026-12-01T12:00:00Z"), "2026-12-01T16:00");
eq("8pm Dubai, given as +04:00", toDubaiLocalInput("2026-12-01T20:00:00+04:00"), "2026-12-01T20:00");
eq("midnight Dubai", toDubaiLocalInput("2026-11-30T20:00:00Z"), "2026-12-01T00:00");

/* 10pm UTC is 2am the NEXT day in Dubai — the case that breaks a naive slice. */
eq("crossing midnight", toDubaiLocalInput("2026-12-01T22:00:00Z"), "2026-12-02T02:00");

/* Dubai has no daylight saving, so a July date behaves exactly like a December one. */
eq("July behaves like December", toDubaiLocalInput("2026-07-01T12:00:00Z"), "2026-07-01T16:00");

eq("null is blank", toDubaiLocalInput(null), "");
eq("rubbish is blank", toDubaiLocalInput("not a date"), "");

console.log("\n--- rule values: out of the database, into the form ---");

eq("a status array shows its value", ruleValueToInput("lifecycle_status", ["VIP"]), "VIP");
eq("an empty array is blank", ruleValueToInput("lifecycle_status", []), "");
eq("a boolean true", ruleValueToInput("is_existing_customer", true), "true");
eq("a boolean false", ruleValueToInput("is_existing_customer", false), "false");
eq("a plain count", ruleValueToInput("min_completed_deals", 3), "3");
eq("null is blank", ruleValueToInput("lifecycle_status", null), "");

console.log("\n--- lifetime spend: fils out, dirhams in ---");

eq("5,000,000 fils is AED 50,000", ruleValueToInput("min_lifetime_spend_fils", 5000000), "50000");
eq("100 fils is AED 1", ruleValueToInput("min_lifetime_spend_fils", 100), "1");
eq("1 fil is AED 0.01", ruleValueToInput("min_lifetime_spend_fils", 1), "0.01");
eq("0 is AED 0", ruleValueToInput("min_lifetime_spend_fils", 0), "0");
eq("odd fils keep their decimals", ruleValueToInput("min_lifetime_spend_fils", 123456), "1234.56");

console.log("\n--- THE ROUND TRIP ---");

/*
 * form value → shapeRuleValue → (what the database stores) → ruleValueToInput
 * must give back the form value. If these two drift, a rule changes every
 * time somebody opens the edit form, without anybody touching it.
 */
const trips: { kind: string; operator: string; value: string }[] = [
  { kind: "lifecycle_status", operator: "in", value: "VIP" },
  { kind: "lifecycle_status", operator: "in", value: "Active" },
  { kind: "lifecycle_status", operator: "not_in", value: "Do Not Contact" },
  { kind: "customer_tag", operator: "in", value: "abc-123-def" },
  { kind: "interested_brand", operator: "in", value: "brand-uuid-here" },
  { kind: "min_completed_deals", operator: "gte", value: "2" },
  { kind: "min_completed_deals", operator: "gte", value: "0" },
  { kind: "min_lifetime_spend_fils", operator: "gte", value: "50000" },
  { kind: "min_lifetime_spend_fils", operator: "gte", value: "1" },
  { kind: "min_lifetime_spend_fils", operator: "gte", value: "0.01" },
  { kind: "min_lifetime_spend_fils", operator: "gte", value: "1234.56" },
  { kind: "min_lifetime_spend_fils", operator: "gte", value: "999999.99" },
  { kind: "is_existing_customer", operator: "eq", value: "true" },
  { kind: "is_existing_customer", operator: "eq", value: "false" },
];

for (const trip of trips) {
  const stored = shapeRuleValue(trip.kind, trip.operator, trip.value);
  const back = ruleValueToInput(trip.kind, stored);

  eq(`${trip.kind} "${trip.value}" survives the round trip`, back, trip.value);
}

console.log("\n--- the round trip is stable on a second pass ---");

/*
 * Saving an unchanged form must not move the value. One trip proves the
 * functions agree; two proves nothing accumulates — a conversion that
 * rounded each time would pass the first test and fail this one.
 */
for (const trip of trips) {
  const once = ruleValueToInput(trip.kind, shapeRuleValue(trip.kind, trip.operator, trip.value));
  const twice = ruleValueToInput(trip.kind, shapeRuleValue(trip.kind, trip.operator, once));

  eq(`${trip.kind} "${trip.value}" is stable`, twice, once);
}

console.log(`\n${pass} passed, ${fail} failed`);

if (fail > 0) process.exit(1);
console.log("ALL PASS");
