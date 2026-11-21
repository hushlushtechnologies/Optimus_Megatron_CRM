import { z } from "zod";

import {
  PROMOTION_STATUSES,
  PROMOTION_TYPES,
  STACKING_POLICIES,
} from "@/src/lib/types/offers";

/*
|--------------------------------------------------------------------------
| VALIDATION
|--------------------------------------------------------------------------
|
| Money arrives as text and is kept as text here, then parsed to fils by the
| server. A Zod schema that coerced it to a JavaScript number would undo the
| whole point of the fils convention before the value ever reached the
| database.
*/

const uuid = z.string().uuid();

/** A money field: digits with at most two decimals, or blank. */
const moneyText = z
  .string()
  .trim()
  .regex(/^(\d{1,12}(\.\d{1,2})?)?$/, "Enter an amount with at most two decimals.");

/** A `datetime-local` value, given the Dubai offset. Blank means none. */
const dubaiDateTime = z
  .union([
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time."),
    z.literal(""),
  ])
  .transform((value) => (value === "" ? null : `${value}:00+04:00`));

export const offerTargetSchema = z.object({
  targetKind: z.enum(["car", "brand", "model", "collection", "location"]),
  targetId: uuid,
});

export const offerEligibilityRuleSchema = z.object({
  ruleKind: z.enum([
    "lifecycle_status",
    "customer_tag",
    "min_completed_deals",
    "min_lifetime_spend_fils",
    "interested_brand",
    "is_existing_customer",
  ]),
  operator: z.enum(["in", "not_in", "gte", "lte", "eq"]).default("in"),
  value: z.unknown(),
});

/* =========================================================
   CREATE AND EDIT
========================================================= */

export const upsertPromotionSchema = z
  .object({
    id: uuid.optional(),

    name: z.string().trim().min(2, "Give the campaign a name.").max(120),
    reference: z
      .string()
      .trim()
      .max(40)
      .regex(/^[A-Za-z0-9-]*$/, "Letters, numbers and hyphens only.")
      .default(""),
    description: z.string().trim().max(2000).default(""),

    promotionType: z.enum(PROMOTION_TYPES),

    discountType: z.enum(["percentage", "fixed"]),
    /* Percent 0–100, or whole dirhams. Checked against the type below. */
    discountValue: z.coerce.number().min(0, "A discount can't be negative."),

    startsAt: dubaiDateTime,
    endsAt: dubaiDateTime,

    priority: z.coerce.number().int().min(0).max(1000).default(0),

    maxRedemptions: z
      .union([z.coerce.number().int().positive(), z.literal("")])
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .default(null),

    maxPerCustomer: z
      .union([z.coerce.number().int().positive(), z.literal("")])
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .default(null),

    minPurchase: moneyText.default(""),
    maxDiscount: moneyText.default(""),

    pointsMultiplier: z
      .union([z.coerce.number().positive().max(10), z.literal("")])
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .default(null),

    stackingPolicy: z.enum(STACKING_POLICIES).default("none"),

    internalNotes: z.string().trim().max(2000).default(""),
    bannerUrl: z.union([z.string().trim().url(), z.literal("")]).default(""),

    /* Draft or scheduled on create. Going live is a separate, gated action. */
    status: z.enum(PROMOTION_STATUSES).default("draft"),

    targets: z.array(offerTargetSchema).max(200).default([]),
    eligibilityRules: z.array(offerEligibilityRuleSchema).max(20).default([]),
  })
  .superRefine((value, ctx) => {
    /* A percentage over 100 would price the car below nothing. */
    if (value.discountType === "percentage" && value.discountValue > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "A percentage discount can't be more than 100%.",
      });
    }

    /*
     * Zero discount is fine only for a points-multiplier campaign, which
     * gives points rather than money off.
     */
    if (value.discountValue === 0 && value.pointsMultiplier === null) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "Set a discount, or a points multiplier if this campaign gives points instead.",
      });
    }

    if (value.startsAt !== null && value.endsAt !== null && value.endsAt <= value.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "The end has to be after the start.",
      });
    }

    /*
     * Scheduling something to start in the past is almost always a slip. If
     * it should run now, the status is 'active'.
     */
    if (value.status === "scheduled" && value.startsAt === null) {
      ctx.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "A scheduled campaign needs a start date.",
      });
    }

    /* A fixed discount with a ceiling is a contradiction, not a config. */
    if (value.discountType === "fixed" && value.maxDiscount !== "") {
      ctx.addIssue({
        code: "custom",
        path: ["maxDiscount"],
        message: "A maximum only applies to a percentage discount.",
      });
    }

    if (value.maxPerCustomer !== null && value.maxRedemptions !== null) {
      if (value.maxPerCustomer > value.maxRedemptions) {
        ctx.addIssue({
          code: "custom",
          path: ["maxPerCustomer"],
          message: "One customer can't be allowed more uses than the campaign has in total.",
        });
      }
    }

    /* A typed-code campaign with no code can never be used. */
    if (value.promotionType === "code" && value.status === "active") {
      /* Codes are added on the detail page, so this only warns on publish. */
    }
  });

