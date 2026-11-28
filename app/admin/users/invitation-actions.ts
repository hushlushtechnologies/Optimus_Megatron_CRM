"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { recordStaffAuditEvent } from "@/src/lib/supabase/staff-audit";
import { currentStaffAccess } from "@/src/lib/supabase/staff-permissions";
import { mailProviderState, sendInvitationEmail } from "@/src/lib/mail/provider";
import { inviteStaffSchema } from "@/src/lib/validation/staff";
import { invitationLink, issueInvitationToken } from "@/src/lib/utils/staff-invitation-token";

/*
|------------------------------------------------------------------------------
| Staff invitations
|------------------------------------------------------------------------------
|
| NO ADMINISTRATOR EVER SETS A PASSWORD
|
| An invitation creates an auth user with no password at all. The person being
| invited chooses their own when they accept. So there is no temporary password
| to read down the phone, none to reuse across new joiners, none sitting in an
| email, and nothing for an administrator to see — "never show existing
| employee passwords" is satisfied by there being nothing to show.
|
| THE LINK IS SHOWN ONCE AND THEN IT IS GONE
|
| Only the token's SHA-256 digest is stored. The action returns the link to the
| administrator who created it and that is the only time it exists outside the
| invitee's hands. There is deliberately no way to retrieve it later: resending
| issues a new token and kills the old one, which is what a resend should do.
|
| AN EXISTING ACCOUNT IS NEVER QUIETLY PROMOTED
|
| If the email address already has an auth user — most likely a marketplace
| customer who bought a car — this refuses. It does not attach a staff role to
| that account, and it does not create a second account on the same address.
|
| That is the "do not mix internal staff accounts with customer accounts" rule
| in the sprint brief, and it is the one place where this code could have
| violated it silently: createUser() on an existing email returns the existing
| user on some Supabase versions, which would have turned a customer into an
| Admin with no warning anywhere. So the check happens first, explicitly, and
| the refusal names what it found.
|
| ORDER AND CLEANUP
|
| auth user, then profile, then invitation. If a later step fails the auth user
| is deleted again, because a half-created account that cannot sign in and has
| no profile is worse than no account: it occupies the email address and the
| next attempt would hit the "already exists" refusal above.
|
|------------------------------------------------------------------------------
*/

export interface InviteStaffResult {
  error: string | null;
  fieldErrors?: Record<string, string>;
  /** Present only on success, only here, and only once. */
  invitation?: {
    id: string;
    email: string;
    fullName: string;
    link: string;
    expiresAt: string;
    deliveryState: "unsent" | "sent" | "failed" | "not_configured";
    deliveryError: string | null;
  };
}

function refresh() {
  revalidatePath("/admin/users");
}

/** Where invitation links point. Explicit configuration beats guessing. */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured;

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  return host ? `${proto}://${host}` : "";
}

