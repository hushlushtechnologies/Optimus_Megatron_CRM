import { figureFailed, figureOf } from "../src/lib/supabase/report-aggregate.ts";
import { money } from "../src/lib/utils/report-money.ts";
import type { ReportAccess } from "../src/lib/supabase/report-permissions.ts";
import {
  customerMetricValues,
  inventoryMetricValues,
  operationsMetricValues,
  paymentsMetricValues,
  promotionsMetricValues,
  unmappedMetricIds,
} from "../src/lib/utils/report-export-values.ts";
import {
  INVENTORY_METRICS,
  type InventoryReportData,
} from "../src/lib/types/report-inventory.ts";
import {
  CUSTOMER_LEAD_METRICS,
  type CustomerLeadReportData,
} from "../src/lib/types/report-customers.ts";
import {
  OPERATIONS_METRICS,
  type OperationsReportData,
} from "../src/lib/types/report-operations.ts";
import {
  PROMOTIONS_METRICS,
  type PromotionsReportData,
} from "../src/lib/types/report-promotions.ts";
import {
  PAYMENTS_METRICS,
  type PaymentsReportData,
} from "../src/lib/types/report-payments.ts";

/*
 * The one claim this batch makes that is worth more than the rest:
 *
 *   A figure that could not be calculated never leaves as zero.
 *
 * The sprint forbids representing a failed query as zero, and an export is
 * where that rule is hardest to keep and most expensive to break. On a
 * screen the failure sits next to the number in red and the person reading
 * it was there when it happened. In a file, six weeks later, a zero is a
 * zero. There is no error state in a spreadsheet cell — only the words you
 * chose to put in it.
 *
 * There are three ways to get this wrong, and the tests below are one per
 * way:
 *
 *   1. Reading failure as `value === null`. Two figures on the customers
 *      report are legitimately null on success — averageCustomerValue when
 *      nobody bought anything, the rates when there is no denominator. Use
 *      value-is-null as the failure test and "no buyers this month" and
 *      "the query died" become the same sentence in the file.
 *
 *   2. The registry typo. The summary tables are driven by the metric
 *      registries so the file and the screen cannot drift apart. The cost
 *      is that an id that does not match anything falls through to "not
 *      available" — which asserts a failure that did not happen. Nothing
 *      catches this: the file is well-formed, the figure is simply absent
 *      and blamed on an error.
 *
 *   3. The silent half-count. A figure computed from a capped query is a
 *      real number and a wrong one. It has to carry its own caveat, in the
 *      cell, because the cell is what gets quoted.
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

const FULL: ReportAccess = {
  openable: ["inventory", "customers", "operations", "staff"],
  financial: true,
  canExport: true,
  keys: new Set(["reports.financial"]),
};

const NO_MONEY: ReportAccess = { ...FULL, financial: false, keys: new Set() };

/*
|--------------------------------------------------------------------------
| 1. EVERY REGISTRY ID IS MAPPED
|--------------------------------------------------------------------------
*/

console.log("\nregistry coverage");

/* Every figure succeeds, so anything reading "not available" is a wiring
 * fault rather than a failure the file is honestly reporting. */
const healthyInventory: InventoryReportData = {
  total: figureOf(120),
  byStatus: figureOf([
    { slug: "available", label: "Available", count: 80 },
    { slug: "reserved", label: "Reserved", count: 25 },
    { slug: "sold", label: "Sold", count: 15 },
  ]),
  draft: figureOf(4),
  availableValue: figureOf(money(980000000n)),
  byBrand: figureOf([]),
  byCollection: figureOf([]),
  byLocation: figureOf([]),
  ageing: figureOf([
    { id: "0-30", label: "0–30 days", count: 40, value: money(0n) },
    { id: "31-60", label: "31–60 days", count: 20, value: money(0n) },
    { id: "61-90", label: "61–90 days", count: 10, value: money(0n) },
    { id: "90+", label: "Over 90 days", count: 10, value: money(0n) },
  ]),
  slowMoving: figureOf(10),
  addedInPeriod: figureOf(12),
  currency: "AED",
  rangeLabel: "November 2026",
};

