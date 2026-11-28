import { z } from "zod";

/*
| Validation for role management.
|
| rank is coerced from a string because it arrives from a <select> in FormData,
| and bounded because it is the number every authority comparison uses. Rank 0
| is reserved for the protected role, so nothing here may claim it: sql/19
| refuses it too, but a form that offers it is a form that invites the error.
*/

export const roleFormSchema = z.object({
  roleId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined)),
  name: z
    .string()
    .trim()
    .min(2, "Give the role a name of at least two characters.")
    .max(60, "Keep the name under 60 characters."),
  rank: z.coerce
    .number()
    .int("Choose an authority level.")
    .min(1, "Rank 0 is reserved for the protected role.")
    .max(99, "Choose an authority level."),
  description: z
    .string()
    .trim()
    .max(240)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined)),
});

export const roleActiveSchema = z.object({
  roleId: z.string().uuid(),
  active: z.union([z.literal("true"), z.literal("false"), z.boolean()]).transform((value) => value === true || value === "true"),
});

export const roleGrantSchema = z.object({
  roleId: z.string().uuid(),
  permission: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z_]+\.[a-z_]+$/, "That isn't a permission key."),
  granted: z.union([z.literal("true"), z.literal("false"), z.boolean()]).transform((value) => value === true || value === "true"),
});
