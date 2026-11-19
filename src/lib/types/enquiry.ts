/* =========================================================
   ENQUIRY VOCABULARY
========================================================= */

export type EnquiryStatus = "New" | "In Review" | "Converted" | "Spam" | "Closed";

export type EnquiryType = "General" | "Vehicle" | "Test Drive" | "Finance" | "Trade-In" | "Service";

export type EnquirySource =
  "Website" | "Phone" | "Walk-in" | "WhatsApp" | "Email" | "Social" | "Referral" | "Other";

export type PreferredContact = "Phone" | "WhatsApp" | "Email";

export const ENQUIRY_STATUSES: EnquiryStatus[] = ["New", "In Review", "Converted", "Spam", "Closed"];

export const ENQUIRY_TYPES: EnquiryType[] = [
  "General",
  "Vehicle",
  "Test Drive",
  "Finance",
  "Trade-In",
  "Service",
];

export const ENQUIRY_SOURCES: EnquirySource[] = [
  "Website",
  "Phone",
  "Walk-in",
  "WhatsApp",
  "Email",
  "Social",
  "Referral",
  "Other",
];

export const PREFERRED_CONTACTS: PreferredContact[] = ["Phone", "WhatsApp", "Email"];

/**
 * The tabs on the enquiries screen.
 *
 * "open" is New and In Review together, because that is the day's work: an
 * enquiry nobody has dealt with yet. Spam has its own tab so it stays out of
 * the way without being deleted — a wrongly flagged enquiry is recoverable.
 */
export type EnquiryTab = "open" | "converted" | "spam" | "closed" | "all";

export const ENQUIRY_TABS: EnquiryTab[] = ["open", "converted", "spam", "closed", "all"];

/* =========================================================
   ROWS
========================================================= */

/** One row of public.enquiry_list. Names are already resolved. */
export interface EnquiryListRow {
  id: string;
  enquiry_number: string;
  status: EnquiryStatus;
  enquiry_type: EnquiryType;
  source: EnquirySource;

  full_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact: PreferredContact | null;
  message: string | null;

  car_id: string | null;
  vehicle_text: string | null;
  vehicle_title: string | null;
  stock_id: string | null;

  page_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;

  assigned_to: string | null;
  assigned_to_name: string;

  customer_id: string | null;
  customer_name: string | null;
  customer_number: string | null;

  lead_id: string | null;
  lead_number: string | null;

  converted_at: string | null;
  closed_at: string | null;
  close_reason: string | null;

  created_by: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface EnquiryActivityEntry {
  id: string;
  enquiry_id: string;
  activity_type: string;
  description: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
}

/* =========================================================
   SUMMARY AND RESULTS
========================================================= */

export interface EnquirySummary {
  newCount: number;
  inReviewCount: number;
  unassignedCount: number;
  convertedMonth: number;
  /** New enquiries older than a day that nobody has touched. */
  staleCount: number;
}

export interface EnquiryListResult {
  rows: EnquiryListRow[];
  totalCount: number;
}

/** A customer who looks like the person who sent this enquiry. */
export interface EnquiryCustomerMatch {
  id: string;
  full_name: string;
  customer_number: string;
  email: string | null;
  phone: string | null;
  /** Which field matched, so the screen can say why this one is being offered. */
  matchedOn: "email" | "phone";
}

export interface EnquiryActionResult {
  error: string | null;
}

export interface EnquiryConvertResult {
  error: string | null;
  leadId: string | null;
  customerId: string | null;
}

/* =========================================================
   DISPLAY HELPERS
========================================================= */

export type EnquiryStatusTone = "info" | "warning" | "success" | "danger" | "neutral";

/**
 * The colour each status carries.
 *
 * New is informational rather than a warning: an enquiry arriving is normal,
 * not a problem. Spam is the only danger tone, because it is the only status
 * that means "this is not a customer".
 */
export const ENQUIRY_STATUS_TONES: Record<EnquiryStatus, EnquiryStatusTone> = {
  New: "info",
  "In Review": "warning",
  Converted: "success",
  Spam: "danger",
  Closed: "neutral",
};

export const ENQUIRY_TAB_LABELS: Record<EnquiryTab, string> = {
  open: "Needs attention",
  converted: "Converted",
  spam: "Spam",
  closed: "Closed",
  all: "All",
};

export const ENQUIRY_TAB_EMPTY: Record<EnquiryTab, string> = {
  open: "Nothing is waiting for a reply.",
  converted: "No converted enquiries match.",
  spam: "Nothing has been flagged as spam.",
  closed: "No closed enquiries match.",
  all: "No enquiries match.",
};
