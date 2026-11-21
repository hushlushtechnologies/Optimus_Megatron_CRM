import {
  eligibilityNote,
  isFinalWithoutCustomer,
} from "../src/lib/utils/offer-eligibility-note.ts";
import { REJECTION_REASONS, type RejectionReason } from "../src/lib/types/offers.ts";

/*
 * "Not eligible" vs "depends on who is buying".
 *
 * The failure mode this guards against: Inventory has no customer in mind,
 * so the engine runs with a blank customer and every customer-dependent rule
 * fails. Reporting that as "not eligible" would tell somebody a campaign
 * does not apply to a car when it applies perfectly well to the right buyer
 * — and it would make Inventory and Sales disagree about the same car and
 * the same campaign.
 */

let pass = 0;
let fail = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);

  if (a === b) {
    console.log(`ok   ${label}`);
    pass += 1;
  } else {
    console.log(`FAIL ${label}`);
    console.log(`       expected ${b}`);
    console.log(`       actual   ${a}`);
    fail += 1;
  }
}

console.log("\n--- reasons about the CAR or CAMPAIGN are final either way ---");

const aboutTheThing: RejectionReason[] = [
  "not_live",
  "not_started",
  "ended",
  "archived",
  "wrong_status",
  "car_not_targeted",
  "below_minimum_purchase",
  "campaign_limit_reached",
  "code_inactive",
  "code_limit_reached",
  "no_discount",
];

for (const reason of aboutTheThing) {
  eq(`${reason}: final without a customer`, isFinalWithoutCustomer(reason), true);
  eq(`${reason}: verdict is not_eligible`, eligibilityNote(reason, false).verdict, "not_eligible");
  eq(`${reason}: same with a customer`, eligibilityNote(reason, true).verdict, "not_eligible");
}

console.log("\n--- reasons about the CUSTOMER are unknown without one ---");

const aboutTheBuyer: RejectionReason[] = [
  "customer_not_eligible",
  "customer_limit_reached",
  "assignment_required",
  "assignment_expired",
  "assignment_used",
  "code_required",
  "code_customer_limit_reached",
  "blocked_by_stacking",
  "already_applied_to_deal",
];

for (const reason of aboutTheBuyer) {
  eq(`${reason}: not final without a customer`, isFinalWithoutCustomer(reason), false);
  eq(
    `${reason}: verdict is depends_on_customer`,
    eligibilityNote(reason, false).verdict,
    "depends_on_customer",
  );
  /* WITH a customer the engine really did decide, so it is a refusal. */
  eq(`${reason}: a real refusal with a customer`, eligibilityNote(reason, true).verdict, "not_eligible");
}

console.log("\n--- every reason is classified, none fall through ---");

/*
 * A reason added to the engine later must be classified deliberately. This
 * asserts the set is complete, so a new reason shows up as a failure here
 * rather than silently defaulting.
 */
const classified = new Set([...aboutTheThing, ...aboutTheBuyer]);

for (const reason of REJECTION_REASONS) {
  eq(`${reason} is classified`, classified.has(reason), true);
}

eq("no reason is in both lists", aboutTheThing.filter((r) => aboutTheBuyer.includes(r)).length, 0);
eq(
  "the two lists cover every reason",
  classified.size,
  REJECTION_REASONS.length,
);

console.log("\n--- the wording never mentions a customer who isn't there ---");

for (const reason of aboutTheBuyer) {
  const note = eligibilityNote(reason, false);

  /* "This customer doesn't qualify" is a sentence about nobody. */
  const namesAbsentCustomer = /\bthis customer\b/i.test(note.message);

  eq(`${reason}: doesn't say "this customer"`, namesAbsentCustomer, false);
  eq(`${reason}: has a message`, note.message.length > 0, true);
}

console.log(`\n${pass} passed, ${fail} failed`);

if (fail > 0) process.exit(1);
console.log("ALL PASS");
