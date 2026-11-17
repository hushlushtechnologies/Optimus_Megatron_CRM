import { z } from "zod";
import { toFils } from "@/src/lib/utils/sales-money";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const recordPaymentSchema = z
  .object({
    dealId: z.string().uuid().nullable(),
    reservationId: z.string().uuid().nullable(),
    kind: z.enum(["Reservation Deposit", "Deposit", "Instalment", "Balance", "Refund"]),
    method: z.enum(["Cash", "Card", "Bank Transfer", "Cheque", "Finance Company", "Other"], {
      message: "Choose how it was paid.",
    }),
    amount: z.string().trim().max(20, "That amount is too long."),
    paidOn: z.string().regex(DATE_RE, "Enter the date it was paid."),
    reference: z.string().trim().max(80, "Keep the reference under 80 characters."),
    notes: z.string().max(500, "Keep the note under 500 characters."),
  })
  .superRefine((value, ctx) => {
    if ((value.dealId === null) === (value.reservationId === null)) {
      ctx.addIssue({ code: "custom", path: ["dealId"], message: "A payment belongs to a deal or a reservation." });
    }

    const fils = toFils(value.amount);
    if (fils === null || fils <= BigInt(0)) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Enter an amount above zero, with at most two decimals.",
      });
    }

    if (value.method !== "Cash" && value.reference === "") {
      ctx.addIssue({ code: "custom", path: ["reference"], message: "Enter the reference for this payment." });
    }

    if (value.kind === "Refund" && value.notes.trim().length < 3) {
      ctx.addIssue({ code: "custom", path: ["notes"], message: "Please say why the money is being refunded." });
    }
  });

export const setPaymentStatusSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(["verify", "reject", "reverse"]),
    reason: z.string().max(300, "Keep the reason under 300 characters."),
  })
  .superRefine((value, ctx) => {
    if (value.action !== "verify" && value.reason.trim().length < 3) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Please give a reason (at least 3 characters)." });
    }
  });