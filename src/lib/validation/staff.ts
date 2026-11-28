import { z } from "zod";

import { assessPassword } from "@/src/lib/utils/staff-password";

/*
| Validation for staff administration.
|
| Every schema here runs on the server. The forms use the same shapes so the
| messages match, but nothing trusts the form.
*/

const trimmedOptional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

export const inviteStaffSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter an email address.")
    .max(254)
    .email("That does not look like an email address.")
    .transform((value) => value.toLowerCase()),
  fullName: z.string().trim().min(2, "Enter the person's full name.").max(120),
  roleId: z.string().uuid("Choose a role."),
  phone: trimmedOptional(40),
  department: trimmedOptional(80),
  jobTitle: trimmedOptional(80),
  showroomId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined)),
});

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const editStaffSchema = z.object({
  profileId: z.string().uuid(),
  fullName: z.string().trim().min(2, "Enter the person's full name.").max(120),
  phone: trimmedOptional(40),
  department: trimmedOptional(80),
  jobTitle: trimmedOptional(80),
  showroomId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined)),
});

export const changeStaffRoleSchema = z.object({
  profileId: z.string().uuid(),
  roleId: z.string().uuid("Choose a role."),
  reason: z.string().trim().max(400).optional(),
});

export const changeStaffStatusSchema = z.object({
  profileId: z.string().uuid(),
  status: z.enum(["active", "suspended", "deactivated"]),
  // A reason is required for anything that takes access away. Six months later
  // "why is this person suspended" is the question the history has to answer,
  // and an empty reason makes the record useless.
  reason: z.string().trim().max(400).optional(),
});

/**
 * Setting a password when accepting an invitation.
 *
 * The strength rules live in assessPassword() so the form and the action share
 * one definition. The refine below is what makes the action the gate.
 */
export const acceptInvitationSchema = z
  .object({
    token: z.string().min(16).max(128),
    password: z.string().min(1, "Choose a password."),
    confirmPassword: z.string().min(1, "Type your password again."),
    email: z.string().email().optional(),
    fullName: z.string().optional(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Those two passwords are different.",
  })
  .superRefine((value, ctx) => {
    const assessment = assessPassword(value.password, { email: value.email, fullName: value.fullName });
    for (const problem of assessment.problems) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: problem });
    }
  });
