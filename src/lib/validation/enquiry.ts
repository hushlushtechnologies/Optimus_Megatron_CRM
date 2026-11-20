import { z } from "zod";

import { ENQUIRY_PRIORITIES, PREFERRED_CONTACTS } from "@/src/lib/types/enquiry";
import {
  EMPLOYMENT_TYPES,
  GENERAL_CATEGORIES,
  PURCHASE_TIMELINES,
  REGISTRATION_EMIRATES,
  VEHICLE_CONDITIONS,
  VEHICLE_SPECS,
} from "@/src/lib/types/enquiry-details";

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

/*
 * Types, sources and statuses live in lookup tables now, so a schema that
 * hard-coded them would reject a value somebody had legitimately configured.
 * These accept any sensible string and the workflow layer checks it against
 * the database, which is the only place that actually knows.
 */
const vocabulary = z.string().trim().min(1).max(60);

const contactEnum = z.enum(PREFERRED_CONTACTS as [string, ...string[]]);

const priorityEnum = z.enum(ENQUIRY_PRIORITIES as [string, ...string[]]);

/**
 * The version the client last read.
 *
 * Optional, because the quick actions on the list don't track it. When it is
 * sent, a mismatch is refused rather than overwriting somebody else's edit.
 */
const expectedVersion = z.number().int().positive().optional();

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

    enquiryType: vocabulary.optional().default("General"),
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

/* =========================================================
   TYPE-SPECIFIC DETAILS
========================================================= */

/**
 * A money field somebody may or may not have filled in.
 *
 * An empty box means "they didn't say", which is not the same as zero, so it
 * becomes null rather than 0. The ceiling is high enough for anything on a
 * UAE forecourt and low enough to catch a slipped keyboard.
 */
const moneyField = z
  .union([z.number(), z.literal(""), z.null()])
  .transform((value) => (value === "" || value === null ? null : value))
  .refine((value) => value === null || (value >= 0 && value <= 100_000_000), {
    message: "Enter an amount between 0 and 100,000,000.",
  });

/** A closed list where "not discussed" is a real answer, stored as null. */
function nullableFrom<T extends readonly string[]>(allowed: T) {
  return z
    .union([z.enum(allowed as unknown as [string, ...string[]]), z.literal(""), z.null()])
    .transform((value) => (value === "" || value === null ? null : value));
}

export const financeDetailsSchema = z.object({
  vehiclePrice: moneyField,
  downPayment: moneyField,
  termMonths: z
    .union([z.number().int(), z.literal(""), z.null()])
    .transform((value) => (value === "" || value === null ? null : value))
    .refine((value) => value === null || (value >= 6 && value <= 120), {
      message: "Terms run from 6 to 120 months.",
    }),
  monthlyBudget: moneyField,
  employmentType: z
    .union([z.enum(EMPLOYMENT_TYPES as unknown as [string, ...string[]]), z.literal(""), z.null()])
    .transform((value) => (value === "" || value === null ? null : value)),
  bankPreference: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(2000).default(""),
});

export type FinanceDetailsValues = z.infer<typeof financeDetailsSchema>;

/**
 * A car the customer owns.
 *
 * A brand is the one thing required, because the table insists on it: a row
 * with no make is a record of nothing. Everything else is what they happened
 * to mention, and the gaps are filled in when somebody sees the car.
 */
