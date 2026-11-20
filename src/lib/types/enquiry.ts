/* =========================================================
   ENQUIRY VOCABULARY
========================================================= */

/*
 * The statuses this code knows about.
 *
 * The database is the real list — enquiry_statuses, which a dealership can
 * add to — so this union is a fallback for tones and tab grouping when a row
 * arrives without its resolved label. A status added in settings and missing
 * from here still works; it just falls back to a neutral badge.
 */
export type EnquiryStatus =
  | "New"
  | "Assigned"
  | "In Review"
  | "Waiting for Customer"
  | "Follow-Up"
  | "Inspection Needed"
  | "Valuation Prepared"
  | "Referred to Finance Team"
  | "Offer Sent"
  | "Completed"
  | "Converted"
  | "Rejected"
  | "Cancelled"
  | "Spam";

export type EnquiryType = "Finance" | "Sell My Car" | "Trade-In" | "Dream Car" | "General";

export type EnquirySource =
  | "Website"
  | "Instagram"
  | "Facebook"
  | "TikTok"
  | "Google"
  | "WhatsApp"
  | "Phone Call"
  | "Walk-In"
  | "Referral"
  | "Staff"
  | "Email"
  | "Other";

export type PreferredContact = "Phone" | "WhatsApp" | "Email";

export const ENQUIRY_STATUSES: EnquiryStatus[] = [
  "New",
  "Assigned",
  "In Review",
  "Inspection Needed",
  "Valuation Prepared",
  "Referred to Finance Team",
  "Waiting for Customer",
  "Follow-Up",
  "Offer Sent",
  "Completed",
  "Converted",
  "Rejected",
  "Cancelled",
  "Spam",
];

export const ENQUIRY_TYPES: EnquiryType[] = ["Finance", "Sell My Car", "Trade-In", "Dream Car", "General"];

export const ENQUIRY_SOURCES: EnquirySource[] = [
  "Website",
  "Instagram",
  "Facebook",
  "TikTok",
  "Google",
  "WhatsApp",
  "Phone Call",
  "Walk-In",
  "Referral",
  "Staff",
  "Email",
  "Other",
];

export const PREFERRED_CONTACTS: PreferredContact[] = ["Phone", "WhatsApp", "Email"];

/* =========================================================
   PRIORITY
========================================================= */

/**
 * How urgent an enquiry is.
 *
 * A fixed scale rather than a lookup table, unlike types and statuses: four
 * levels is what people can hold in their head, and a configurable list of
 * urgencies turns into fifteen of them within a year.
 */
export type EnquiryPriority = "Urgent" | "High" | "Normal" | "Low";

export const ENQUIRY_PRIORITIES: EnquiryPriority[] = ["Urgent", "High", "Normal", "Low"];

export const DEFAULT_ENQUIRY_PRIORITY: EnquiryPriority = "Normal";

/**
 * Normal is deliberately the quietest.
 *
 * If the ordinary case carries a colour, the colours stop meaning anything
 * and Urgent no longer catches the eye on a list of forty.
 */
export const ENQUIRY_PRIORITY_TONES: Record<EnquiryPriority, EnquiryStatusTone> = {
  Urgent: "danger",
  High: "warning",
  Normal: "neutral",
  Low: "neutral",
};

/** Matches the priority_rank column, so client and server sort alike. */
export const ENQUIRY_PRIORITY_RANK: Record<EnquiryPriority, number> = {
  Urgent: 1,
  High: 2,
  Normal: 3,
  Low: 4,
};

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
  status_label: string;
  status_tone: EnquiryStatusTone;
  status_is_open: boolean;

  enquiry_type: EnquiryType;
  type_label: string;
  general_category: string | null;

  source: EnquirySource;
  priority: EnquiryPriority;
  priority_rank: number;

  subject: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact: PreferredContact | null;
  message: string | null;

  car_id: string | null;
  vehicle_text: string | null;
  vehicle_title: string | null;
  stock_id: string | null;

  location_id: string | null;
  location_name: string | null;

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
  deal_id: string | null;
  test_drive_id: string | null;
  reservation_id: string | null;

  converted_at: string | null;
  closed_at: string | null;
  close_reason: string | null;
  archived_at: string | null;

  created_by: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  next_follow_up_at: string | null;

  /**
   * Bumped by the database on every real edit. Send it back when saving and
   * a mismatch means somebody else got there first.
   */
  version: number;
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

/**
 * The six figures above the enquiry list.
 *
 * Every count excludes archived enquiries and Spam, so the dashboard
 * describes the work in front of the team rather than the size of the table.
 *
 * The comparison fields are nullable on purpose. When there is no honest
 * figure — no previous period to compare against, or more history than one
 * query can count — the card shows its caption instead of a made-up number.
 */
export interface EnquirySummary {
  /** Every live enquiry, whatever its status. */
  total: number;
  /** Nobody has picked these up yet. */
  newCount: number;
  /** Open, and past New: somebody is on it. */
  inProgress: number;
  /** Open, with a follow-up scheduled and not yet done. */
  followUpsDue: number;
  /** Of those, the ones whose time has already passed. */
  followUpsOverdue: number;
  /** Completed or Converted — the two ways an enquiry finishes well. */
  completed: number;
  /** Open, and marked Urgent or High. */
  urgent: number;

  /** Received in the last 30 days. null when it couldn't be counted. */
  last30: number | null;
  /** Received in the 30 days before that, for a like-for-like comparison. */
  previous30: number | null;
  /** Daily counts for the last 14 days in Dubai, oldest first. */
  trend: number[] | null;
}

/**
 * How many enquiries sit behind each type tab.
 *
 * Keyed by type rather than a fixed shape, because the types live in a
 * database table now: one added in settings gets a tab and a count without
 * this type changing.
 */
/**
 * What came of a bulk action.
 *
 * Counts rather than a single pass/fail, because a selection of forty will
 * routinely contain two the workflow refuses — already converted, already
 * spam — and "38 done, 2 skipped" is the truth. `error` is for the whole
 * request failing before anything was attempted.
 */
export interface EnquiryBulkResult {
  done: number;
  skipped: number;
  /** Why the first skipped one was skipped, so the message can say. */
  firstProblem: string | null;
  error: string | null;
}

export interface EnquiryTypeCounts {
  all: number;
  byType: Record<string, number>;
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
  /**
   * Which field matched, so the screen can say why this one is being offered.
   * "name" is a search somebody typed, rather than a match found for them.
   */
  matchedOn: "email" | "phone" | "name";
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
  Assigned: "info",
  "In Review": "warning",
  "Inspection Needed": "warning",
  "Valuation Prepared": "info",
  "Referred to Finance Team": "info",
  "Waiting for Customer": "warning",
  "Follow-Up": "warning",
  "Offer Sent": "info",
  Completed: "success",
  Converted: "success",
  Rejected: "danger",
  Cancelled: "neutral",
  Spam: "danger",
};

/**
 * The statuses that still need somebody to do something.
 *
 * Kept beside the tones so the "needs attention" queue and the badge colours
 * can never drift apart.
 */
export const OPEN_ENQUIRY_STATUSES: EnquiryStatus[] = [
  "New",
  "Assigned",
  "In Review",
  "Inspection Needed",
  "Valuation Prepared",
  "Referred to Finance Team",
  "Waiting for Customer",
  "Follow-Up",
  "Offer Sent",
];

/** The statuses the "Closed" tab gathers. */
export const CLOSED_ENQUIRY_STATUSES: EnquiryStatus[] = ["Completed", "Rejected", "Cancelled"];

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
