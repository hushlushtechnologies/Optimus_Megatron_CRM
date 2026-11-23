import "server-only";

import type { RenderedTable } from "@/src/lib/utils/export-tables";
import type { ExportColumn } from "@/src/lib/utils/export-columns";
import type { ReportAccess } from "@/src/lib/supabase/report-permissions";
import type { ExportableSection } from "@/src/lib/types/report-export";
import type { ReportRangeId } from "@/src/lib/utils/report-time";
import type { ReportFilters } from "@/src/lib/utils/report-filters";

import {
  breakdownTable,
  countText,
  customerMetricValues,
  promotionsMetricValues,
  inventoryMetricValues,
  paymentsMetricValues,
  metricsTable,
  moneyCell,
  operationsMetricValues,
} from "@/src/lib/utils/report-export-values";

import { getInventoryReport } from "@/src/lib/supabase/report-inventory-queries";
import { getCustomerLeadReport } from "@/src/lib/supabase/report-customer-queries";
import { getOperationsReport } from "@/src/lib/supabase/report-operations-queries";
import { getStaffReport } from "@/src/lib/supabase/report-staff-queries";
import { getPromotionsReport } from "@/src/lib/supabase/report-promotions-queries";
import { getPaymentsReport } from "@/src/lib/supabase/report-payments-queries";

import {
  INVENTORY_METRICS,
  type AgeingBucket,
  type InventoryBreakdownRow,
  type StatusCount,
} from "@/src/lib/types/report-inventory";
import {
  CUSTOMER_LEAD_METRICS,
  type LostReasonRow,
  type NamedCount,
} from "@/src/lib/types/report-customers";
import {
  OPERATIONS_METRICS,
  NO_TEST_DRIVE_CONVERSION_NOTE,
} from "@/src/lib/types/report-operations";
import {
  AWAITING_NOTE,
  PAYMENTS_METRICS,
  RECONCILIATION_NOTE,
  type AgedPaymentRow,
  type DailyTotalRow,
  type MethodTotalRow,
  type RefundRow,
} from "@/src/lib/types/report-payments";
import {
  POINTS_NOTE,
  PROMOTIONS_METRICS,
  REVERSAL_NOTE,
  type CampaignPerformanceRow,
  type PointsMovementRow,
} from "@/src/lib/types/report-promotions";
import {
  STAFF_ATTRIBUTION_NOTE,
  STAFF_COHORT_NOTE,
  type StaffPerformanceRow,
} from "@/src/lib/types/report-staff";

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
| The rules about what a figure may say when it could not be calculated
| live in report-export-values, which is pure and therefore tested.
*/

/*
|--------------------------------------------------------------------------
| THE SECTIONS
|--------------------------------------------------------------------------
*/

export interface BuiltExport {
  tables: RenderedTable[];
  /** True when any table reached the row cap. */
  truncated: boolean;
  currency: string;
  rangeLabel: string;
  /** Set when the file holds customer names or contact details. */
  sensitive: boolean;
}

type BuildOptions = { customFrom?: string; customTo?: string };

const namedCountColumns = (
  nameHeader: string,
  countHeader: string,
): ExportColumn<NamedCount>[] => [
  { header: nameHeader, width: 30, kind: "text", value: (row) => row.name },
  { header: countHeader, width: 14, kind: "number", value: (row) => row.count },
];

/*
|--------------------------------------------------------------------------
| INVENTORY
|--------------------------------------------------------------------------
*/


async function buildInventory(
  range: ReportRangeId,
  filters: ReportFilters,
  access: ReportAccess,
  options: BuildOptions,
): Promise<BuiltExport> {
  const data = await getInventoryReport(range, filters, options);

  const breakdownColumns: ExportColumn<InventoryBreakdownRow>[] = [
    { header: "Name", width: 32, kind: "text", value: (row) => row.name },
    { header: "Vehicles", width: 12, kind: "number", value: (row) => row.count },
    {
      header: "Listed value",
      width: 20,
      kind: "money",
      value: (row) => moneyCell(row.value, access),
    },
  ];

  const tables: RenderedTable[] = [
    metricsTable("Summary", INVENTORY_METRICS, inventoryMetricValues(data, access), [
      {
        label: "Draft (unpublished)",
        value: countText(data.draft),
        definition: "Vehicles created but not yet published to the site.",
        basis: "current",
      },
    ]),
    breakdownTable<StatusCount>(
      "By status",
      data.byStatus,
      [
        { header: "Status", width: 26, kind: "text", value: (row) => row.label },
        { header: "Vehicles", width: 12, kind: "number", value: (row) => row.count },
      ],
      "Counted as the stock stands now, not as it stood during the period.",
    ),
    breakdownTable("By brand", data.byBrand, breakdownColumns),
    breakdownTable("By collection", data.byCollection, breakdownColumns),
    breakdownTable("By location", data.byLocation, breakdownColumns),
    breakdownTable<AgeingBucket>(
      "Ageing",
      data.ageing,
      [
        { header: "Days in stock", width: 20, kind: "text", value: (row) => row.label },
        { header: "Vehicles", width: 12, kind: "number", value: (row) => row.count },
        {
          header: "Listed value",
          width: 20,
          kind: "money",
          value: (row) => moneyCell(row.value, access),
        },
      ],
      "Available vehicles only, measured from the date each was added.",
    ),
  ];

  return {
    tables,
    truncated: tables.some((table) => table.truncated),
    currency: data.currency,
    rangeLabel: data.rangeLabel,
    sensitive: false,
  };
}

