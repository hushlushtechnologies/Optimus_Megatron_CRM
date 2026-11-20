/*
|--------------------------------------------------------------------------
| WORKING ON AN ENQUIRY
|--------------------------------------------------------------------------
|
| Notes and follow-ups: the two things people actually do to an enquiry
| between it arriving and it finishing.
|
| There is no third table for "communications". A completed follow-up of
| type Phone Call, WhatsApp or Email IS a record that somebody made contact,
| with who, when and what came of it already on it. A separate
| communications table would hold the same six columns and immediately
| disagree with this one about which calls had happened.
*/

export const FOLLOW_UP_TYPES = [
  "Phone Call",
  "WhatsApp",
  "Email",
  "Showroom Visit",
  "Vehicle Inspection",
  "General Follow-Up",
] as const;

export const FOLLOW_UP_STATUSES = ["Scheduled", "Completed", "Missed", "Cancelled", "Rescheduled"] as const;

export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

/**
 * The three types that mean somebody reached the customer directly.
 *
 * A completed one of these is what the Communications view shows. A showroom
 * visit or an inspection is something that happened to a car, not a message
 * sent to a person, so neither counts as correspondence.
 */
export const CONTACT_FOLLOW_UP_TYPES: readonly FollowUpType[] = ["Phone Call", "WhatsApp", "Email"];

export const FOLLOW_UP_STATUS_TONES: Record<
  FollowUpStatus,
  "info" | "warning" | "success" | "danger" | "neutral"
> = {
  Scheduled: "info",
  Completed: "success",
  Missed: "danger",
  Cancelled: "neutral",
  Rescheduled: "warning",
};

/**
 * How long before a follow-up somebody wants reminding.
 *
 * Stored in minutes because that is what the column holds, offered as the
 * handful of intervals anybody actually picks.
 */
export const REMINDER_CHOICES: { minutes: number | null; label: string }[] = [
  { minutes: null, label: "No reminder" },
  { minutes: 15, label: "15 minutes before" },
  { minutes: 60, label: "An hour before" },
  { minutes: 240, label: "Four hours before" },
  { minutes: 1440, label: "The day before" },
];

export interface EnquiryFollowUp {
  id: string;
  type: FollowUpType;
  status: FollowUpStatus;
  scheduledAt: string;
  assignedTo: string | null;
  assignedToName: string | null;
  notes: string | null;
  reminderMinutesBefore: number | null;

  completedAt: string | null;
  completedByName: string | null;
  /** What came of it. The useful half of a completed follow-up. */
  outcomeNotes: string | null;

  createdByName: string | null;
  createdAt: string;
}

export interface EnquiryNote {
  id: string;
  noteText: string;
  /** Internal notes are for colleagues; the other kind could be read out. */
  isInternal: boolean;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string | null;
}

/* =========================================================
   DERIVED STATE
========================================================= */

/**
 * Whether a scheduled follow-up's time has passed.
 *
 * Only ever true for one that is still Scheduled. A completed follow-up that
 * happened late is not overdue — it is done, and colouring it red would make
 * a finished job look like an outstanding one.
 */
export function isOverdue(followUp: EnquiryFollowUp, now = Date.now()): boolean {
  return followUp.status === "Scheduled" && Date.parse(followUp.scheduledAt) < now;
}

/** Scheduled and still ahead of time. */
export function isUpcoming(followUp: EnquiryFollowUp, now = Date.now()): boolean {
  return followUp.status === "Scheduled" && Date.parse(followUp.scheduledAt) >= now;
}

/**
 * The statuses a follow-up may move to from where it is.
 *
 * A finished follow-up stays finished: the way to correct a wrong outcome is
 * to add the right one, not to rewrite history. Rescheduled and Missed can
 * still be picked up again, because both describe something that did not
 * happen yet.
 */
export function allowedFollowUpMoves(from: FollowUpStatus): FollowUpStatus[] {
  switch (from) {
    case "Scheduled":
      return ["Completed", "Missed", "Rescheduled", "Cancelled"];
    case "Missed":
    case "Rescheduled":
      return ["Completed", "Cancelled"];
    case "Completed":
    case "Cancelled":
      return [];
  }
}