export type UpsertPromotionInput = z.input<typeof upsertPromotionSchema>;

/* =========================================================
   LIFECYCLE
========================================================= */

export const setOfferStatusSchema = z.object({
  id: uuid,
  status: z.enum(PROMOTION_STATUSES),
  reason: z.string().trim().max(300).default(""),
});

export const archiveOfferSchema = z.object({
  id: uuid,
  archived: z.boolean(),
});

export const duplicateOfferSchema = z.object({
  id: uuid,
});

/* =========================================================
   BULK

   Capped at 100 ids. The bulk helper runs them one at a time so each row is
   re-read and permission-checked on its own, and a thousand rows in one
   request would sit there long enough to time out halfway — leaving the
   person with no idea which half went through.
========================================================= */

const bulkIds = z.array(uuid).min(1, "Nothing was selected.").max(100, "Select 100 or fewer at a time.");

export const bulkSetOfferStatusSchema = z.object({
  ids: bulkIds,
  status: z.enum(PROMOTION_STATUSES),
  reason: z.string().trim().max(300).default(""),
});

export const bulkArchiveOffersSchema = z.object({
  ids: bulkIds,
  archived: z.boolean(),
});

/* =========================================================
   THE TARGETING PREVIEW

   Capped at 500 targets. Picking every model of every brand is a legitimate
   way to say "all of them", but an unbounded list goes into an SQL IN clause
   and a request with fifty thousand ids is a denial of service with a form
   attached.
========================================================= */

export const targetPreviewSchema = z.object({
  /* The same offerTargetSchema the create form submits, so one shape covers both. */
  targets: z.array(offerTargetSchema).max(500, "That's too many things to target at once."),
});

export const carSearchSchema = z.object({
  term: z.string().trim().max(100),
});

/* =========================================================
   CUSTOMER ASSIGNMENTS (Phase 10)
========================================================= */

export const assignOfferSchema = z
  .object({
    promotionId: uuid,
    customerId: uuid,
    /** Narrow it to one vehicle, or leave blank for any eligible one. */
    carId: z.union([uuid, z.literal("")]).transform((v) => (v === "" ? null : v)),
    validFrom: dubaiDateTime,
    validTo: dubaiDateTime,
    /** This person's own discount, in dirhams as typed. Blank = the campaign's. */
    discountOverride: moneyText.default(""),
    notes: z.string().trim().max(1000).default(""),
  })
  .superRefine((value, ctx) => {
    if (value.validFrom && value.validTo && value.validTo <= value.validFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["validTo"],
        message: "The end is before the start.",
      });
    }
  });

export const cancelAssignmentSchema = z.object({
  id: uuid,
  reason: z.string().trim().max(300).default(""),
});

export const customerSearchSchema = z.object({
  term: z.string().trim().max(100),
});

/* =========================================================
   PROMOTIONAL CODES (Phase 12)
========================================================= */

export const createCodeSchema = z.object({
  promotionId: uuid,
  /*
   * Letters, numbers, hyphens. No spaces: a code is read out over the phone
   * and typed by someone who may not be looking at it, and "SUMMER 26" gets
   * typed six different ways.
   */
  code: z
    .string()
    .trim()
    .min(3, "A code needs at least 3 characters.")
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and hyphens only — no spaces."),

  usageLimit: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),

  perCustomerLimit: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
});

export const setCodeActiveSchema = z.object({
  id: uuid,
  isActive: z.boolean(),
});

/* =========================================================
   REVERSING A REDEMPTION
========================================================= */

export const reverseRedemptionSchema = z.object({
  id: uuid,
  /* Required, not optional: a reversal with no reason is unexplainable later. */
  reason: z.string().trim().min(3, "Say why this is being reversed.").max(300),
});