export const customerVehicleSchema = z
  .object({
    brandId: z.string().uuid().nullable().default(null),
    brandOther: z.string().trim().max(60).default(""),
    model: z.string().trim().max(60).default(""),
    variant: z.string().trim().max(60).default(""),

    year: z
      .union([z.number().int(), z.literal(""), z.null()])
      .transform((value) => (value === "" || value === null ? null : value))
      .refine((value) => value === null || (value >= 1950 && value <= 2100), {
        message: "Enter a year between 1950 and 2100.",
      }),

    mileageKm: z
      .union([z.number().int(), z.literal(""), z.null()])
      .transform((value) => (value === "" || value === null ? null : value))
      .refine((value) => value === null || (value >= 0 && value <= 2_000_000), {
        message: "Enter a mileage between 0 and 2,000,000 km.",
      }),

    registrationEmirate: nullableFrom(REGISTRATION_EMIRATES),
    spec: nullableFrom(VEHICLE_SPECS),
    condition: nullableFrom(VEHICLE_CONDITIONS),

    exteriorColor: z.string().trim().max(40).default(""),
    interiorColor: z.string().trim().max(40).default(""),

    hasAccidentHistory: z.boolean().nullable().default(null),
    accidentNotes: z.string().trim().max(1000).default(""),
    hasServiceHistory: z.boolean().nullable().default(null),
    serviceNotes: z.string().trim().max(1000).default(""),

    askingPrice: moneyField,
    locationId: z.string().uuid().nullable().default(null),

    description: z.string().trim().max(2000).default(""),

    /* Storage paths of photos already uploaded to the private bucket. */
    photoPaths: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.brandId === null && value.brandOther === "") {
      ctx.addIssue({
        code: "custom",
        path: ["brandOther"],
        message: "Pick a make, or type one in.",
      });
    }
  });

export type CustomerVehicleValues = z.infer<typeof customerVehicleSchema>;

/** A year somebody may or may not have named. */
const yearField = z
  .union([z.number().int(), z.literal(""), z.null()])
  .transform((value) => (value === "" || value === null ? null : value))
  .refine((value) => value === null || (value >= 1950 && value <= 2100), {
    message: "Enter a year between 1950 and 2100.",
  });

/**
 * A brief for a car the showroom hasn't got.
 *
 * Nothing is required — not even a make. Somebody who says only "a white
 * G-Wagon, under 400" has given a usable brief, and a form that refuses it
 * means the brief is kept somewhere this system can't see.
 *
 * The two range checks exist because the table has the same ones. Catching
 * them here turns a constraint violation into a sentence beside the field
 * that caused it.
 */
export const dreamCarDetailsSchema = z
  .object({
    brandId: z.string().uuid().nullable().default(null),
    brandOther: z.string().trim().max(60).default(""),
    model: z.string().trim().max(60).default(""),
    variant: z.string().trim().max(60).default(""),

    yearFrom: yearField,
    yearTo: yearField,
    budgetMin: moneyField,
    budgetMax: moneyField,

    exteriorColor: z.string().trim().max(40).default(""),
    interiorColor: z.string().trim().max(40).default(""),

    maxMileageKm: z
      .union([z.number().int(), z.literal(""), z.null()])
      .transform((value) => (value === "" || value === null ? null : value))
      .refine((value) => value === null || (value >= 0 && value <= 2_000_000), {
        message: "Enter a mileage between 0 and 2,000,000 km.",
      }),

    fuelType: z.string().trim().max(40).default(""),
    transmission: z.string().trim().max(40).default(""),
    spec: nullableFrom(VEHICLE_SPECS),
    features: z.string().trim().max(2000).default(""),

    timeline: nullableFrom(PURCHASE_TIMELINES),
    notes: z.string().trim().max(2000).default(""),
  })
  .superRefine((value, ctx) => {
    if (value.yearFrom !== null && value.yearTo !== null && value.yearFrom > value.yearTo) {
      ctx.addIssue({
        code: "custom",
        path: ["yearTo"],
        message: "The later year can't be before the earlier one.",
      });
    }

    if (value.budgetMin !== null && value.budgetMax !== null && value.budgetMin > value.budgetMax) {
      ctx.addIssue({
        code: "custom",
        path: ["budgetMax"],
        message: "The top of the budget can't be below the bottom.",
      });
    }
  });

export type DreamCarValues = z.infer<typeof dreamCarDetailsSchema>;

