import {
  receiptEligibility,
  receiptRefusal,
} from "../src/lib/utils/receipt-eligibility.ts";
import { PAYMENT_TRANSITIONS } from "../src/lib/types/sales.ts";

/*
 * The one decision in this sprint whose output leaves the building.
 *
 * A receipt is the dealership telling a customer, in writing, that it has
 * their money. Every other document here is read by staff who know the
 * system; this one is read by somebody who will file it and, if there is
 * ever a dispute, produce it.
 *
 * So the failure that matters is not "the receipt did not print". It is
 * "the receipt printed when it should not have" — and there are exactly
 * three ways to get there:
 *
 *   1. Recorded treated as Verified. One employee's claim that money
 *      arrived becomes a written confirmation that it did. This is the
 *      forbidden thing in the sprint brief, and a receipt is the most
 *      expensive place to do it.
 *
 *   2. A refund printed as a receipt. The two say opposite things about
 *      who owes whom. A customer holding a "receipt" for money they were
 *      given back has a document that contradicts the ledger.
 *
 *   3. An unrecognised status falling through to allowed. Add a status to
 *      the database — Disputed, Held, Pending Clearance — and a default
 *      that permits means every payment in it gets a receipt from the day
 *      it is introduced, with nobody having decided that.
 *
 * The exhaustive loop below is deliberate. The statuses are read from the
 * application's own transition map rather than typed out here, so a status
 * added to the schema arrives in this test automatically rather than
 * waiting for somebody to remember.
 */

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail?: string): void {
  checks += 1;

  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }

  failures += 1;
  console.error(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
}

/* Every status the application knows about, from its own transition map. */
const KNOWN_STATUSES = Object.keys(PAYMENT_TRANSITIONS);

console.log(`\nstatuses under test: ${KNOWN_STATUSES.join(", ")}`);

/*
|--------------------------------------------------------------------------
| 1. EXACTLY ONE COMBINATION IS ALLOWED
|--------------------------------------------------------------------------
*/

console.log("\nthe permitted combination");

{
  const allowed: string[] = [];

  for (const status of KNOWN_STATUSES) {
    for (const direction of ["in", "out"]) {
      if (receiptEligibility({ status, direction }).allowed) {
        allowed.push(`${status}/${direction}`);
      }
    }
  }

  check(
    "only Verified incoming payments may have a receipt",
    allowed.length === 1 && allowed[0] === "Verified/in",
    `allowed: ${allowed.join(", ") || "(none)"}`,
  );
}

/*
|--------------------------------------------------------------------------
| 2. RECORDED IS REFUSED, AND SAYS WHY
|--------------------------------------------------------------------------
*/

console.log("\nRecorded is not Verified");

{
  const result = receiptEligibility({ status: "Recorded", direction: "in" });

  check("a recorded payment gets no receipt", !result.allowed);

  check(
    "the refusal names the verification state, not a permissions problem",
    !result.allowed && result.reason === "unverified" && result.current === "Recorded",
    JSON.stringify(result),
  );
}

/*
|--------------------------------------------------------------------------
| 3. REFUNDS ARE REFUSED AS REFUNDS
|--------------------------------------------------------------------------
*/

console.log("\nrefunds");

{
  for (const status of KNOWN_STATUSES) {
    const result = receiptEligibility({ status, direction: "out" });

    check(
      `an outgoing ${status.toLowerCase()} payment gets no receipt`,
      !result.allowed,
      JSON.stringify(result),
    );
  }

  /*
   * A verified refund is the dangerous one: it passes the status check, so
   * code that tests status first and direction second — or forgets
   * direction entirely — issues a receipt for money that went out.
   */
  const verifiedRefund = receiptEligibility({ status: "Verified", direction: "out" });

  check(
    "a VERIFIED refund is refused as a refund, not allowed through",
    !verifiedRefund.allowed && verifiedRefund.reason === "refund",
    JSON.stringify(verifiedRefund),
  );
}

/*
|--------------------------------------------------------------------------
| 4. UNKNOWN STATES DEFAULT TO REFUSING
|--------------------------------------------------------------------------
*/

console.log("\nunknown and malformed states");