const healthyCustomers: CustomerLeadReportData = {
  totalCustomers: figureOf(500),
  newCustomers: figureOf(40),
  activeCustomers: figureOf(310),
  buyers: figureOf(90),
  repeatBuyers: figureOf(12),
  averageCustomerValue: figureOf(money(45000000n)),
  customersBySource: figureOf([]),
  customersByLocation: figureOf([]),
  customersByLifecycle: figureOf([]),
  totalLeads: figureOf(220),
  newLeads: figureOf(60),
  wonLeads: figureOf(18),
  lostLeads: figureOf(25),
  leadWinRate: figureOf(30),
  leadsByStage: figureOf([]),
  leadsBySource: figureOf([]),
  leadsByStaff: figureOf([]),
  leadsByTemperature: figureOf([]),
  lostReasons: figureOf([]),
  followUpCompletion: figureOf(72.5),
  followUpsDue: figureOf(40),
  currency: "AED",
  rangeLabel: "November 2026",
};

const healthyOperations: OperationsReportData = {
  testDrivesByStatus: figureOf([]),
  testDrivesTotal: figureOf(75),
  testDrivesCompleted: figureOf(50),
  testDriveCompletionRate: figureOf(66.7),
  testDrivesByShowroom: figureOf([]),
  testDrivesByStaff: figureOf([]),
  reservationsByStatus: figureOf([]),
  reservationsTotal: figureOf(30),
  activeHolds: figureOf(8),
  reservationsConverted: figureOf(14),
  reservationConversionRate: figureOf(46.7),
  depositsVerified: figureOf(money(15000000n)),
  reservationsByShowroom: figureOf([]),
  enquiriesTotal: figureOf(210),
  enquiriesByType: figureOf([]),
  enquiriesByStatus: figureOf([]),
  enquiriesBySource: figureOf([]),
  enquiriesByPriority: figureOf([]),
  enquiriesByStaff: figureOf([]),
  enquiriesCompleted: figureOf(180),
  enquiriesConverted: figureOf(22),
  currency: "AED",
  rangeLabel: "November 2026",
};


const healthyPromotions: PromotionsReportData = {
  liveCampaigns: figureOf(3),
  pausedCampaigns: figureOf(1),
  campaignsInPeriod: figureOf(5),
  redemptions: figureOf(84),
  reversals: figureOf(6),
  discountGiven: figureOf(money(4000000n)),
  discountReversed: figureOf(money(300000n)),
  averageDiscount: figureOf(money(47619n)),
  byCampaign: figureOf([]),
  byDiscountType: figureOf([]),
  pointsEarned: figureOf(12000),
  pointsRedeemed: figureOf(4200),
  pointsExpired: figureOf(300),
  pointsNet: figureOf(7500),
  walletsWithBalance: figureOf(210),
  pointsMovement: figureOf([]),
  currency: "AED",
  rangeLabel: "November 2026",
};

const promotionsValues = promotionsMetricValues(healthyPromotions, FULL);

const healthyPayments: PaymentsReportData = {
  collected: figureOf(money(120000000n)),
  collectedCount: figureOf(48),
  refunded: figureOf(money(9000000n)),
  refundCount: figureOf(3),
  net: figureOf(money(111000000n)),
  averagePayment: figureOf(money(2500000n)),
  awaitingCount: figureOf(7),
  awaitingAmount: figureOf(money(14000000n)),
  oldestAwaitingDays: figureOf(12),
  rejectedCount: figureOf(2),
  reversedCount: figureOf(1),
  reversedAmount: figureOf(money(500000n)),
  byMethod: figureOf([]),
  byKind: figureOf([]),
  byDay: figureOf([]),
  refunds: figureOf([]),
  aged: figureOf([]),
  currency: "AED",
  rangeLabel: "November 2026",
};

const paymentsValues = paymentsMetricValues(healthyPayments, FULL);


const inventoryValues = inventoryMetricValues(healthyInventory, FULL);
const customerValues = customerMetricValues(healthyCustomers, FULL);
const operationsValues = operationsMetricValues(healthyOperations, FULL);

for (const [name, metrics, values] of [
  ["inventory", INVENTORY_METRICS, inventoryValues],
  ["customers", CUSTOMER_LEAD_METRICS, customerValues],
  ["operations", OPERATIONS_METRICS, operationsValues],
  ["promotions", PROMOTIONS_METRICS, promotionsValues],
  ["payments", PAYMENTS_METRICS, paymentsValues],
] as const) {
  const missing = unmappedMetricIds(metrics, values);

  check(
    `${name}: every metric in the registry has a value`,
    missing.length === 0,
    missing.length > 0 ? `unmapped: ${missing.join(", ")}` : undefined,
  );

  const unavailable = metrics
    .filter((metric) => (values[metric.id] ?? "").startsWith("Not available"))
    .map((metric) => metric.id);

  check(
    `${name}: nothing reads "not available" when every query succeeded`,
    unavailable.length === 0,
    unavailable.length > 0 ? `wrongly unavailable: ${unavailable.join(", ")}` : undefined,
  );
}

