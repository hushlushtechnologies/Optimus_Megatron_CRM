import { z } from "zod";

export const issueDocumentSchema = z
  .object({
    type: z.enum(["Quotation", "Invoice", "Receipt", "Reservation Confirmation"]),
    dealId: z.string().uuid().nullable(),
    reservationId: z.string().uuid().nullable(),
    paymentId: z.string().uuid().nullable(),
    note: z.string().max(300, "Keep the note under 300 characters."),
  })
  .superRefine((value, ctx) => {
    if ((value.type === "Quotation" || value.type === "Invoice") && !value.dealId) {
      ctx.addIssue({ code: "custom", path: ["dealId"], message: "Choose a deal." });
    }
    if (value.type === "Receipt" && !value.paymentId) {
      ctx.addIssue({ code: "custom", path: ["paymentId"], message: "Choose a payment." });
    }
    if (value.type === "Reservation Confirmation" && !value.reservationId) {
      ctx.addIssue({ code: "custom", path: ["reservationId"], message: "Choose a reservation." });
    }
  });

export const voidDocumentSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3, "Please give a reason (at least 3 characters).").max(300, "Keep the reason under 300 characters."),
});

const optionalText = (max: number, message: string) =>
  z
    .string()
    .max(max, message)
    .transform((value) => (value.trim() === "" ? null : value.trim()));

export const companyProfileSchema = z.object({
  legalName: optionalText(120, "Keep the company name under 120 characters."),
  tradeName: optionalText(120, "Keep the trading name under 120 characters."),
  address: optionalText(300, "Keep the address under 300 characters."),
  phone: optionalText(40, "Keep the phone number under 40 characters."),
  email: optionalText(120, "Keep the email under 120 characters."),
  website: optionalText(120, "Keep the website under 120 characters."),
  taxRegistrationNumber: optionalText(40, "Keep the tax registration number under 40 characters."),
  bankDetails: optionalText(600, "Keep the bank details under 600 characters."),
  quotationTerms: optionalText(1500, "Keep the quotation terms under 1,500 characters."),
  invoiceFooter: optionalText(600, "Keep the invoice footer under 600 characters."),
  quotationValidDays: z
    .number({ message: "Enter a whole number of days." })
    .int("Enter a whole number of days.")
    .min(1, "A quotation must be valid for at least 1 day.")
    .max(90, "A quotation can be valid for at most 90 days."),
});