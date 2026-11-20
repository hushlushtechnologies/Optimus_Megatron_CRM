import { z } from "zod";

/*
|--------------------------------------------------------------------------
| VALUATION AND MATCHING
|--------------------------------------------------------------------------
|
| Two things a member of staff decides and the system records. Neither is
| computed, and that is deliberate:
|
|   - A valuation is somebody's judgement after seeing a car. There is no
|     UAE market-value feed here and no formula pretending to be one.
|   - A dream-car match is somebody deciding a car fits a brief. Matching on
|     brand and budget alone produces a phone call about a car the customer
|     did not ask for.
*/

const id = z.string().uuid();

const money = z
  .union([z.number(), z.literal(""), z.null()])
  .transform((value) => (value === "" || value === null ? null : value))
  .refine((value) => value === null || (value >= 0 && value <= 100_000_000), {
    message: "Enter an amount between 0 and 100,000,000.",
  });

/* =========================================================
   VALUATION
========================================================= */

/**
 * What we think a customer's car is worth, and what we would offer for it.
 *
 * The estimate and the offer are separate numbers on purpose. What a car is
 * worth and what a dealership will pay for it are different figures, and
 * collapsing them into one would mean either overstating the offer or
 * understating the valuation.
 *
 * An expiry is only meaningful with an offer attached — a date on its own
 * says a number nobody quoted runs out on Thursday.
 */
export const enquiryValuationSchema = z
  .object({
    vehicleId: id,
    estimatedValue: money,
    valuationNotes: z.string().trim().max(2000).default(""),
    proposedOffer: money,
    /** A local date, read as end of day in Dubai. */
    offerExpiresOn: z
      .union([
        z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/),
        z.literal(""),
      ])
      .transform((value) => (value === "" ? null : `${value}T23:59:59+04:00`))
      .nullable()
      .default(null),
  })
  .superRefine((value, ctx) => {
    if (value.offerExpiresOn !== null && value.proposedOffer === null) {
      ctx.addIssue({
        code: "custom",
        path: ["offerExpiresOn"],
        message: "An expiry needs an offer to expire. Enter the offer, or clear the date.",
      });
    }

    /*
     * An offer above the estimate is allowed — a sought-after car, a part
     * exchange that makes the deal work — but it is unusual enough that
     * somebody should have meant it, so it asks for a note.
     */
    if (
      value.proposedOffer !== null &&
      value.estimatedValue !== null &&
      value.proposedOffer > value.estimatedValue &&
      value.valuationNotes === ""
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["valuationNotes"],
        message: "The offer is above the estimate. Add a note saying why.",
      });
    }
  });

/* =========================================================
   DREAM CAR MATCHING
========================================================= */

/**
 * Linking a car in stock to a dream-car brief, or unlinking it.
 *
 * carId null clears the match. Nothing automatic ever writes this.
 */
export const matchDreamCarSchema = z.object({
  enquiryId: id,
  carId: id.nullable(),
});