/*
|--------------------------------------------------------------------------
| 2. FAILURE IS NEVER ZERO
|--------------------------------------------------------------------------
*/

console.log("\nfailure is never zero");

{
  const broken = {
    ...healthyInventory,
    total: figureFailed<number>("relation does not exist"),
    byStatus: figureFailed<never[]>("timeout"),
    availableValue: figureFailed<ReturnType<typeof money>>("timeout"),
    ageing: figureFailed<never[]>("timeout"),
  };

  const values = inventoryMetricValues(broken, FULL);

  check(
    "a failed count says so rather than showing a number",
    values.total.startsWith("Not available"),
    `got ${JSON.stringify(values.total)}`,
  );

  check(
    "a failed count is not rendered as 0",
    values.total !== "0" && !/^0\b/.test(values.total),
    `got ${JSON.stringify(values.total)}`,
  );

  /*
   * The status figures are derived by looking a slug up in a map. If the
   * lookup is written as `map.get(slug) ?? 0` without checking whether the
   * query failed first, a dead query reports a confident zero — the exact
   * shape of the bug this rule exists to prevent.
   */
  for (const slug of ["available", "reserved", "sold"]) {
    check(
      `a failed status breakdown does not report ${slug} as 0`,
      values[slug].startsWith("Not available"),
      `got ${JSON.stringify(values[slug])}`,
    );
  }

  for (const bucket of ["0-30", "31-60", "61-90", "90+"]) {
    check(
      `a failed ageing query does not report bucket ${bucket} as 0`,
      values[bucket].startsWith("Not available"),
      `got ${JSON.stringify(values[bucket])}`,
    );
  }

  check(
    "a failed money figure says so rather than AED 0.00",
    values.availableValue.startsWith("Not available"),
    `got ${JSON.stringify(values.availableValue)}`,
  );
}

/*
|--------------------------------------------------------------------------
| 3. EMPTY IS NOT FAILURE
|--------------------------------------------------------------------------
*/

console.log("\nempty is not failure");

{
  /*
   * Null inside a SUCCESSFUL figure. Nobody bought anything, so there is
   * nothing to average, and no denominator for the rates. The query was
   * fine. Calling this "could not be calculated" would send somebody
   * looking for a fault that is not there.
   */
  const quiet = {
    ...healthyCustomers,
    averageCustomerValue: figureOf<ReturnType<typeof money> | null>(null),
    leadWinRate: figureOf<number | null>(null),
    followUpCompletion: figureOf<number | null>(null),
  };

  const values = customerMetricValues(quiet, FULL);

  check(
    "an empty average is not reported as a failure",
    !values.averageCustomerValue.startsWith("Not available"),
    `got ${JSON.stringify(values.averageCustomerValue)}`,
  );

  check(
    "an empty average is not reported as AED 0.00 either",
    !values.averageCustomerValue.includes("0.00"),
    `got ${JSON.stringify(values.averageCustomerValue)}`,
  );

  check(
    "a rate with no denominator is not reported as 0%",
    !values.leadWinRate.startsWith("0.0%"),
    `got ${JSON.stringify(values.leadWinRate)}`,
  );

  check(
    "a rate with no denominator is not reported as a failure",
    !values.leadWinRate.startsWith("Not available"),
    `got ${JSON.stringify(values.leadWinRate)}`,
  );

  /* And a genuine failure of the same field still reads as a failure. */
  const brokenRate = { ...healthyCustomers, leadWinRate: figureFailed<number>("timeout") };

  const brokenValues = customerMetricValues(brokenRate, FULL);

  check(
    "a failed rate still reads as a failure",
    brokenValues.leadWinRate.startsWith("Not available"),
    `got ${JSON.stringify(brokenValues.leadWinRate)}`,
  );
}

/*
|--------------------------------------------------------------------------
| 4. MONEY WITHOUT PERMISSION
|--------------------------------------------------------------------------
*/

console.log("\nfinancial permission");

