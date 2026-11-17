import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const dateField = z.string().regex(DATE_RE, "Choose a date.");
const timeField = z.string().regex(TIME_RE, "Choose a time.");
/** The record's version when the dialog opened, sent back exactly as it was read. */
const version = z.string().min(10).max(40);

export const prepareDeliverySchema = z.object({ dealId: z.string().uuid() });

export const planDeliverySchema = z
  .object({
    dealId: z.string().uuid(),
    expectedUpdatedAt: version,
    date: dateField,
    time: timeField,
    mode: z.enum(["showroom", "address"], { message: "Choose where the handover will happen." }),
    locationId: z.string().uuid().nullable(),
    address: z.string().max(300, "Keep the address under 300 characters."),
    staffId: z.string().uuid("Choose who will hand the vehicle over."),
    notes: z.string().max(500, "Keep the notes under 500 characters."),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "showroom" && !value.locationId) {
      ctx.addIssue({ code: "custom", path: ["locationId"], message: "Choose the showroom for the handover." });
    }
    if (value.mode === "address" && value.address.trim().length < 5) {
      ctx.addIssue({ code: "custom", path: ["address"], message: "Enter the address the vehicle will be delivered to." });
    }
  });

export const setDeliveryItemSchema = z
  .object({
    itemId: z.string().uuid(),
    action: z.enum(["done", "undo", "waive", "unwaive"]),
    expectedState: z.enum(["pending", "done", "waived"]),
    note: z.string().max(300, "Keep the reason under 300 characters."),
  })
  .superRefine((value, ctx) => {
    if (value.action === "waive" && value.note.trim().length < 3) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Please give a reason (at least 3 characters)." });
    }
  });

export const completeDeliverySchema = z.object({
  dealId: z.string().uuid(),
  expectedUpdatedAt: version,
  date: dateField,
  time: timeField,
  notes: z.string().max(500, "Keep the notes under 500 characters."),
});

export const deliveryTemplateSchema = z.object({
  id: z.string().uuid().nullable(),
  label: z.string().trim().min(3, "Give the check a name.").max(80, "Keep the name under 80 characters."),
  isRequired: z.boolean(),
  isActive: z.boolean(),
});