/*
|--------------------------------------------------------------------------
| CUSTOMERS AND LEADS
|--------------------------------------------------------------------------
*/


async function buildCustomers(
  range: ReportRangeId,
  filters: ReportFilters,
  access: ReportAccess,
  options: BuildOptions,
): Promise<BuiltExport> {
  const data = await getCustomerLeadReport(range, filters, options);

  const tables: RenderedTable[] = [
    metricsTable("Summary", CUSTOMER_LEAD_METRICS, customerMetricValues(data, access)),
    breakdownTable(
      "Customers by source",
      data.customersBySource,
      namedCountColumns("Source", "Customers"),
      "Distinct customers, counted by the date each record was created.",
    ),
    breakdownTable(
      "Customers by location",
      data.customersByLocation,
      namedCountColumns("Location", "Customers"),
    ),
    breakdownTable(
      "Customers by lifecycle",
      data.customersByLifecycle,
      namedCountColumns("Lifecycle", "Customers"),
      "Lifecycle as it stands now, not as it stood during the period.",
    ),
    breakdownTable(
      "Leads by stage",
      data.leadsByStage,
      namedCountColumns("Stage", "Leads"),
      "Leads are opportunities, not people. One customer can hold several.",
    ),
    breakdownTable("Leads by source", data.leadsBySource, namedCountColumns("Source", "Leads")),
    breakdownTable("Leads by staff", data.leadsByStaff, namedCountColumns("Staff member", "Leads")),
    breakdownTable(
      "Leads by temperature",
      data.leadsByTemperature,
      namedCountColumns("Temperature", "Leads"),
    ),
    breakdownTable<LostReasonRow>("Lost reasons", data.lostReasons, [
      { header: "Reason", width: 36, kind: "text", value: (row) => row.name },
      { header: "Leads", width: 14, kind: "number", value: (row) => row.count },
    ]),
  ];

  return {
    tables,
    truncated: tables.some((table) => table.truncated),
    currency: data.currency,
    rangeLabel: data.rangeLabel,
    sensitive: false,
  };
}

/*
|--------------------------------------------------------------------------
| OPERATIONS
|--------------------------------------------------------------------------
*/


async function buildOperations(
  range: ReportRangeId,
  filters: ReportFilters,
  access: ReportAccess,
  options: BuildOptions,
): Promise<BuiltExport> {
  const data = await getOperationsReport(range, filters, options);

  const tables: RenderedTable[] = [
    metricsTable("Summary", OPERATIONS_METRICS, operationsMetricValues(data, access)),
    breakdownTable(
      "Test drives by status",
      data.testDrivesByStatus,
      namedCountColumns("Status", "Test drives"),
      NO_TEST_DRIVE_CONVERSION_NOTE,
    ),
    breakdownTable(
      "Test drives by showroom",
      data.testDrivesByShowroom,
      namedCountColumns("Showroom", "Test drives"),
    ),
    breakdownTable(
      "Test drives by staff",
      data.testDrivesByStaff,
      namedCountColumns("Staff member", "Test drives"),
    ),
    breakdownTable(
      "Reservations by status",
      data.reservationsByStatus,
      namedCountColumns("Status", "Reservations"),
    ),
    breakdownTable(
      "Reservations by showroom",
      data.reservationsByShowroom,
      namedCountColumns("Showroom", "Reservations"),
    ),
    breakdownTable(
      "Enquiries by status",
      data.enquiriesByStatus,
      namedCountColumns("Status", "Enquiries"),
    ),
    breakdownTable("Enquiries by type", data.enquiriesByType, namedCountColumns("Type", "Enquiries")),
    breakdownTable(
      "Enquiries by source",
      data.enquiriesBySource,
      namedCountColumns("Source", "Enquiries"),
    ),
    breakdownTable(
      "Enquiries by priority",
      data.enquiriesByPriority,
      namedCountColumns("Priority", "Enquiries"),
    ),
    breakdownTable(
      "Enquiries by staff",
      data.enquiriesByStaff,
      namedCountColumns("Staff member", "Enquiries"),
    ),
  ];

  return {
    tables,
    truncated: tables.some((table) => table.truncated),
    currency: data.currency,
    rangeLabel: data.rangeLabel,
    sensitive: false,
  };
}

