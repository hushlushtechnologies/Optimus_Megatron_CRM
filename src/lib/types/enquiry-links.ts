/*
|--------------------------------------------------------------------------
| WHAT AN ENQUIRY IS CONNECTED TO
|--------------------------------------------------------------------------
|
| An enquiry can point at a lead, a sales deal, a test drive and a
| reservation. Four columns on `enquiries`, four tables, four detail pages —
| but one shape: a nullable foreign key to a row that already has a number,
| a status, a vehicle and a date.
|
| So there is one description of each kind here and one query, rather than
| four near-identical ones. It also puts every column name this feature
| depends on in a single place, which is the only way a check can confirm
| they still match the database.
|
| Nothing here creates anything. Linking records says two things that exist
| are about each other; it never makes a deal, a reservation or a payment
| because somebody sent an enquiry.
*/

export const LINK_KINDS = ["lead", "deal", "testDrive", "reservation"] as const;

export type EnquiryLinkKind = (typeof LINK_KINDS)[number];

interface LinkKindSpec {
  /** The column on `enquiries` holding the foreign key. */
  column: "lead_id" | "deal_id" | "test_drive_id" | "reservation_id";
  /** The view to read from — already has the customer and vehicle resolved. */
  view: string;
  /** The human-facing reference, e.g. a deal number. */
  numberColumn: string;
  /** What the row's state is called in its own module. */
  statusColumn: string;
  /** The date worth showing for this kind. */
  dateColumn: string;
  /** Where its detail page lives. */
  route: string;
  /** Singular, for a heading. */
  label: string;
  /** What linking one means, in a line. */
  hint: string;
}

export const LINK_KINDS_SPEC: Record<EnquiryLinkKind, LinkKindSpec> = {
  lead: {
    column: "lead_id",
    view: "lead_list",
    numberColumn: "lead_number",
    statusColumn: "stage_name",
    dateColumn: "created_at",
    route: "/admin/leads",
    label: "Lead",
    hint: "The lead this enquiry became, or one it belongs to.",
  },
  deal: {
    column: "deal_id",
    view: "sales_deal_list",
    numberColumn: "deal_number",
    statusColumn: "status",
    dateColumn: "created_at",
    route: "/admin/sales",
    label: "Sales deal",
    hint: "A deal this enquiry contributed to. Linking one does not create it.",
  },
  testDrive: {
    column: "test_drive_id",
    view: "test_drive_list",
    numberColumn: "test_drive_number",
    statusColumn: "status",
    dateColumn: "scheduled_start",
    route: "/admin/test-drives",
    label: "Test drive",
    hint: "A drive booked off the back of this enquiry.",
  },
  reservation: {
    column: "reservation_id",
    view: "vehicle_reservation_list",
    numberColumn: "reservation_number",
    statusColumn: "status",
    dateColumn: "requested_at",
    route: "/admin/reservations",
    label: "Reservation",
    hint: "A reservation that came out of this enquiry.",
  },
};

/**
 * One linked record, or one candidate for linking.
 *
 * Flattened from whichever view it came from, so the panel doesn't care
 * which module it is looking at.
 */
export interface EnquiryLinkedRecord {
  kind: EnquiryLinkKind;
  id: string;
  number: string;
  status: string;
  vehicleTitle: string | null;
  when: string | null;
}

/** A record's own page. */
export function linkHref(record: EnquiryLinkedRecord): string {
  return `${LINK_KINDS_SPEC[record.kind].route}/${record.id}`;
}

/** Everything an enquiry currently points at, by kind. */
export type EnquiryLinks = Record<EnquiryLinkKind, EnquiryLinkedRecord | null>;

export const NO_ENQUIRY_LINKS: EnquiryLinks = {
  lead: null,
  deal: null,
  testDrive: null,
  reservation: null,
};
