import {
  figuresTable,
  toRenderedTable,
  type RenderedTable,
} from "@/src/lib/utils/export-tables";
import type { ExportColumn } from "@/src/lib/utils/export-columns";
import type { ReportFigure } from "@/src/lib/supabase/report-aggregate";
import type { Money } from "@/src/lib/utils/report-money";
import type { ReportAccess } from "@/src/lib/supabase/report-permissions";
import type { InventoryReportData } from "@/src/lib/types/report-inventory";
import type { CustomerLeadReportData } from "@/src/lib/types/report-customers";
import type { OperationsReportData } from "@/src/lib/types/report-operations";
import type { PromotionsReportData } from "@/src/lib/types/report-promotions";
import type { PaymentsReportData } from "@/src/lib/types/report-payments";

/*
|--------------------------------------------------------------------------
| TURNING A REPORT INTO AN EXPORT (Phase 10)
|--------------------------------------------------------------------------
|
| The builders call the same query functions the pages call. That is the
| whole design: an export that fetches its own data is an export that can
| disagree with the screen it was taken from, and the person holding the
| file has no way to tell which of the two is right.
|
| THE RULE THAT SHAPES EVERYTHING HERE
|
| A figure that could not be calculated must not leave this module as zero,
| as blank, or as a missing row. It leaves as words saying it is not
| available.
|
| This matters more in a file than on a screen. A screen shows an error
| state next to the number and the person who sees it knows not to trust it.
| A spreadsheet is read six weeks later by somebody who was not there: a
| blank cell reads as nothing happened, and a zero reads as a real zero.
| Either one silently understates the month, with nothing on the page to
| suggest otherwise. So the file says so, in the cell, in words.
|
| FAILURE IS `error`, NOT `value === null`
|
| Two figures have a nullable type inside a successful result —
| averageCustomerValue and the rates — where null means "there was nothing
| to divide by", not "the lookup failed". The cards coerce the two together
| and render 0, which is reasonable on a screen the person is looking at.
|
| In a file it is the exact mistake the sprint forbids: a failed query
| rendered as zero. So failure here is `error !== null`, which figureFrom
| sets on failure and leaves null on success, and an empty basis gets its
| own words.
*/

/** A figure the query could not produce. Never rendered as 0. */
export const UNAVAILABLE = "Not available — this figure could not be calculated";

/** A figure this person is not cleared to see. */
export const WITHHELD = "Withheld — financial permission required";

/** A figure with nothing to compute from. Not a failure, and not zero. */
export const NO_BASIS = "No data in this period";

/** Appended to a figure computed from only part of the matching rows. */
export const PARTIAL = " (partial — more records matched than could be counted)";

export function failed(figure: ReportFigure<unknown>): boolean {
  return figure.error !== null;
}

function partialSuffix(figure: ReportFigure<unknown>): string {
  return figure.complete ? "" : PARTIAL;
}

export function countText(figure: ReportFigure<number>): string {
  if (failed(figure)) return UNAVAILABLE;
  if (figure.value === null) return NO_BASIS;

  return figure.value.toLocaleString("en-US") + partialSuffix(figure);
}

/** A percentage, where null inside a success means no denominator. */
export function rateText(figure: ReportFigure<number | null>): string {
  if (failed(figure)) return UNAVAILABLE;
  if (figure.value === null) return "— (nothing to measure against)";

  return `${figure.value.toFixed(1)}%${partialSuffix(figure)}`;
}

export function moneyText(
  figure: ReportFigure<Money | null>,
  access: ReportAccess,
): string {
  if (!access.financial) return WITHHELD;
  if (failed(figure)) return UNAVAILABLE;
  if (figure.value === null) return NO_BASIS;

  /*
   * `display` is the exact figure formatted from bigint fils. `chart` is
   * the lossy one, and is for bar heights only — a rounded number in a
   * spreadsheet is indistinguishable from an exact one.
   */
  return figure.value.display + partialSuffix(figure);
}

/** A money column inside a breakdown row, under the same two rules. */
export function moneyCell(value: Money | null | undefined, access: ReportAccess): string {
  if (!access.financial) return WITHHELD;
  if (!value) return "—";

  return value.display;
}

