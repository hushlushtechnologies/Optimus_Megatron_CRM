"use server";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { recordStaffAuditEvent } from "@/src/lib/supabase/staff-audit";
import { findInvitationByToken } from "@/src/lib/supabase/staff-invitation-queries";
import { acceptInvitationSchema } from "@/src/lib/validation/staff";

/*
|------------------------------------------------------------------------------
| Accepting an invitation
|------------------------------------------------------------------------------
|
| This is the only action in the application that runs for somebody who is not
| signed in, so it is worth being explicit about what authorises it: the token.
| Nothing else. There is no session, no profile to check a permission against,
| and no caller identity to trust.
|
| WHAT IT WILL NOT DO
|
| It will not create an account. It will not assign a role. It will not change
| anybody's email address. Everything about who this person is and what they
| may do was decided by the administrator who sent the invitation, and recorded
| then. All this action does is attach a password to an account that already
| exists and move its status from 'invited' to 'active'.
|
| That matters because the token is the only credential involved. If accepting
| an invitation could choose a role, a leaked link would be a privilege
| escalation. As it stands, the worst a leaked link can do is let the wrong
| person take over an account that was already going to exist with exactly
| those permissions — bad, but bounded, and recoverable by suspending it.
|
| THE PASSWORD
|
| Chosen here by the invitee, validated server-side against the policy in
| assessPassword(), and handed straight to Supabase Auth. It is not stored by
| this application, not hashed by this application, and not logged anywhere.
| The variable holding it goes out of scope and that is the end of it.
|
| RE-VERIFICATION
|
| The invitation is looked up again inside this action rather than trusted from
| the page that rendered the form. The page's check happened when the page was
| rendered, which could have been an hour ago — long enough for the invitation
| to have been revoked, which is exactly the case a revoke needs to win.
|
|------------------------------------------------------------------------------
*/

export interface AcceptInvitationResult {
  error: string | null;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
}

export async function acceptInvitation(formData: FormData): Promise<AcceptInvitationResult> {
  const token = String(formData.get("token") ?? "");

  // Looked up before validation so the policy messages can mention the
  // invitee's own name and email — assessPassword() refuses a password
  // containing either, and it can only do that if it knows them.
  const lookup = await findInvitationByToken(token);

  if (lookup.state !== "valid" || !lookup.invitation) {
    return { error: messageForState(lookup.state) };
  }

  const parsed = acceptInvitationSchema.safeParse({
    token,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    email: lookup.invitation.email,
    fullName: lookup.invitation.fullName,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      // Keep the first problem per field: a list of six rules under one box
      // reads as a telling-off rather than as help.
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Check the highlighted fields.", fieldErrors };
  }

  const admin = createAdminClient();

  /* ----------------------------------------------------------------
     Which account does this invitation belong to?

     By email, because the invitation holds the email and the profile is
     keyed on the auth user id. If the account has gone, say so rather
     than creating one: an invitation is not authorisation to create an
     account, only to finish setting one up.
  ---------------------------------------------------------------- */

  const userId = await findUserIdByEmail(admin, lookup.invitation.email);

  if (!userId) {
    return {
      error:
        "This invitation points at an account that no longer exists. Ask whoever invited you to send a new one.",
    };
  }

  const { data: profileRow } = await admin.from("profiles").select("id, status").eq("id", userId).maybeSingle();

  const profileStatus = (profileRow as { status: string | null } | null)?.status ?? null;

  if (!profileRow) {
    return { error: "This invitation is no longer attached to a staff record. Ask for a new one." };
  }

  if (profileStatus === "suspended" || profileStatus === "deactivated") {
    // Do not reactivate. Somebody took this access away deliberately after the
    // invitation went out, and accepting an old link must not undo that.
    return { error: "This account isn't active. Speak to whoever invited you." };
  }

  if (profileStatus !== "invited") {
    return { error: "This invitation has already been used." };
  }

  /* ----------------------------------------------------------------
     Set the password
  ---------------------------------------------------------------- */

  const { error: passwordError } = await admin.auth.admin.updateUserById(userId, {
    password: parsed.data.password,
    email_confirm: true,
  });

  if (passwordError) {
    // The provider's message can be shown here: it is about the password's
    // shape, not about the account, and the person needs to know what to fix.
    return { error: `Couldn't set your password: ${passwordError.message}`, fieldErrors: { password: passwordError.message } };
  }

  /* ----------------------------------------------------------------
     Activate, and close the invitation

     Status first. If marking the invitation accepted failed after the
     profile was activated, the person can sign in and an administrator
     sees a stale pending invitation — awkward but harmless. The other
     order gives a used invitation and an account that cannot sign in,
     with no way to retry, because the token has already been consumed.
  ---------------------------------------------------------------- */

  const { error: activateError } = await admin
    .from("profiles")
    .update({
      status: "active",
      status_reason: "Invitation accepted",
      updated_by: userId,
    })
    .eq("id", userId)
    .eq("status", "invited");

  if (activateError) {
    return {
      error: `Your password was set, but the account couldn't be activated: ${activateError.message}. Ask whoever invited you to activate it.`,
    };
  }

  const { error: closeError } = await admin
    .from("staff_invitations")
    .update({
      status: "accepted",
      accepted_by: userId,
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // The digest is retired so the link cannot be replayed.
      token_hash: "accepted",
    })
    .eq("id", lookup.invitation.id)
    .eq("status", "pending");

  if (closeError) {
    console.error("acceptInvitation: could not close the invitation:", closeError.message);
  }

  await recordStaffAuditEvent({
    eventType: "staff_invitation_accepted",
    profileId: userId,
    actorId: userId,
    summary: `${lookup.invitation.fullName} accepted their invitation and set a password`,
    detail: { invitation_id: lookup.invitation.id, role: lookup.invitation.roleName },
  });

  return { error: null, ok: true };
}

function messageForState(state: string): string {
  switch (state) {
    case "expired":
      return "This invitation has expired. Ask whoever invited you to send a new one.";
    case "revoked":
      return "This invitation was withdrawn. Speak to whoever invited you.";
    case "accepted":
      return "This invitation has already been used. Try signing in instead.";
    default:
      return "This invitation link isn't valid. Check you copied all of it, or ask for a new one.";
  }
}

async function findUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const wanted = email.toLowerCase();

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("findUserIdByEmail failed:", error.message);
      return null;
    }

    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === wanted);
    if (match) return match.id;

    if (users.length < 200) return null;
  }

  return null;
}
