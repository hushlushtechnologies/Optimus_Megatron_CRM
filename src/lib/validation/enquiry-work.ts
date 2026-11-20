import { z } from "zod";

import { FOLLOW_UP_TYPES } from "@/src/lib/types/enquiry-work";

/*
|--------------------------------------------------------------------------
| NOTES AND FOLLOW-UPS
|--------------------------------------------------------------------------
*/

const id = z.string().uuid();

/* =========================================================
   NOTES
========================================================= */

export const addEnquiryNoteSchema = z.object({
  enquiryId: id,
  noteText: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(4000, "That's longer than a note should be — 4,000 characters is the limit."),
  /** Internal by default: the safe assumption is that nobody outside sees it. */
  isInternal: z.boolean().default(true),
});

export const editEnquiryNoteSchema = z.object({
  noteId: id,
  noteText: z.string().trim().min(1, "Write something first.").max(4000),
});

export const archiveEnquiryNoteSchema = z.object({ noteId: id });

/* =========================================================
   FOLLOW-UPS
========================================================= */

const followUpType = z.enum(FOLLOW_UP_TYPES as unknown as [string, ...string[]]);

/**
 * A time somebody typed into a datetime-local box.
 *
 * Accepted without a timezone and read as Dubai time, because that is where
 * everybody using this is standing. Sending it as a bare local string and
 * appending the offset here means a follow-up set for "2pm" is 2pm in the
 * showroom, not 2pm wherever the server happens to be.
 */
const localDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time.")
  .transform((value) => `${value}:00+04:00`);

export const createEnquiryFollowUpSchema = z.object({
  enquiryId: id,
  type: followUpType,
  scheduledAt: localDateTime,
  assignedTo: id.nullable().default(null),
  notes: z.string().trim().max(2000).default(""),
  reminderMinutesBefore: z
    .union([z.number().int(), z.null()])
    .refine((value) => value === null || (value >= 0 && value <= 10080), {
      message: "A reminder can be up to a week before.",
    })
    .default(null),
});

/**
 * Logging contact that has already happened.
 *
 * Creates a follow-up and completes it in one step, because "they rang in
 * and I spoke to them" is a real thing that needs recording and nobody is
 * going to schedule a call into the past first.
 */
export const logEnquiryContactSchema = z.object({
  enquiryId: id,
  type: followUpType,
  /** Optional: left out, it means just now. */
  happenedAt: localDateTime.optional(),
  outcomeNotes: z.string().trim().min(1, "Say what came of it — that is the part worth keeping.").max(2000),
});

export const completeEnquiryFollowUpSchema = z.object({
  followUpId: id,
  outcomeNotes: z.string().trim().min(1, "Say what came of it — that is the part worth keeping.").max(2000),
});

export const rescheduleEnquiryFollowUpSchema = z.object({
  followUpId: id,
  scheduledAt: localDateTime,
  reason: z.string().trim().max(500).default(""),
});

/**
 * Marking one missed or cancelled.
 *
 * Only these two: completing needs an outcome and rescheduling needs a new
 * time, so both have schemas of their own. Scheduled is where a follow-up
 * starts and is never something you move it back to.
 */
export const setEnquiryFollowUpStatusSchema = z.object({
  followUpId: id,
  status: z.enum(["Missed", "Cancelled"]),
  reason: z.string().trim().max(500).default(""),
});