export async function inviteStaff(formData: FormData): Promise<InviteStaffResult> {
  const access = await currentStaffAccess();

  if (!access.permissions.canInvite) {
    return { error: "You don't have permission to invite staff." };
  }

  const parsed = inviteStaffSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    roleId: formData.get("roleId"),
    phone: formData.get("phone"),
    department: formData.get("department"),
    jobTitle: formData.get("jobTitle"),
    showroomId: formData.get("showroomId"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Check the highlighted fields.", fieldErrors };
  }

  const input = parsed.data;
  const admin = createAdminClient();

  /* ----------------------------------------------------------------
     May this person hand out this role at all?

     staff_assign_role() enforces this in the database for an existing
     member of staff, but an invitation creates the profile with its role
     already attached, so there is no UPDATE for that function to guard.
     Without the check below, an Admin could invite a new Super Admin and
     escalate through the invite form — the one door the database cannot
     close on its own.
  ---------------------------------------------------------------- */

  const { data: roleRow, error: roleError } = await admin
    .from("roles")
    .select("id, name, rank, protected")
    .eq("id", input.roleId)
    .maybeSingle();

  if (roleError || !roleRow) {
    return { error: "That role no longer exists. Reload the page and try again." };
  }

  const role = roleRow as { id: string; name: string; rank: number | null; protected: boolean | null };
  const targetRank = role.rank ?? 90;

  if (!access.permissions.isProtected) {
    if (access.permissions.myRank === null || targetRank <= access.permissions.myRank) {
      return {
        error: `You can't invite someone as ${role.name} — that is at or above your own authority.`,
        fieldErrors: { roleId: "Choose a role below your own." },
      };
    }
  }

  /* ----------------------------------------------------------------
     Is this email already somebody's account?
  ---------------------------------------------------------------- */

  const existing = await findAuthUserByEmail(admin, input.email);

  if (existing.failed) {
    return { error: "Couldn't check whether that email address is already in use. Nothing was created." };
  }

  if (existing.userId) {
    const { data: profileRow } = await admin
      .from("profiles")
      .select("id, status, roles(name)")
      .eq("id", existing.userId)
      .maybeSingle();

    if (profileRow) {
      const status = (profileRow as { status: string | null }).status ?? "unknown";
      return {
        error: `${input.email} already has a staff account (${status}). Open it from the staff list instead of inviting again.`,
        fieldErrors: { email: "Already a member of staff." },
      };
    }

    return {
      error:
        `${input.email} already has an account on the marketplace, so it can't be turned into a staff ` +
        `account from here. Invite them on a work address, or move that customer account deliberately — ` +
        `not as a side effect of an invitation.`,
      fieldErrors: { email: "Already a customer account." },
    };
  }

  /* ----------------------------------------------------------------
     Create: auth user, profile, invitation
  ---------------------------------------------------------------- */

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    // No password. The invitee sets their own when they accept.
    email_confirm: true,
    user_metadata: { full_name: input.fullName, invited_as_staff: true },
  });

  if (createError || !created?.user) {
    return { error: `Couldn't create the account: ${createError?.message ?? "unknown error"}` };
  }

  const userId = created.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    full_name: input.fullName,
    role_id: input.roleId,
    status: "invited",
    phone: input.phone ?? null,
    department: input.department ?? null,
    job_title: input.jobTitle ?? null,
    showroom_id: input.showroomId ?? null,
    invited_at: new Date().toISOString(),
    created_by: access.permissions.selfId,
    updated_by: access.permissions.selfId,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    return { error: `Couldn't create the staff record: ${profileError.message}. Nothing was left behind.` };
  }

  const issued = issueInvitationToken();

  const { data: invitationRow, error: invitationError } = await admin
    .from("staff_invitations")
    .insert({
      email: input.email,
      full_name: input.fullName,
      role_id: input.roleId,
      phone: input.phone ?? null,
      department: input.department ?? null,
      job_title: input.jobTitle ?? null,
      showroom_id: input.showroomId ?? null,
      status: "pending",
      token_hash: issued.tokenHash,
      expires_at: issued.expiresAt.toISOString(),
      invited_by: access.permissions.selfId,
      delivery_state: "unsent",
    })
    .select("id")
    .single();

  if (invitationError || !invitationRow) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    return { error: `Couldn't create the invitation: ${invitationError?.message ?? "unknown error"}` };
  }

  const invitationId = (invitationRow as { id: string }).id;
  const link = invitationLink(await siteOrigin(), issued.token);

  /* ----------------------------------------------------------------
     Delivery, reported as it actually went
  ---------------------------------------------------------------- */

  const delivery = await sendInvitationEmail({ to: input.email, fullName: input.fullName, link });

  await admin
    .from("staff_invitations")
    .update({
      delivery_state: delivery.state,
      delivery_error: delivery.error,
      delivery_at: delivery.state === "sent" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitationId);

  await recordStaffAuditEvent({
    eventType: "staff_invited",
    profileId: userId,
    actorId: access.permissions.selfId,
    summary: `Invited ${input.fullName} (${input.email}) as ${role.name}`,
    detail: {
      invitation_id: invitationId,
      role: role.name,
      department: input.department ?? null,
      delivery_state: delivery.state,
      mail_provider: mailProviderState(),
    },
  });

  refresh();

  return {
    error: null,
    invitation: {
      id: invitationId,
      email: input.email,
      fullName: input.fullName,
      link,
      expiresAt: issued.expiresAt.toISOString(),
      deliveryState: delivery.state,
      deliveryError: delivery.error,
    },
  };
}

/* ==========================================================================
   RESEND AND REVOKE
========================================================================== */