{
  const values = inventoryMetricValues(healthyInventory, NO_MONEY);

  check(
    "a withheld money figure says it is withheld",
    values.availableValue.startsWith("Withheld"),
    `got ${JSON.stringify(values.availableValue)}`,
  );

  check(
    "a withheld money figure does not leak the amount",
    !values.availableValue.includes("9,800,000") && !values.availableValue.includes("980000000"),
    `got ${JSON.stringify(values.availableValue)}`,
  );

  check(
    "withholding money does not suppress the counts",
    values.total === "120",
    `got ${JSON.stringify(values.total)}`,
  );

  /* The distinction matters: "withheld" is about the reader, "not
   * available" is about the data. Conflating them sends somebody to
   * support for a permissions question, or to their manager for an
   * outage. */
  check(
    "withheld is not worded as a failure",
    !values.availableValue.startsWith("Not available"),
    `got ${JSON.stringify(values.availableValue)}`,
  );
}

/*
|--------------------------------------------------------------------------
| 5. A PARTIAL FIGURE CARRIES ITS OWN CAVEAT
|--------------------------------------------------------------------------
*/

console.log("\npartial figures");

{
  const capped = {
    ...healthyInventory,
    total: figureOf(1000, false, 7400),
    availableValue: figureOf(money(980000000n), false, 7400),
  };

  const values = inventoryMetricValues(capped, FULL);

  check(
    "a half-counted figure says so in the cell",
    values.total.includes("partial"),
    `got ${JSON.stringify(values.total)}`,
  );

  check(
    "a half-counted money figure says so in the cell",
    values.availableValue.includes("partial"),
    `got ${JSON.stringify(values.availableValue)}`,
  );

  check(
    "a complete figure carries no caveat",
      !inventoryMetricValues(healthyInventory, FULL).total.includes("partial"),
  );
}

/*
|--------------------------------------------------------------------------
| 6. A REVERSAL IS NOT A DISCOUNT
|--------------------------------------------------------------------------
*/

console.log("\nreversals");

{
  /* Given and reversed are separate figures on purpose. If a change ever
   * folds the reversed amount back into the given one, the dealership is
   * reported as having given away money it clawed back — and the figure
   * moves in the direction that gets a working campaign cancelled. */
  check(
    "discount given and discount reversed are reported separately",
    promotionsValues.discountGiven !== promotionsValues.discountReversed,
    `given ${promotionsValues.discountGiven}, reversed ${promotionsValues.discountReversed}`,
  );

  check(
    "discount given excludes the reversed amount",
    promotionsValues.discountGiven.includes("40,000") &&
      promotionsValues.discountReversed.includes("3,000"),
    `given ${promotionsValues.discountGiven}, reversed ${promotionsValues.discountReversed}`,
  );

  check(
    "redemptions and reversals are counted separately",
    promotionsValues.redemptions === "84" && promotionsValues.reversals === "6",
    `${promotionsValues.redemptions} / ${promotionsValues.reversals}`,
  );

  /* Points are three figures plus a net, not one. */
  check(
    "points redeemed is reported positive, not as a negative",
    !promotionsValues.pointsRedeemed.startsWith("-"),
    promotionsValues.pointsRedeemed,
  );
}

/*
|--------------------------------------------------------------------------
| 7. COLLECTED IS NEVER NET
|--------------------------------------------------------------------------
*/

console.log("\ncollected is not net");

{
  /* The Sprint 6 defect this report exists to correct: a card labelled
   * "Collected" that was actually net of refunds. In a file that error is
   * permanent — somebody reconciles against a bank statement, finds it
   * short by exactly the refunds, and has nothing on the page explaining
   * why. The three figures must be three different numbers here. */
  check(
    "collected, refunded and net are three distinct figures",
    new Set([paymentsValues.collected, paymentsValues.refunded, paymentsValues.net]).size === 3,
    `${paymentsValues.collected} / ${paymentsValues.refunded} / ${paymentsValues.net}`,
  );

  check(
    "collected reports the gross, not the net",
    paymentsValues.collected.includes("1,200,000"),
    paymentsValues.collected,
  );

  check(
    "net is reported separately and is lower",
    paymentsValues.net.includes("1,110,000"),
    paymentsValues.net,
  );

  /* Awaiting must never be worded or valued as though it were collected. */
  check(
    "the awaiting value is its own figure, not folded into collected",
    paymentsValues.awaitingAmount.includes("140,000") &&
      !paymentsValues.collected.includes("1,340,000"),
    `${paymentsValues.awaitingAmount} / ${paymentsValues.collected}`,
  );
}

console.log(`\n${checks} checks, ${failures} failed.`);

if (failures > 0) process.exit(1);