/*
|--------------------------------------------------------------------------
| TABLES
|--------------------------------------------------------------------------
*/

/**
 * A breakdown table, including when the query behind it failed.
 *
 * A failed breakdown becomes a one-row table saying so, rather than an
 * empty table or no table at all. An empty table in a workbook reads as
 * "nothing matched", which is a different and much more comfortable claim
 * than "this did not load".
 */
export function breakdownTable<TRow>(
  name: string,
  figure: ReportFigure<TRow[]>,
  columns: ExportColumn<TRow>[],
  note?: string,
): RenderedTable {
  if (failed(figure) || figure.value === null) {
    return {
      name,
      note,
      columns: [{ label: "Result", width: 70, align: "left" }],
      rows: [[UNAVAILABLE]],
      truncated: false,
      total: null,
    };
  }

  return toRenderedTable(name, columns, figure.value, {
    note,
    truncated: !figure.complete,
    total: figure.total,
  });
}

export interface MetricDefinition {
  id: string;
  label: string;
  definition: string;
  basis: string;
  financial: boolean;
}

/**
 * Figures from a metric registry, paired with values by id.
 *
 * Driving this from the registry rather than a hand-written list is what
 * keeps the file and the screen showing the same set of figures with the
 * same definitions. The cost is that a mistyped id silently becomes
 * "not available" — a wrong claim, since nothing failed — so
 * `unmappedMetricIds` below exists to be asserted on in the tests.
 */
export function metricsTable(
  name: string,
  metrics: readonly MetricDefinition[],
  values: Record<string, string>,
  extra: { label: string; value: string; definition: string; basis: string }[] = [],
): RenderedTable {
  return figuresTable(name, [
    ...metrics.map((metric) => ({
      label: metric.label,
      value: values[metric.id] ?? UNAVAILABLE,
      definition: metric.definition,
      basis: metric.basis,
    })),
    ...extra,
  ]);
}

/** Registry ids with no value supplied. Empty is the only correct answer. */
export function unmappedMetricIds(
  metrics: readonly MetricDefinition[],
  values: Record<string, string>,
): string[] {
  return metrics.filter((metric) => !(metric.id in values)).map((metric) => metric.id);
}

/*
|--------------------------------------------------------------------------
| WHY THIS IS A SEPARATE MODULE FROM THE BUILDERS
|--------------------------------------------------------------------------
|
| Everything here is a pure function of data the caller already has. None of
| it touches Supabase, cookies or the request.
|
| That is what makes it testable. The builders import the query functions,
| which import the server client, which imports next/headers — so a test
| that reaches any of it has to stand up half of Next.js, and in practice
| means the rules below go untested. These are the rules worth testing
| most: they are the ones that decide whether a dead query reports itself
| as a dead query or as the number nought.
*/

/*
|--------------------------------------------------------------------------
| THE SUMMARY FIGURES, PER SECTION
|--------------------------------------------------------------------------
|
| Each of these maps a report's data onto the ids in its metric registry.
| Driving the summary table from the registry rather than a hand-written
| list is what keeps the file and the screen showing the same figures with
| the same definitions — change a definition once and both move.
|
| The cost is that an id which matches nothing falls through to "not
| available", asserting a failure that never happened. unmappedMetricIds
| exists so a test can refuse that, and the tests do.
*/

export function inventoryMetricValues(
  data: InventoryReportData,
  access: ReportAccess,
): Record<string, string> {
  const byStatus = new Map(
    (data.byStatus.value ?? []).map((status) => [status.slug, status.count]),
  );

  /*
   * `map.get(slug) ?? 0` on its own is the bug this guards against: when
   * the breakdown query has died there are no entries, so every status
   * reports a confident zero. The emptiness has to be interrogated before
   * it is read as a count.
   */
  const statusValue = (slug: string): string => {
    if (failed(data.byStatus) || data.byStatus.value === null) return UNAVAILABLE;
    return (byStatus.get(slug) ?? 0).toLocaleString("en-US");
  };

  const ageing = new Map((data.ageing.value ?? []).map((bucket) => [bucket.id, bucket.count]));

  const ageingValue = (id: string): string => {
    if (failed(data.ageing) || data.ageing.value === null) return UNAVAILABLE;
    return (ageing.get(id) ?? 0).toLocaleString("en-US");
  };

  return {
    total: countText(data.total),
    available: statusValue("available"),
    reserved: statusValue("reserved"),
    sold: statusValue("sold"),
    availableValue: moneyText(data.availableValue, access),
    addedInPeriod: countText(data.addedInPeriod),
    slowMoving: countText(data.slowMoving),
    "0-30": ageingValue("0-30"),
    "31-60": ageingValue("31-60"),
    "61-90": ageingValue("61-90"),
    "90+": ageingValue("90+"),
  };
}

