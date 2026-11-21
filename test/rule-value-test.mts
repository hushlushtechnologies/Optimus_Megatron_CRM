import { shapeRuleValue } from "../src/lib/utils/offer-rule-values.ts";

/*
 * shapeRuleValue turns a form's text into the jsonb the engine reads.
 *
 * The case that matters is min_lifetime_spend_fils: somebody types dirhams
 * and the column holds fils. Get that wrong by a factor of a hundred and a
 * campaign meant for customers who have spent AED 50,000 goes out to anyone
 * who has spent AED 500 — or to nobody at all.
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

console.log("\n--- lifetime spend: dirhams in, fils out ---");

eq("AED 50000", shapeRuleValue("min_lifetime_spend_fils", "gte", "50000"), 5_000_000);
eq("AED 1", shapeRuleValue("min_lifetime_spend_fils", "gte", "1"), 100);
eq("AED 0.01", shapeRuleValue("min_lifetime_spend_fils", "gte", "0.01"), 1);
eq("AED 999999.99", shapeRuleValue("min_lifetime_spend_fils", "gte", "999999.99"), 99_999_999);
eq("AED 1234.5", shapeRuleValue("min_lifetime_spend_fils", "gte", "1234.5"), 123_450);

console.log("\n--- lifetime spend: nothing sensible typed ---");

/* Zero, not null: the column is not null, and a nonsense rule must pass
   everyone rather than reject everyone or break the insert. */
eq("empty", shapeRuleValue("min_lifetime_spend_fils", "gte", ""), 0);
eq("letters", shapeRuleValue("min_lifetime_spend_fils", "gte", "abc"), 0);
eq("null", shapeRuleValue("min_lifetime_spend_fils", "gte", null), 0);
eq("whitespace", shapeRuleValue("min_lifetime_spend_fils", "gte", "   "), 0);

console.log("\n--- counts stay counts, no fils conversion ---");

eq("3 completed deals", shapeRuleValue("min_completed_deals", "gte", "3"), 3);
eq("0 completed deals", shapeRuleValue("min_completed_deals", "gte", "0"), 0);
eq("rubbish count", shapeRuleValue("min_completed_deals", "gte", "x"), 0);

console.log("\n--- lists become arrays ---");

eq("one status", shapeRuleValue("lifecycle_status", "in", "VIP"), ["VIP"]);
eq("one tag id", shapeRuleValue("customer_tag", "in", "abc-123"), ["abc-123"]);
eq("not_in", shapeRuleValue("lifecycle_status", "not_in", "Do Not Contact"), ["Do Not Contact"]);
eq("empty list", shapeRuleValue("lifecycle_status", "in", ""), []);
eq("already an array", shapeRuleValue("lifecycle_status", "in", ["VIP", "Active"]), ["VIP", "Active"]);

console.log("\n--- booleans ---");

eq("existing customer", shapeRuleValue("is_existing_customer", "eq", "true"), true);
eq("new customer", shapeRuleValue("is_existing_customer", "eq", "false"), false);

console.log("\n--- whitespace is trimmed before anything else ---");

eq("padded amount", shapeRuleValue("min_lifetime_spend_fils", "gte", "  50000  "), 5_000_000);
eq("padded status", shapeRuleValue("lifecycle_status", "in", "  VIP  "), ["VIP"]);

console.log("\n--- an empty list never means 'everyone' by accident ---");

/* An empty array for `in` matches nobody, which is the safe direction: a
   half-filled rule must not widen the audience. */
const emptyIn = shapeRuleValue("lifecycle_status", "in", "");
eq("empty `in` is an empty array, not null", emptyIn, []);
eq("empty `in` is not a wildcard", Array.isArray(emptyIn) && emptyIn.length === 0, true);

console.log(`\n${pass} passed, ${fail} failed`);

if (fail > 0) process.exit(1);
console.log("ALL PASS");
