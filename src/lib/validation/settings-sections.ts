import { z } from "zod";
import { isPercentString } from "@/src/lib/validation/sales-pricing";
import { toFils } from "@/src/lib/utils/sales-money";

/*
|------------------------------------------------------------------------------
| Why these schemas exist, and why they are separate
|------------------------------------------------------------------------------
|
| Sprint 10 splits one Sales Settings page into several focused pages, so the
| same `sales_settings` row is now edited from three places:
|
|   /admin/settings/operations/reservations  hold length, deposit to reserve
|   /admin/settings/operations/sales         discount threshold, fees on/off
|   /admin/settings/operations/payments      separate verifier, deposit to confirm
|
| `sales_settings` is a single row (`id = true`). The Sprint 8 action wrote
| EVERY column on every save, driven by one schema that required every field.
| That was correct while one form held every field. It is not correct once
| three forms do, because the two fields a form does not show still have to be
| sent, and they are sent as they were when that page loaded. So:
|
|   1. Shahida opens Reservations. Discount threshold is 5% at load.
|   2. Someone with approval rights lowers the threshold to 2%.
|   3. Shahida changes the hold from 3 days to 5 and saves.
|   4. Her save writes discount_auto_approve_percent = 5 — the stale value.
|
| The threshold is back to 5% with nothing to show it moved. That is a
| financial safeguard being weakened by someone editing an unrelated page, with
| no permission check for the field that changed and no audit entry anybody
| would think to look for. Sprint 10's rule — "a configuration screen must not
| be able to weaken financial safeguards without the correct permission and
| audit history" — is broken by exactly this mechanism.
|
| So each schema below covers one page's fields and nothing else, and each
| action writes only the columns its schema carries. A column nobody edited is
| a column nobody writes. Cross-field invariants stay inside the schema that
| owns both sides of them.
|
| The one-form version of this cannot be restored by accident: the all-columns
| action and the all-columns schema (`salesSettingsSchema`) are gone.
|
|------------------------------------------------------------------------------
*/

const percent = z
  .string()
  .trim()
  .refine(isPercentString, "Enter a percentage from 0 to 100, with at most two decimals.");

/**
 * Reservations page. `reservation_default_days`, `reservation_max_days`,
 * `reservation_deposit_mode`, `reservation_deposit_value`.
 *
 * Both sides of the default-vs-longest invariant are on this page, so the
 * check belongs here and cannot be dodged by saving somewhere else.
 */
export const reservationSettingsSchema = z
  .object({
    reservationDefaultDays: z
      .number({ message: "Enter a whole number of days." })
      .int("Enter a whole number of days.")
      .min(1, "Hold for at least 1 day.")
      .max(90, "The default hold can be at most 90 days."),
    reservationMaxDays: z
      .number({ message: "Enter a whole number of days." })
      .int("Enter a whole number of days.")
      .min(1, "Allow at least 1 day.")
      .max(365, "The longest hold can be at most 365 days."),
    depositMode: z.enum(["none", "fixed", "percent"]),
    depositValue: z.string().trim().max(20),
  })
  .superRefine((value, ctx) => {
    if (value.reservationDefaultDays > value.reservationMaxDays) {
      ctx.addIssue({
        code: "custom",
        path: ["reservationDefaultDays"],
        message: "The default hold can't be longer than the longest hold.",
      });
    }
    if (value.depositMode === "fixed") {
      const fils = toFils(value.depositValue);
      if (fils === null || fils < BigInt(0)) {
        ctx.addIssue({
          code: "custom",
          path: ["depositValue"],
          message: "Enter an amount of zero or more, with at most two decimals.",
        });
      }
    }
    if (value.depositMode === "percent" && !isPercentString(value.depositValue)) {
      ctx.addIssue({
        code: "custom",
        path: ["depositValue"],
        message: "Enter a percentage from 0 to 100, with at most two decimals.",
      });
    }
  });

/**
 * Sales & pricing page. `discount_auto_approve_percent`, `fees_enabled`.
 *
 * `vat_rate_percent` is deliberately absent: tax is not calculated anywhere in
 * the app, and a rate that is stored but unused is not a setting, it is a
 * trap. The Sales page says so in words instead.
 */
export const dealRuleSettingsSchema = z.object({
  discountAutoApprovePercent: percent,
  feesEnabled: z.boolean(),
});

/**
 * Payments page. `confirm_min_deposit_percent`,
 * `payments_require_separate_verifier`.
 *
 * `confirm_min_deposit_percent` lives here rather than with reservations
 * despite both being deposits: it gates confirming a SALES DEAL on verified
 * payment, and it is read by sales-detail-queries alongside the discount
 * threshold. It is a payment control, not a reservation rule.
 */
export const paymentControlSettingsSchema = z.object({
  confirmMinDepositPercent: percent,
  separateVerifier: z.boolean(),
});

/**
 * Showrooms. `name`, `is_active`, `sort_order`, and `address` where the column
 * exists (see settings-section-queries for how its absence is handled).
 *
 * There is no delete. Cars, deals, test drives, reservations and enquiries all
 * reference `locations.id` with `on delete set null`, so deleting a showroom
 * would silently blank the location on historical records — a sold car would
 * forget where it was sold. Switching a showroom off keeps the history and
 * takes it out of every picker.
 */
export const locationSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(2, "Give the showroom a name.").max(80, "Keep the name under 80 characters."),
  address: z.string().trim().max(300, "Keep the address under 300 characters."),
  isActive: z.boolean(),
  sortOrder: z
    .number({ message: "Enter a whole number." })
    .int("Enter a whole number.")
    .min(0, "Use 0 or more.")
    .max(9999, "Use 9999 or less."),
});
