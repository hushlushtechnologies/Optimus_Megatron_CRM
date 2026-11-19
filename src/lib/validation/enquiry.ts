import { z } from "zod";

import {
  ENQUIRY_SOURCES,
  ENQUIRY_STATUSES,
  ENQUIRY_TYPES,
  PREFERRED_CONTACTS,
} from "@/src/lib/types/enquiry";

/*
|--------------------------------------------------------------------------
| ENQUIRY VALIDATION
|--------------------------------------------------------------------------
|
| Two shapes, on purpose. The public schema is what an unauthenticated form
| may send: contact details, a message, and nothing that decides how the
| enquiry is handled. The manual schema is what a colleague may enter, which
| can include an assignment and a known customer.
*/

const typeEnum = z.enum(ENQUIRY_TYPES as [string, ...string[]]);
const sourceEnum = z.enum(ENQUIRY_SOURCES as [string, ...string[]]);
const statusEnum = z.enum(ENQUIRY_STATUSES as [string, ...string[]]);
const contactEnum = z.enum(PREFERRED_CONTACTS as [string, ...string[]]);

/*
 * Deliberately loose: a UAE mobile, a landline, an international number with
 * a country code and a visitor's home number all have to get through. Anything
 * with enough digits to dial is accepted and tidied up by a person later —
 * rejecting a real customer's number is far worse than storing an odd one.
 */
const phoneField = z
  .string()
  .trim()
  .max(32, "That phone number is too long.")
  .refine((value) => value === "" || value.replace(/\D/g, "").length >= 7, {
    message: "Enter a phone number we can call back on.",
  });

const emailField = z
  .string()
  .trim()
  .max(160, "That email address is too long.")
  .refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value), {
    message: "Enter a valid email address.",
  });

const nameField = z.string().trim().min(2, "Please enter a name.").max(120, "That name is too long.");

/* =========================================================
   PUBLIC INTAKE
========================================================= */

export const publicEnquirySchema = z
  .object({
    fullName: nameField,
    email: emailField.optional().default(""),
    phone: phoneField.optional().default(""),
    message: z.string().trim().max(4000, "Please keep the message under 4000 characters.").default(""),

    enquiryType: typeEnum.optional().default("General"),
    preferredContact: contactEnum.optional(),

    carId: z.string().uuid().nullable().optional(),
    vehicleText: z.string().trim().max(200).optional().default(""),

    pageUrl: z.string().trim().max(500).optional().default(""),
    utmSource: z.string().trim().max(120).optional().default(""),
    utmMedium: z.string().trim().max(120).optional().default(""),
    utmCampaign: z.string().trim().max(120).optional().default(""),

    /*
     * The honeypot. A field a person never sees and so never fills in, named
     * plausibly enough that a form-filling script will. Anything in it means
     * the submission is almost certainly automated.
     */
    company: z.string().max(200).optional().default(""),

    /**
     * Milliseconds the form was open before being submitted. Sent by the
     * website; treated as advisory, since anything from a browser can be
     * forged. Absent is fine — a form that doesn't send it isn't punished.
     */
    elapsedMs: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.email === "" && value.phone === "") {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Enter an email address or a phone number so we can reply.",
      });
    }
  });

export type PublicEnquiryInput = z.infer<typeof publicEnquirySchema>;

/* =========================================================
   MANUAL ENTRY
========================================================= */

export const manualEnquirySchema = z
  .object({
    fullName: nameField,
    email: emailField.default(""),
    phone: phoneField.default(""),
    message: z.string().trim().max(4000, "Please keep the message under 4000 characters.").default(""),

    enquiryType: typeEnum.default("General"),
    source: sourceEnum.default("Phone"),
    preferredContact: contactEnum.optional(),

    carId: z.string().uuid().nullable().default(null),
    vehicleText: z.string().trim().max(200).default(""),

    assignedTo: z.string().uuid().nullable().default(null),
    customerId: z.string().uuid().nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.email === "" && value.phone === "") {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Enter an email address or a phone number.",
      });
    }
  });

export type ManualEnquiryValues = z.infer<typeof manualEnquirySchema>;

export const manualEnquiryDefaults: ManualEnquiryValues = {
  fullName: "",
  email: "",
  phone: "",
  message: "",
  enquiryType: "General",
  source: "Phone",
  carId: null,
  vehicleText: "",
  assignedTo: null,
  customerId: null,
};

/* =========================================================
   WORKING ON ONE
========================================================= */

export const setEnquiryStatusSchema = z
  .object({
    id: z.string().uuid(),
    status: statusEnum,
    reason: z.string().trim().max(300, "Please keep the reason under 300 characters.").default(""),
  })
  .superRefine((value, ctx) => {
    // Closing is the one status that always needs a word about why.
    if (value.status === "Closed" && value.reason.length < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Please say why this enquiry is being closed.",
      });
    }

    /*
     * Converted is reached by converting, never by picking it from a list:
     * it has to create a customer and a lead to mean anything.
     */
    if (value.status === "Converted") {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Use Convert to turn this enquiry into a lead.",
      });
    }
  });

export const assignEnquirySchema = z.object({
  id: z.string().uuid(),
  assignedTo: z.string().uuid().nullable(),
});

export const linkEnquiryCustomerSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid().nullable(),
});

/*
 * Converting is a review step, not a button that guesses.
 *
 * A customer record needs a first and last name, a valid email and a UAE
 * mobile — more than a website form usually collects. So the person
 * converting confirms or completes those four fields here, and sees exactly
 * what is missing instead of a failure after the fact.
 */
export const convertEnquirySchema = z
  .object({
    id: z.string().uuid(),
    /** null means "create a customer from the fields below". */
    customerId: z.string().uuid().nullable(),

    firstName: z.string().trim().max(60).default(""),
    lastName: z.string().trim().max(60).default(""),
    email: emailField.default(""),
    phone: phoneField.default(""),

    stageId: z.string().uuid("Choose the stage this lead should start in."),
    temperature: z.enum(["Hot", "Warm", "Cold"]),
    assignedStaffId: z.string().uuid().nullable(),

    /** Carried onto the lead as its first note. Defaults to the enquiry message. */
    note: z.string().trim().max(1000, "Please keep the note under 1000 characters.").default(""),
  })
  .superRefine((value, ctx) => {
    // An existing customer already has all of this on file.
    if (value.customerId !== null) return;

    if (value.firstName === "") {
      ctx.addIssue({ code: "custom", path: ["firstName"], message: "Enter a first name." });
    }

    if (value.lastName === "") {
      ctx.addIssue({ code: "custom", path: ["lastName"], message: "Enter a last name." });
    }

    if (value.email === "") {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "A customer record needs an email address.",
      });
    }

    if (value.phone === "") {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "A customer record needs a mobile number.",
      });
    }
  });

export type ConvertEnquiryValues = z.infer<typeof convertEnquirySchema>;

export const deleteEnquirySchema = z.object({
  id: z.string().uuid(),
});
