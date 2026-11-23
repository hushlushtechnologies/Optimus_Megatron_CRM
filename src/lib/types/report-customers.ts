import type { ReportFigure } from "@/src/lib/supabase/report-aggregate";
import type { Money } from "@/src/lib/utils/report-money";

/*
|--------------------------------------------------------------------------
| CUSTOMER AND LEAD REPORT SHAPE
|--------------------------------------------------------------------------
|
| Types and definitions only — no server imports. See report-inventory.ts for
| why that matters.
|
| THE DISTINCTION THIS WHOLE FILE IS BUILT AROUND
|
| One customer can have several leads and buy several cars. The sprint plan
| is blunt about the consequence: do not count one customer three times
| because they have three active leads.
|
| So the two halves of this report count different things, and say so:
|
|   a CUSTOMER figure counts people      — distinct customer ids
|   a LEAD figure counts opportunities   — rows in the leads table
|
| "Leads by source" and "Customers by source" will not add up to each other,
| and that is correct rather than a bug. Every label here names its unit so a
| reader is never left guessing which they are looking at.
*/

export interface NamedCount {
  id: string;
  name: string;
  count: number;
}

export interface LostReasonRow extends NamedCount {
  /** Share of lost leads with this reason, 0–100. */
  share: number;
}

export interface CustomerLeadReportData {
  /* ---- customers: people ---- */

  /** Every non-archived customer record. */
  totalCustomers: ReportFigure<number>;
  /** Customer records created in the period. */
  newCustomers: ReportFigure<number>;
  /** Customers whose lifecycle status is Active. */
  activeCustomers: ReportFigure<number>;

  /** Distinct customers with at least one completed deal, ever. */
  buyers: ReportFigure<number>;
  /** Distinct customers with two or more completed deals, ever. */
  repeatBuyers: ReportFigure<number>;
  /** Total completed deal value divided by distinct buyers. */
  averageCustomerValue: ReportFigure<Money | null>;

  customersBySource: ReportFigure<NamedCount[]>;
  customersByLocation: ReportFigure<NamedCount[]>;
  customersByLifecycle: ReportFigure<NamedCount[]>;

  /* ---- leads: opportunities ---- */

  totalLeads: ReportFigure<number>;
  newLeads: ReportFigure<number>;
  wonLeads: ReportFigure<number>;
  lostLeads: ReportFigure<number>;

  /**
   * Of the leads CREATED in this period, the share now won.
   *
   * A cohort rate, for the same reason the sales report's is: dividing leads
   * won in a window by leads created in it compares two different sets and
   * can exceed 100%.
   */
  leadWinRate: ReportFigure<number | null>;

  leadsByStage: ReportFigure<NamedCount[]>;
  leadsBySource: ReportFigure<NamedCount[]>;
  leadsByStaff: ReportFigure<NamedCount[]>;
  leadsByTemperature: ReportFigure<NamedCount[]>;
  lostReasons: ReportFigure<LostReasonRow[]>;

  /** Follow-ups completed as a share of those due in the period, 0–100. */
  followUpCompletion: ReportFigure<number | null>;
  followUpsDue: ReportFigure<number>;

  currency: string;
  rangeLabel: string;
}

export interface CustomerLeadMetric {
  id: string;
  label: string;
  definition: string;
  basis: string;
  financial: boolean;
  /** Which half of the report this belongs to. */
  group: "customers" | "leads";
}

export const CUSTOMER_LEAD_METRICS: readonly CustomerLeadMetric[] = [
  {
    id: "totalCustomers",
    label: "Customers",
    definition: "Every customer record that has not been archived. Counts people, not deals.",
    basis: "current",
    financial: false,
    group: "customers",
  },
  {
    id: "newCustomers",
    label: "New customers",
    definition: "Customer records created in the period.",
    basis: "record created",
    financial: false,
    group: "customers",
  },
  {
    id: "activeCustomers",
    label: "Active customers",
    definition: "Customers whose lifecycle status is Active. Set by staff, not derived from activity.",
    basis: "current",
    financial: false,
    group: "customers",
  },
  {
    id: "buyers",
    label: "Buyers",
    definition:
      "Distinct customers with at least one completed deal, ever. A customer who bought three cars counts once.",
    basis: "all time",
    financial: false,
    group: "customers",
  },
  {
    id: "repeatBuyers",
    label: "Repeat buyers",
    definition: "Distinct customers with two or more completed deals, ever.",
    basis: "all time",
    financial: false,
    group: "customers",
  },
  {
    id: "averageCustomerValue",
    label: "Average per buyer",
    definition:
      "Total value of completed deals divided by the number of distinct buyers. Deal value, not cash collected and not profit.",
    basis: "all time",
    financial: true,
    group: "customers",
  },
  {
    id: "totalLeads",
    label: "Leads",
    definition: "Every lead that has not been archived. Counts opportunities, not people.",
    basis: "current",
    financial: false,
    group: "leads",
  },
  {
    id: "newLeads",
    label: "New leads",
    definition: "Leads created in the period.",
    basis: "lead created",
    financial: false,
    group: "leads",
  },
  {
    id: "wonLeads",
    label: "Won",
    definition: "Leads whose stage is a winning one, created in the period.",
    basis: "lead created",
    financial: false,
    group: "leads",
  },
  {
    id: "lostLeads",
    label: "Lost",
    definition: "Leads whose stage is a losing one, created in the period.",
    basis: "lead created",
    financial: false,
    group: "leads",
  },
  {
    id: "leadWinRate",
    label: "Won so far",
    definition:
      "Of the leads created in this period, the share now won. Always 0 to 100 — it asks one question of one set of leads.",
    basis: "lead created",
    financial: false,
    group: "leads",
  },
  {
    id: "followUpCompletion",
    label: "Follow-ups completed",
    definition:
      "Follow-ups marked Completed as a share of those scheduled to fall in this period.",
    basis: "scheduled for",
    financial: false,
    group: "leads",
  },
];

/** Said on screen, once, above the two halves. */
export const COUNTING_NOTE =
  "Customer figures count people: a customer with three leads counts once. Lead figures count opportunities. The two sets of totals are not meant to match.";
