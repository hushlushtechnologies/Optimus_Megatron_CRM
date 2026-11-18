import { z } from "zod";
import { toFils } from "@/src/lib/utils/sales-money";

const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/;

/** A percentage from 0 to 100 with at most two decimals, typed as text. */
export function isPercentString(value: string): boolean {
  return PERCENT_RE.test(value) && Number(value) <= 100;
}

const amountText = z.string().trim().max(20, "That amount is too long.");

export const savePricingSchema = z
  .object({
    id: z.string().uuid(),
    /** The deal's version when the dialog opened, sent back exactly as it was read. */
    expectedUpdatedAt: z.string().min(10).max(40),
    proposedPrice: amountText,
    discountAmount: amountText,
    feeTypeIds: z.array(z.string().uuid()).max(50),
    note: z.string().max(300, "Keep the note under 300 characters."),
    approveNow: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const price = value.proposedPrice === "" ? null : toFils(value.proposedPrice);
    const discount = value.discountAmount === "" ? BigInt(0) : toFils(value.discountAmount);

    if (price === null || price <= BigInt(0)) {
      ctx.addIssue({
        code: "custom",
        path: ["proposedPrice"],
        message: "Enter a price above zero, with at most two decimals.",
      });
      return;
    }
    if (discount === null || discount < BigInt(0)) {
      ctx.addIssue({
        code: "custom",
        path: ["discountAmount"],
        message: "Enter a discount of zero or more, with at most two decimals.",
      });
      return;
    }
    if (discount >= price) {
      ctx.addIssue({
        code: "custom",
        path: ["discountAmount"],
        message: "The discount can't take the price to zero or below.",
      });
    }
  });

export const approveDiscountSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: z.string().min(10).max(40),
  note: z.string().max(300, "Keep the note under 300 characters."),
});

export const salesSettingsSchema = z
  .object({
    discountAutoApprovePercent: z
      .string()
      .trim()
      .refine(isPercentString, "Enter a percentage from 0 to 100, with at most two decimals."),
    feesEnabled: z.boolean(),
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
    confirmMinDepositPercent: z
      .string()
      .trim()
      .refine(isPercentString, "Enter a percentage from 0 to 100, with at most two decimals."),
    separateVerifier: z.boolean(),
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

export const feeTypeSchema = z
  .object({
    id: z.string().uuid().nullable(),
    name: z.string().trim().min(2, "Give the fee a name.").max(60, "Keep the name under 60 characters."),
    calcMode: z.enum(["fixed", "percent"]),
    value: z.string().trim().max(20),
    isActive: z.boolean(),
  })
  .superRefine((fee, ctx) => {
    if (fee.calcMode === "fixed") {
      const fils = toFils(fee.value);
      if (fils === null || fils <= BigInt(0)) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Enter an amount above zero, with at most two decimals.",
        });
      }
    } else if (!isPercentString(fee.value) || Number(fee.value) <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Enter a percentage above 0 and up to 100, with at most two decimals.",
      });
    }
  });