/*
|--------------------------------------------------------------------------
| STAFF
|--------------------------------------------------------------------------
*/

async function buildStaff(
  range: ReportRangeId,
  filters: ReportFilters,
  access: ReportAccess,
  options: BuildOptions,
): Promise<BuiltExport> {
  const data = await getStaffReport(range, filters, options);

  const columns: ExportColumn<StaffPerformanceRow>[] = [
    { header: "Staff member", width: 28, kind: "text", value: (row) => row.staffName },
    { header: "Leads assigned", width: 15, kind: "number", value: (row) => row.leadsAssigned },
    { header: "Leads won", width: 12, kind: "number", value: (row) => row.leadsWon },
    {
      header: "Test drives booked",
      width: 17,
      kind: "number",
      value: (row) => row.testDrivesAssigned,
    },
    {
      header: "Test drives done",
      width: 16,
      kind: "number",
      value: (row) => row.testDrivesCompleted,
    },
    { header: "Reservations", width: 14, kind: "number", value: (row) => row.reservationsOwned },
    { header: "Deals owned", width: 13, kind: "number", value: (row) => row.dealsOwned },
    { header: "Deals completed", width: 16, kind: "number", value: (row) => row.dealsCompleted },
    {
      header: "Completed value",
      width: 20,
      kind: "money",
      value: (row) => moneyCell(row.completedValue, access),
    },
    { header: "Enquiries handled", width: 17, kind: "number", value: (row) => row.enquiriesHandled },
    {
      header: "Enquiries completed",
      width: 18,
      kind: "number",
      value: (row) => row.enquiriesCompleted,
    },
  ];

  const tables: RenderedTable[] = [
    breakdownTable(
      "By staff member",
      data.rows,
      columns,
      `${STAFF_ATTRIBUTION_NOTE} ${STAFF_COHORT_NOTE}`,
    ),
  ];

  return {
    tables,
    truncated: tables.some((table) => table.truncated),
    currency: data.currency,
    rangeLabel: data.rangeLabel,
    sensitive: false,
  };
}


/*
|--------------------------------------------------------------------------
| PROMOTIONS AND LOYALTY
|--------------------------------------------------------------------------
*/

async function buildPromotions(
  range: ReportRangeId,
  filters: ReportFilters,
  access: ReportAccess,
  options: BuildOptions,
): Promise<BuiltExport> {
  const data = await getPromotionsReport(range, filters, options);

  const tables: RenderedTable[] = [
    metricsTable("Summary", PROMOTIONS_METRICS, promotionsMetricValues(data, access)),
    breakdownTable<CampaignPerformanceRow>(
      "Campaign take-up",
      data.byCampaign,
      [
        { header: "Campaign", width: 32, kind: "text", value: (row) => row.name },
        { header: "Reference", width: 16, kind: "text", value: (row) => row.reference ?? "—" },
        { header: "Status", width: 14, kind: "text", value: (row) => row.status },
        { header: "Redemptions", width: 14, kind: "number", value: (row) => row.redemptions },
        { header: "Reversals", width: 12, kind: "number", value: (row) => row.reversals },
        {
          header: "Discount given",
          width: 20,
          kind: "money",
          value: (row) => moneyCell(row.discount, access),
        },
      ],
      REVERSAL_NOTE,
    ),
    breakdownTable(
      "Campaigns by discount type",
      data.byDiscountType,
      namedCountColumns("Discount type", "Campaigns"),
    ),
    breakdownTable<PointsMovementRow>(
      "Points movement",
      data.pointsMovement,
      [
        { header: "Entry type", width: 24, kind: "text", value: (row) => row.label },
        { header: "Entries", width: 12, kind: "number", value: (row) => row.entries },
        /* The ledger's sign is kept, so the column sums to net movement. */
        { header: "Points", width: 14, kind: "number", value: (row) => row.points },
      ],
      POINTS_NOTE,
    ),
  ];

  return {
    tables,
    truncated: tables.some((table) => table.truncated),
    currency: data.currency,
    rangeLabel: data.rangeLabel,
    sensitive: false,
  };
}


/*
|--------------------------------------------------------------------------
| PAYMENTS AND COLLECTIONS
|--------------------------------------------------------------------------
|
| The daily worksheet is the reason this export exists. Somebody reconciling
| a month against a bank statement wants it in a spreadsheet, next to the
| statement, with a column to tick — not on a screen they have to scroll.
|
| The awaiting table ships in the same file as the collection figures and is
| labelled on its own sheet, so the two cannot be read as one total. Its
| note says what it is: a claim, not a receipt.
*/

