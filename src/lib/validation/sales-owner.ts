import { z } from "zod";

export const reassignDealSchema = z.object({
  id: z.string().uuid(),
  /** The deal's version when the dialog opened, sent back exactly as it was read. */
  expectedUpdatedAt: z.string().min(10).max(40),
  newOwnerId: z.string().uuid("Choose who should own this deal."),
  reason: z.string().max(300, "Keep the reason under 300 characters."),
});