export const manualEnquirySchema = z
  .object({
    fullName: nameField,
    email: emailField.default(""),
    phone: phoneField.default(""),
    message: z.string().trim().max(4000, "Please keep the message under 4000 characters.").default(""),

    enquiryType: vocabulary.default("General"),
    source: vocabulary.default("Phone Call"),
    preferredContact: contactEnum.optional(),

    carId: z.string().uuid().nullable().default(null),
    vehicleText: z.string().trim().max(200).default(""),

    priority: priorityEnum.default("Normal"),
    subject: z.string().trim().max(160).default(""),
    assignedTo: z.string().uuid().nullable().default(null),
    customerId: z.string().uuid().nullable().default(null),
    locationId: z.string().uuid().nullable().default(null),

    /*
     * Only ever set on a General enquiry. The table refuses it on any other
     * type, so the form clears it when the type changes.
     */
    generalCategory: nullableFrom(GENERAL_CATEGORIES),

    /*
     * Only sent when the type asks for it. Kept optional rather than
     * defaulted, so an enquiry of another kind never writes an empty
     * finance row that then looks like a finance request.
     */
    finance: financeDetailsSchema.optional(),

    /* The customer's own car, when they are selling one to us. */
    sellingVehicle: customerVehicleSchema.optional(),

    /*
     * The car coming off the price of one of ours. Same shape, different
     * role: a trade-in and a sale describe the same object, and giving them
     * two schemas would mean two places to fix the next time one changes.
     */
    tradeInVehicle: customerVehicleSchema.optional(),

    /* What they want that we haven't got. */
    dreamCar: dreamCarDetailsSchema.optional(),
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
  source: "Phone Call",
  priority: "Normal",
  subject: "",
  carId: null,
  vehicleText: "",
  generalCategory: null,
  assignedTo: null,
  customerId: null,
  locationId: null,
};

/* =========================================================
   WORKING ON ONE
========================================================= */

export const setEnquiryStatusSchema = z
  .object({
    id: z.string().uuid(),
    status: vocabulary,
    reason: z.string().trim().max(300, "Please keep the reason under 300 characters.").default(""),
    expectedVersion,
  })
  .superRefine((value, ctx) => {
    // Cancelling and rejecting always need a word about why.
    if ((value.status === "Cancelled" || value.status === "Rejected") && value.reason.length < 3) {
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
  reason: z.string().trim().max(300).default(""),
  expectedVersion,
});

/**
 * A bulk request.
 *
 * Capped at 100 because each id is handled on its own — same reads, same
 * workflow checks, same history — and a thousand of those in one request
 * would time out halfway through with no way to tell what got done.
 */
/** What somebody types into the customer box on the create form. */
export const enquiryCustomerSearchSchema = z.object({
  query: z.string().trim().min(2, "Type at least two characters.").max(80),
});

export const bulkEnquirySchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, "Pick at least one enquiry.")
    .max(100, "Please do no more than 100 at a time."),
});

export const bulkAssignEnquiriesSchema = bulkEnquirySchema.extend({
  assignedTo: z.string().uuid().nullable(),
  reason: z.string().trim().max(300).default(""),
});

export const bulkSetEnquiryStatusSchema = bulkEnquirySchema.extend({
  status: vocabulary,
  reason: z.string().trim().max(300).default(""),
});

export const bulkSetEnquiryPrioritySchema = bulkEnquirySchema.extend({
  priority: priorityEnum,
});

/**
 * Archiving takes an enquiry off every list, count and dashboard figure
 * without deleting it. `archived: false` puts it back.
 */
export const archiveEnquirySchema = z.object({
  id: z.string().uuid(),
  archived: z.boolean(),
});

export const bulkArchiveEnquiriesSchema = bulkEnquirySchema.extend({
  archived: z.boolean(),
});

export const setEnquiryPrioritySchema = z.object({
  id: z.string().uuid(),
  priority: priorityEnum,
  expectedVersion,
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
