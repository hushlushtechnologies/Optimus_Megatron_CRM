import { z } from "zod";

/*
|--------------------------------------------------------------------------
| LOYALTY SETTINGS (Phase 17)
|--------------------------------------------------------------------------
|
| "Do not assume earning or conversion values."
|
| So every rate is nullable with no default, and the one rule that makes
| that meaningful is enforced here as well as in the database: the program
| cannot be switched on until both rates exist. Validating it in both places
| is deliberate — the schema gives a sentence somebody can act on, the
| constraint makes it true even if something bypasses the form.
*/

/** A whole number from a text input, or null when left blank. */
const optionalCount = z
  .union([z.coerce.number().int().positive(), z.literal("")])
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .default(null);

/** A percentage of a deal, entered as a percent, stored as basis points. */
const optionalPercent = z
  .union([z.coerce.number().min(0.01).max(100), z.literal("")])
  .transform((value) => (value === "" ? null : Math.round(value * 100)))
  .nullable()
  .default(null);

export const EARN_BASES = ["agreed_price", "net_price", "proposed_price"] as const;

export const EARN_BASIS_LABELS: Record<(typeof EARN_BASES)[number], string> = {
  agreed_price: "The agreed price",
  net_price: "The proposed price minus discounts",
  proposed_price: "The proposed price",
};

export const REFUND_POLICIES = [
  "reverse_earned",
  "keep_earned",
  "reverse_and_restore_redeemed",
] as const;

export const REFUND_POLICY_LABELS: Record<(typeof REFUND_POLICIES)[number], string> = {
  reverse_earned: "Take back the points the sale earned",
  keep_earned: "Let the customer keep the points",
  reverse_and_restore_redeemed:
    "Take back what it earned, and give back what they spent on it",
};

export const loyaltySettingsSchema = z
  .object({
    isEnabled: z.boolean(),

    earnPointsPer1000Aed: optionalCount,
    earnBasis: z.enum(EARN_BASES),

    redeemPointsPerAed: optionalCount,
    minRedeemPoints: optionalCount,
    maxRedeemPoints: optionalCount,
    maxRedeemPercentOfDeal: optionalPercent,

    expiryMonths: optionalCount,
    refundPolicy: z.enum(REFUND_POLICIES),
    allowNegativeBalance: z.boolean(),
  })
  .superRefine((value, ctx) => {
    /*
     * The guard that makes "ships disabled" mean something. Without both
     * numbers, enabling the program would start crediting points at a rate
     * nobody chose.
     */
    if (value.isEnabled) {
      if (value.earnPointsPer1000Aed === null) {
        ctx.addIssue({
          code: "custom",
          path: ["earnPointsPer1000Aed"],
          message: "Set the earn rate before switching the program on.",
        });
      }

      if (value.redeemPointsPerAed === null) {
        ctx.addIssue({
          code: "custom",
          path: ["redeemPointsPerAed"],
          message: "Set the redemption rate before switching the program on.",
        });
      }
    }

    if (
      value.minRedeemPoints !== null &&
      value.maxRedeemPoints !== null &&
      value.maxRedeemPoints < value.minRedeemPoints
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["maxRedeemPoints"],
        message: "The maximum is below the minimum.",
      });
    }
  });

/* =========================================================
   EARN RULES
========================================================= */

export const EARN_EVENT_KEYS = [
  "deal_completed",
  "deal_confirmed",
  "payment_verified",
  "manual_bonus",
] as const;

export const earnRuleSchema = z.object({
  eventKey: z.enum(EARN_EVENT_KEYS),
  isEnabled: z.boolean(),
  /* Three decimals, matching the column's numeric(6,3). */
  multiplier: z.coerce.number().min(0.001).max(999),
  collectionIds: z.array(z.string().uuid()).max(100).default([]),
});

/* =========================================================
   ADJUSTMENTS (Phase 21)
========================================================= */

export const adjustPointsSchema = z.object({
  customerId: z.string().uuid(),

  /*
   * Signed. One field rather than an amount plus a direction, because two
   * fields is a way to credit when you meant to deduct.
   */
  points: z.coerce
    .number()
    .int()
    .refine((value) => value !== 0, "Enter a number of points to add or take away."),

  /* Required by the plan, the database constraint and here. */
  reason: z
    .string()
    .trim()
    .min(5, "Say why — somebody reading this in six months needs to know.")
    .max(500),

  entryType: z.enum(["adjust", "correction"]).default("adjust"),
});

/* =========================================================
   REDEEMING AGAINST A DEAL (Phase 20)
========================================================= */

export const reservePointsSchema = z.object({
  dealId: z.string().uuid(),
  points: z.coerce.number().int().positive("Enter how many points to use."),
});

export const commitReservationSchema = z.object({
  reservationId: z.string().uuid(),
});

export const releaseReservationSchema = z.object({
  reservationId: z.string().uuid(),
  reason: z.string().trim().max(300).default(""),
});
