import { z } from "zod";

export const createReservationSchema = z
  .object({
    customerId: z.string().uuid("Choose a customer."),
    carId: z.string().uuid("Choose a vehicle."),
    locationId: z.string().uuid("Choose a showroom."),
    leadId: z.string().uuid().nullable(),
    ownerId: z.string().uuid().nullable(),
    source: z.enum(["staff", "phone", "walk_in"], { message: "Choose how the request came in." }),
    mode: z.enum(["request", "confirm"]),
    days: z
      .number({ message: "Enter how many days to hold the vehicle." })
      .int("Enter a whole number of days.")
      .min(1, "Hold the vehicle for at least 1 day.")
      .max(365, "That is too long.")
      .nullable(),
    notes: z.string().max(2000, "Keep the notes under 2,000 characters."),
        waiveReason: z.string().max(500, "Keep the reason under 500 characters."),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "confirm" && value.days === null) {
      ctx.addIssue({ code: "custom", path: ["days"], message: "Enter how many days to hold the vehicle." });
    }
  });

export type CreateReservationValues = z.infer<typeof createReservationSchema>;

export const transitionReservationSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(["confirm", "reject", "cancel", "release", "extend"]),
    /** The reservation's version when the person opened the dialog, sent back exactly as it was read. */
    expectedUpdatedAt: z.string().min(10).max(40),
    reason: z.string().max(500, "Keep the reason under 500 characters."),
    days: z.number().int().min(1, "Enter at least 1 day.").max(365, "That is too long.").nullable(),
  })
  .superRefine((value, ctx) => {
    if (["reject", "cancel", "release"].includes(value.action) && value.reason.trim().length < 3) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Please give a reason (at least 3 characters)." });
    }
    if (["confirm", "extend"].includes(value.action) && value.days === null) {
      ctx.addIssue({ code: "custom", path: ["days"], message: "Enter the number of days." });
    }
  });

export const convertReservationSchema = z.object({
  id: z.string().uuid(),
  expectedUpdatedAt: z.string().min(10).max(40),
});