export async function resendInvitation(invitationId: string): Promise<InviteStaffResult> {
  const access = await currentStaffAccess();

  if (!access.permissions.canInvite) {
    return { error: "You don't have permission to invite staff." };
  }

  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from("staff_invitations")
    .select("id, email, full_name, status, roles(name)")
    .eq("id", invitationId)
    .maybeSingle();

  if (error || !row) return { error: "That invitation no longer exists." };

  const invitation = row as { id: string; email: string; full_name: string; status: string };

  if (invitation.status !== "pending") {
    return { error: `That invitation is ${invitation.status}, so it can't be resent. Invite them again instead.` };
  }

  // A new token, which retires the old one. An invitation link that has been
  // sitting in somebody's inbox for a week is exactly the one worth retiring.
  const issued = issueInvitationToken();

  const { error: updateError } = await admin
    .from("staff_invitations")
    .update({
      token_hash: issued.tokenHash,
      expires_at: issued.expiresAt.toISOString(),
      delivery_state: "unsent",
      delivery_error: null,
      delivery_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitationId)
    .eq("status", "pending");

  if (updateError) return { error: `Couldn't reissue the invitation: ${updateError.message}` };

  const link = invitationLink(await siteOrigin(), issued.token);
  const delivery = await sendInvitationEmail({ to: invitation.email, fullName: invitation.full_name, link });

  await admin
    .from("staff_invitations")
    .update({
      delivery_state: delivery.state,
      delivery_error: delivery.error,
      delivery_at: delivery.state === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", invitationId);

  await recordStaffAuditEvent({
    eventType: "staff_invitation_resent",
    actorId: access.permissions.selfId,
    summary: `Reissued the invitation for ${invitation.email}`,
    detail: { invitation_id: invitationId, delivery_state: delivery.state },
  });

  refresh();

  return {
    error: null,
    invitation: {
      id: invitationId,
      email: invitation.email,
      fullName: invitation.full_name,
      link,
      expiresAt: issued.expiresAt.toISOString(),
      deliveryState: delivery.state,
      deliveryError: delivery.error,
    },
  };
}

export async function revokeInvitation(invitationId: string): Promise<{ error: string | null }> {
  const access = await currentStaffAccess();

  if (!access.permissions.canInvite) {
    return { error: "You don't have permission to change invitations." };
  }

  const admin = createAdminClient();

  const { data: row } = await admin
    .from("staff_invitations")
    .select("id, email, status, accepted_by")
    .eq("id", invitationId)
    .maybeSingle();

  if (!row) return { error: "That invitation no longer exists." };

  const invitation = row as { id: string; email: string; status: string };

  if (invitation.status !== "pending") {
    return { error: `That invitation is already ${invitation.status}.` };
  }

  const { error } = await admin
    .from("staff_invitations")
    .update({
      status: "revoked",
      revoked_by: access.permissions.selfId,
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // The digest goes too. A revoked invitation should not be acceptable even
      // if somebody still holds the link, and the simplest way to guarantee
      // that is for there to be nothing left to match against.
      token_hash: "revoked",
    })
    .eq("id", invitationId)
    .eq("status", "pending");

  if (error) return { error: `Couldn't revoke the invitation: ${error.message}` };

  /*
  | The account created by the invitation is deliberately NOT deleted.
  |
  | It has no password, so it cannot sign in, and its profile is still
  | 'invited', so is_active_staff() answers false and nothing in the admin area
  | will open for it. Deleting it would take the audit trail of the invitation
  | with it. Revoking the way in is enough; destroying the record is not
  | required and is not reversible.
  |
  | Deactivating the profile is the deliberate next step, from the staff list.
  */

  await recordStaffAuditEvent({
    eventType: "staff_invitation_revoked",
    actorId: access.permissions.selfId,
    summary: `Revoked the invitation for ${invitation.email}`,
    detail: { invitation_id: invitationId },
  });

  refresh();
  return { error: null };
}

/* ==========================================================================
   LOOKUP
========================================================================== */

/**
 * Find an auth user by email, paging through listUsers.
 *
 * Returns `failed` separately from "not found", because the two must lead to
 * different outcomes: not found means go ahead and create, whereas a failed
 * lookup must stop the whole thing. Treating a failed lookup as "not found"
 * is how a customer account gets a staff role attached to it.
 */
async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<{ userId: string | null; failed: boolean }> {
  const wanted = email.toLowerCase();

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });

    if (error) {
      console.error("findAuthUserByEmail failed:", error.message);
      return { userId: null, failed: true };
    }

    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === wanted);
    if (match) return { userId: match.id, failed: false };

    if (users.length < 200) return { userId: null, failed: false };
  }

  // Ran out of pages without reaching the end of the list. Not found is not a
  // safe conclusion here, so say the lookup failed.
  console.error("findAuthUserByEmail: more than 10,000 users, lookup incomplete");
  return { userId: null, failed: true };
}
