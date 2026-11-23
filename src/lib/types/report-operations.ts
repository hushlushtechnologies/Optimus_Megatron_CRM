import type { ReportFigure } from "@/src/lib/supabase/report-aggregate";
import type { Money } from "@/src/lib/utils/report-money";
import type { NamedCount } from "@/src/lib/types/report-customers";

/*
|--------------------------------------------------------------------------
| OPERATIONS REPORT SHAPE AND DEFINITIONS
|--------------------------------------------------------------------------
|
| Test drives, reservations and enquiries — the three things that happen
| between a lead and a sale.
|
| WHAT LINKS TO WHAT, AND WHAT DOES NOT
|
| The sprint plan asks for conversion rates "where links permit" and says not
| to invent links where the relationship is missing. So it is worth writing
| down what the schema actually holds:
|
|   reservation -> deal    vehicle_reservation_list.deal_id      REAL
|   enquiry -> deal        enquiry_list.deal_id                  REAL
|   enquiry -> test drive  enquiry_list.test_drive_id            REAL
|   enquiry -> reservation enquiry_list.reservation_id           REAL
|   test drive -> deal     nothing                               ABSENT
|
| So reservation-to-sale and enquiry-to-sale conversion are reported, and
| test-drive-to-sale is not. A test drive carries a customer and a car, so a
| number could be manufactured by looking for a later deal on the same pair —
| but that would count a sale as "converted from a test drive" when the
| customer had already decided, and would miss one where they bought a
| different car. A rate that cannot be trusted is worse than an absent one,
| so the page says the link does not exist and why.
*/

export interface OperationsReportData {
  /* ---- test drives ---- */
  testDrivesByStatus: ReportFigure<NamedCount[]>;
  testDrivesTotal: ReportFigure<number>;
  testDrivesCompleted: ReportFigure<number>;
  /** Completed as a share of drives that reached an end state. */
  testDriveCompletionRate: ReportFigure<number | null>;
  testDrivesByShowroom: ReportFigure<NamedCount[]>;
  testDrivesByStaff: ReportFigure<NamedCount[]>;

  /* ---- reservations ---- */
  reservationsByStatus: ReportFigure<NamedCount[]>;
  reservationsTotal: ReportFigure<number>;
  /** Confirmed holds that have not expired. A right-now figure. */
  activeHolds: ReportFigure<number>;
  reservationsConverted: ReportFigure<number>;
  /** Converted as a share of reservations raised in the period. */
  reservationConversionRate: ReportFigure<number | null>;
  depositsVerified: ReportFigure<Money>;
  reservationsByShowroom: ReportFigure<NamedCount[]>;

  /* ---- enquiries ---- */
  enquiriesTotal: ReportFigure<number>;
  enquiriesByType: ReportFigure<NamedCount[]>;
  enquiriesByStatus: ReportFigure<NamedCount[]>;
  enquiriesBySource: ReportFigure<NamedCount[]>;
  enquiriesByPriority: ReportFigure<NamedCount[]>;
  enquiriesByStaff: ReportFigure<NamedCount[]>;
  enquiriesCompleted: ReportFigure<number>;
  /** Enquiries that reached a deal. */
  enquiriesConverted: ReportFigure<number>;

  currency: string;
  rangeLabel: string;
}

export interface OperationsMetric {
  id: string;
  label: string;
  definition: string;
  basis: string;
  financial: boolean;
  group: "testDrives" | "reservations" | "enquiries";
}

export const OPERATIONS_METRICS: readonly OperationsMetric[] = [
  {
    id: "testDrivesTotal",
    label: "Test drives booked",
    definition: "Test drives created in the period, whatever became of them.",
    basis: "booked",
    financial: false,
    group: "testDrives",
  },
  {
    id: "testDrivesCompleted",
    label: "Completed",
    definition: "Drives that actually took place, of those booked in the period.",
    basis: "booked",
    financial: false,
    group: "testDrives",
  },
  {
    id: "testDriveCompletionRate",
    label: "Completion rate",
    definition:
      "Completed as a share of drives that reached an end state. Drives still pending or approved are excluded from both sides, because they have not had their chance yet.",
    basis: "booked",
    financial: false,
    group: "testDrives",
  },
  {
    id: "reservationsTotal",
    label: "Reservations raised",
    definition: "Reservation requests created in the period.",
    basis: "requested",
    financial: false,
    group: "reservations",
  },
  {
    id: "activeHolds",
    label: "Active holds",
    definition:
      "Confirmed reservations that have not expired, right now. Not period-bound — a hold raised last month that is still live counts here.",
    basis: "current",
    financial: false,
    group: "reservations",
  },
  {
    id: "reservationsConverted",
    label: "Converted to a deal",
    definition: "Of the reservations raised in the period, those now linked to a sales deal.",
    basis: "requested",
    financial: false,
    group: "reservations",
  },
  {
    id: "reservationConversionRate",
    label: "Conversion rate",
    definition:
      "Of the reservations raised in this period, the share that reached a deal. Always 0 to 100 — one question, one set of reservations.",
    basis: "requested",
    financial: false,
    group: "reservations",
  },
  {
    id: "depositsVerified",
    label: "Deposits verified",
    definition:
      "Verified deposits on reservations raised in the period, less any refunds against them. This column is already net on the reservation record.",
    basis: "requested",
    financial: true,
    group: "reservations",
  },
  {
    id: "enquiriesTotal",
    label: "Enquiries received",
    definition: "Enquiries created in the period, of every type.",
    basis: "received",
    financial: false,
    group: "enquiries",
  },
  {
    id: "enquiriesCompleted",
    label: "Completed",
    definition: "Of those received in the period, the ones now marked Completed.",
    basis: "received",
    financial: false,
    group: "enquiries",
  },
  {
    id: "enquiriesConverted",
    label: "Reached a deal",
    definition: "Of those received in the period, the ones now linked to a sales deal.",
    basis: "received",
    financial: false,
    group: "enquiries",
  },
];

/**
 * Statuses that mean a test drive has had its chance.
 *
 * The completion rate uses these as its denominator rather than every drive
 * booked. A drive booked yesterday and still Approved has not failed to
 * happen — counting it against the rate would make every recent period look
 * worse than it is, and the rate would climb for no reason as time passed.
 */
export const TEST_DRIVE_ENDED_STATUSES = ["Completed", "No Show", "Cancelled", "Rejected"] as const;

/** Said on screen under the test drive section. */
export const NO_TEST_DRIVE_CONVERSION_NOTE =
  "There is no link in this system between a test drive and a sale, so test-drive-to-sale conversion is not reported. A figure could be guessed by matching customer and vehicle, but it would credit drives for sales already decided and miss customers who bought something else.";
