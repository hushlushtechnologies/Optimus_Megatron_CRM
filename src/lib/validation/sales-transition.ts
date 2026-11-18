import { z } from "zod";

export const transitionDealSchema = z.object({
  id: z.string().uuid(),
  to: z.enum(["Negotiation", "Reserved", "Confirmed", "Cancelled"]),
  /** The deal's version when the person opened the dialog. Sent back exactly as it was read. */
  expectedUpdatedAt: z.string().min(10).max(40),
  reasonId: z.string().uuid().nullable(),
  reason: z.string().max(500, "Keep the reason under 500 characters."),
  refundNote: z.string().max(500, "Keep the note under 500 characters."),
});

export type TransitionDealValues = z.infer<typeof transitionDealSchema>;