async function buildPayments(
  range: ReportRangeId,
  filters: ReportFilters,
  access: ReportAccess,
  options: BuildOptions,
): Promise<BuiltExport> {
  const data = await getPaymentsReport(range, filters, options);

  const tables: RenderedTable[] = [
    metricsTable("Summary", PAYMENTS_METRICS, paymentsMetricValues(data, access)),
    breakdownTable<MethodTotalRow>(
      "By method",
      data.byMethod,
      [
        { header: "Method", width: 20, kind: "text", value: (row) => row.method },
        { header: "Received", width: 12, kind: "number", value: (row) => row.count },
        {
          header: "Collected",
          width: 20,
          kind: "money",
          value: (row) => moneyCell(row.collected, access),
        },
        { header: "Refunds", width: 12, kind: "number", value: (row) => row.refundCount },
        {
          header: "Refunded",
          width: 20,
          kind: "money",
          value: (row) => moneyCell(row.refunded, access),
        },
        { header: "Net", width: 20, kind: "money", value: (row) => moneyCell(row.net, access) },
      ],
      "Verified payments only. Collected is money in; refunded is money out. They are never summed.",
    ),
    breakdownTable<DailyTotalRow>(
      "Daily worksheet",
      data.byDay,
      [
        { header: "Date", width: 14, kind: "text", value: (row) => row.date },
        { header: "Payments", width: 12, kind: "number", value: (row) => row.count },
        { header: "In", width: 20, kind: "money", value: (row) => moneyCell(row.collected, access) },
        { header: "Out", width: 20, kind: "money", value: (row) => moneyCell(row.refunded, access) },
        { header: "Net", width: 20, kind: "money", value: (row) => moneyCell(row.net, access) },
      ],
      RECONCILIATION_NOTE,
    ),
    breakdownTable<RefundRow>(
      "Refunds",
      data.refunds,
      [
        { header: "Date", width: 14, kind: "text", value: (row) => row.paidOn },
        { header: "Deal", width: 16, kind: "text", value: (row) => row.dealNumber ?? "—" },
        { header: "Customer", width: 28, kind: "text", value: (row) => row.customerName ?? "—" },
        { header: "Method", width: 16, kind: "text", value: (row) => row.method },
        {
          header: "Amount",
          width: 20,
          kind: "money",
          value: (row) => moneyCell(row.amount, access),
        },
        { header: "Status", width: 14, kind: "text", value: (row) => row.status },
        { header: "Reason", width: 44, kind: "text", value: (row) => row.reason ?? "—" },
        { header: "Recorded by", width: 22, kind: "text", value: (row) => row.recordedByName },
        { header: "Verified by", width: 22, kind: "text", value: (row) => row.verifiedByName ?? "—" },
      ],
      "Every outgoing payment in the period, so the refund total has a list behind it.",
    ),
    breakdownTable<AgedPaymentRow>(
      "Awaiting verification",
      data.aged,
      [
        { header: "Days waiting", width: 14, kind: "number", value: (row) => row.daysWaiting },
        { header: "Taken on", width: 14, kind: "text", value: (row) => row.paidOn },
        { header: "Deal", width: 16, kind: "text", value: (row) => row.dealNumber ?? "—" },
        { header: "Customer", width: 28, kind: "text", value: (row) => row.customerName ?? "—" },
        { header: "Method", width: 16, kind: "text", value: (row) => row.method },
        {
          header: "Claimed",
          width: 20,
          kind: "money",
          value: (row) => moneyCell(row.amount, access),
        },
        { header: "Recorded by", width: 22, kind: "text", value: (row) => row.recordedByName },
      ],
      AWAITING_NOTE,
    ),
  ];

  return {
    tables,
    truncated: tables.some((table) => table.truncated),
    currency: data.currency,
    rangeLabel: data.rangeLabel,
    /* Customer names appear on the refund and awaiting tables. */
    sensitive: true,
  };
}

/*
|--------------------------------------------------------------------------
| DISPATCH
|--------------------------------------------------------------------------
*/

/* The list itself lives in types/report-export so the Export button can
 * read it without importing this server-only module. */
export { EXPORTABLE_SECTION_IDS, isExportableSection } from "@/src/lib/types/report-export";

export async function buildSectionExport(
  section: ExportableSection,
  range: ReportRangeId,
  filters: ReportFilters,
  access: ReportAccess,
  options: BuildOptions = {},
): Promise<BuiltExport> {
  switch (section) {
    case "inventory":
      return buildInventory(range, filters, access, options);
    case "customers":
      return buildCustomers(range, filters, access, options);
    case "operations":
      return buildOperations(range, filters, access, options);
    case "staff":
      return buildStaff(range, filters, access, options);
    case "promotions":
      return buildPromotions(range, filters, access, options);
    case "payments":
      return buildPayments(range, filters, access, options);
  }
}