export function customerMetricValues(
  data: CustomerLeadReportData,
  access: ReportAccess,
): Record<string, string> {
  return {
    totalCustomers: countText(data.totalCustomers),
    newCustomers: countText(data.newCustomers),
    activeCustomers: countText(data.activeCustomers),
    buyers: countText(data.buyers),
    repeatBuyers: countText(data.repeatBuyers),
    averageCustomerValue: moneyText(data.averageCustomerValue, access),
    totalLeads: countText(data.totalLeads),
    newLeads: countText(data.newLeads),
    wonLeads: countText(data.wonLeads),
    lostLeads: countText(data.lostLeads),
    leadWinRate: rateText(data.leadWinRate),
    followUpCompletion: rateText(data.followUpCompletion),
  };
}

export function operationsMetricValues(
  data: OperationsReportData,
  access: ReportAccess,
): Record<string, string> {
  return {
    testDrivesTotal: countText(data.testDrivesTotal),
    testDrivesCompleted: countText(data.testDrivesCompleted),
    testDriveCompletionRate: rateText(data.testDriveCompletionRate),
    reservationsTotal: countText(data.reservationsTotal),
    activeHolds: countText(data.activeHolds),
    reservationsConverted: countText(data.reservationsConverted),
    reservationConversionRate: rateText(data.reservationConversionRate),
    depositsVerified: moneyText(data.depositsVerified, access),
    enquiriesTotal: countText(data.enquiriesTotal),
    enquiriesCompleted: countText(data.enquiriesCompleted),
    enquiriesConverted: countText(data.enquiriesConverted),
  };
}

export function promotionsMetricValues(
  data: PromotionsReportData,
  access: ReportAccess,
): Record<string, string> {
  return {
    liveCampaigns: countText(data.liveCampaigns),
    pausedCampaigns: countText(data.pausedCampaigns),
    campaignsInPeriod: countText(data.campaignsInPeriod),
    redemptions: countText(data.redemptions),
    reversals: countText(data.reversals),
    discountGiven: moneyText(data.discountGiven, access),
    discountReversed: moneyText(data.discountReversed, access),
    averageDiscount: moneyText(data.averageDiscount, access),
    pointsEarned: countText(data.pointsEarned),
    pointsRedeemed: countText(data.pointsRedeemed),
    pointsExpired: countText(data.pointsExpired),
    pointsNet: countText(data.pointsNet),
    walletsWithBalance: countText(data.walletsWithBalance),
  };
}

export function paymentsMetricValues(
  data: PaymentsReportData,
  access: ReportAccess,
): Record<string, string> {
  return {
    collected: moneyText(data.collected, access),
    collectedCount: countText(data.collectedCount),
    refunded: moneyText(data.refunded, access),
    refundCount: countText(data.refundCount),
    net: moneyText(data.net, access),
    averagePayment: moneyText(data.averagePayment, access),
    awaitingCount: countText(data.awaitingCount),
    awaitingAmount: moneyText(data.awaitingAmount, access),
    oldestAwaitingDays: rateDays(data.oldestAwaitingDays),
    rejectedCount: countText(data.rejectedCount),
    reversedCount: countText(data.reversedCount),
    reversedAmount: moneyText(data.reversedAmount, access),
  };
}

/** Days waiting, where null inside a success means the queue is empty. */
function rateDays(figure: ReportFigure<number | null>): string {
  if (failed(figure)) return UNAVAILABLE;
  if (figure.value === null) return "— (nothing waiting)";

  return `${figure.value.toLocaleString("en-US")} days`;
}