{
  const strangers = [
    { status: "Disputed", direction: "in" },
    { status: "Held", direction: "in" },
    { status: "Pending Clearance", direction: "in" },
    { status: "", direction: "in" },
    { status: "verified", direction: "in" }, // wrong case
    { status: "VERIFIED", direction: "in" },
    { status: "Verified", direction: "" },
    { status: "Verified", direction: "IN" }, // wrong case
    { status: "Verified ", direction: "in" }, // trailing space
  ];

  for (const candidate of strangers) {
    check(
      `refused: status ${JSON.stringify(candidate.status)}, direction ${JSON.stringify(candidate.direction)}`,
      !receiptEligibility(candidate).allowed,
    );
  }

  /*
   * Case sensitivity is a deliberate choice, not an oversight. The database
   * stores "Verified" with a capital V under a CHECK constraint, so a
   * lowercase value means something upstream is not what this code thinks
   * it is — and guessing at that is how Sprint 8's promotion notifications
   * compared against "Active" and never fired. Refusing is the safe
   * direction when the shape is unexpected.
   */
  check(
    "a lowercase status is refused rather than guessed at",
    !receiptEligibility({ status: "verified", direction: "in" }).allowed,
  );
}

/*
|--------------------------------------------------------------------------
| 5. THE TRANSITION MAP AND THE RECEIPT RULE AGREE
|--------------------------------------------------------------------------
*/

console.log("\nagreement with the payment model");

{
  /*
   * The application's rule, stated in sales.ts, is "only verified payments
   * count toward what a customer has paid". A receipt is the written form
   * of that claim, so the set of statuses that may have a receipt must be a
   * subset of the statuses that count. If somebody later makes Recorded
   * count toward paid totals, this test should be revisited deliberately —
   * not silently satisfied.
   */
  const receiptable = KNOWN_STATUSES.filter(
    (status) => receiptEligibility({ status, direction: "in" }).allowed,
  );

  check(
    "every status that may have a receipt is terminal-or-verified in the transition map",
    receiptable.every((status) => status === "Verified"),
    `receiptable: ${receiptable.join(", ")}`,
  );

  check(
    "Verified is a status the transition map knows",
    KNOWN_STATUSES.includes("Verified"),
    KNOWN_STATUSES.join(", "),
  );
}

/*
|--------------------------------------------------------------------------
| 6. A FAILED CHECK IS NOT AN APPROVAL
|--------------------------------------------------------------------------
*/

console.log("\nwhen the check itself fails");

{
  /*
   * The subtle one, and the reason this mapping is a function rather than
   * a few inline ifs.
   *
   * If the eligibility lookup times out and the code treats "no refusal
   * found" as "allowed", the control disappears at precisely the moment
   * the database is unhealthy — which is the worst possible moment to be
   * assuming a payment is verified. An unavailable check must refuse.
   */
  const timedOut = receiptRefusal({
    eligibility: null,
    error: "statement timeout",
    missing: false,
  });

  check("a failed lookup refuses rather than allowing", timedOut !== null, String(timedOut));

  check(
    "the failure is worded as a retry, not as a verification problem",
    (timedOut ?? "").toLowerCase().includes("try again"),
    String(timedOut),
  );

  check(
    "a failed lookup does not leak the database error",
    !(timedOut ?? "").includes("statement timeout"),
    String(timedOut),
  );

  const missing = receiptRefusal({ eligibility: null, error: null, missing: true });

  check("a missing payment refuses", missing !== null, String(missing));

  check(
    "a missing payment says so, rather than falling through to a vaguer refusal",
    (missing ?? "").toLowerCase().includes("could not be found"),
    String(missing),
  );

  /* Null eligibility with no error and not missing should still refuse —
   * there is no state in which "we could not tell" means yes. */
  const indeterminate = receiptRefusal({ eligibility: null, error: null, missing: false });

  check("an indeterminate check refuses", indeterminate !== null, String(indeterminate));

  /* And the allowed path must actually allow, or the button never works. */
  const allowed = receiptRefusal({
    eligibility: { allowed: true },
    error: null,
    missing: false,
  });

  check("a verified incoming payment is allowed through", allowed === null, String(allowed));

  const unverified = receiptRefusal({
    eligibility: { allowed: false, reason: "unverified", current: "Recorded" },
    error: null,
    missing: false,
  });

  check(
    "the Recorded refusal names the next step",
    (unverified ?? "").toLowerCase().includes("verify it first"),
    String(unverified),
  );

  const refund = receiptRefusal({
    eligibility: { allowed: false, reason: "refund" },
    error: null,
    missing: false,
  });

  check(
    "the refund refusal says it is a refund",
    (refund ?? "").toLowerCase().includes("refund"),
    String(refund),
  );
}

console.log(`\n${checks} checks, ${failures} failed.`);

if (failures > 0) process.exit(1);
