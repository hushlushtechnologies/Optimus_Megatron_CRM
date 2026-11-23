import type { ReportFigure } from "@/src/lib/supabase/report-aggregate";
import type { Money } from "@/src/lib/utils/report-money";

/*
|--------------------------------------------------------------------------
| STAFF PERFORMANCE REPORT SHAPE
|--------------------------------------------------------------------------
|
| THE ATTRIBUTION RULE, WHICH IS THE WHOLE PHASE
|
| Every figure is attributed by the assignment on the RECORD ITSELF:
|
|   leads         lead_list.assigned_staff_id
|   test drives   test_drive_list.assigned_staff_id
|   reservations  vehicle_reservation_list.owner_id
|   deals         sales_deal_list.owner_id
|   enquiries     enquiry_list.assigned_to
|
| Never customer_profiles.primary_relationship_manager_id. The sprint plan
| says so outright, and the reason is concrete: a customer has one
| relationship manager and can buy three cars from three different
| salespeople. Attributing by the customer would credit all three sales to
| one person and none to the two who made them.
|
| The relationship manager is a real and useful thing — it is who looks after
| the customer — and it is not who sold the car. This report measures the
| second.
|
| WHAT A ROW DOES NOT MEAN
|
| A staff row here is a count of work assigned and work finished. It is not a
| ranking and the report does not sort by "best". People carry different
| mixes of work in different showrooms, and a table sorted by deal value
| would read as a league table of staff who happen to handle expensive cars.
| The default sort is deals owned, and every column is sortable so a reader
| chooses their own comparison.
*/

export interface StaffPerformanceRow {
  staffId: string;
  staffName: string;

  /** Leads assigned to this person, created in the period. */
  leadsAssigned: number;
  /** Of those, the ones now won. */
  leadsWon: number;

  /** Test drives assigned to this person, booked in the period. */
  testDrivesAssigned: number;
  /** Of those, the ones that took place. */
  testDrivesCompleted: number;

  /** Reservations this person owns, raised in the period. */
  reservationsOwned: number;

  /** Deals this person owns, created in the period. */
  dealsOwned: number;
  /** Of those, the ones now completed. */
  dealsCompleted: number;
  /** Value of their completed deals. Hidden without reports.financial. */
  completedValue: Money;

  /** Enquiries assigned to this person, received in the period. */
  enquiriesHandled: number;
  /** Of those, the ones now completed. */
  enquiriesCompleted: number;
}

export interface StaffReportData {
  rows: ReportFigure<StaffPerformanceRow[]>;
  /** How many people appear, for the header. */
  staffCount: ReportFigure<number>;
  currency: string;
  rangeLabel: string;
}

/** Said on screen above the table. */
export const STAFF_ATTRIBUTION_NOTE =
  "Every figure is attributed by the assignment on the record itself — the salesperson on the deal, the staff member on the test drive. Not the customer's relationship manager, who may be someone else entirely.";

export const STAFF_COHORT_NOTE =
  "Rows cover work that started in the selected period. “Won” and “completed” columns ask what has since become of that work, so they keep rising as it closes.";
