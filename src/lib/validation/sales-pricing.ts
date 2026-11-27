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

/*
 * salesSettingsSchema was here. It required every editable sales_settings
 * field at once, which paired with an action that wrote every column at once.
 * Sprint 10 splits the settings across three pages, so both are gone; see
 * validation/settings-sections.ts for the field-scoped schemas and the reason.
 */

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
