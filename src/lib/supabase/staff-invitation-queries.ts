import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { hashInvitationToken, isInvitationExpired } from "@/src/lib/utils/staff-invitation-token";

/*
| Reading invitations.
|
| The pending list is read under RLS with the ordinary client, so only an
| administrator sees it. Looking one up by token is different: the person
| following an invitation link is not signed in to anything, so that path uses
| the service-role client and the token IS the authorisation.
|
| Which is why the token lookup returns the narrowest possible shape. It gives
| back the name, email and role label needed to render a welcome page, and
| nothing else — no ids that would let a holder of one token address another
| invitation, and never the digest it matched.
*/

export type InvitationLookupState = "valid" | "not_found" | "expired" | "revoked" | "accepted";

export interface InvitationLookup {
  state: InvitationLookupState;
  invitation: {
    id: string;
    email: string;
    fullName: string;
    roleName: string | null;
    expiresAt: string;
  } | null;
}

export async function findInvitationByToken(token: string): Promise<InvitationLookup> {
  // A token that could not possibly be one of ours is refused without a query.
  if (typeof token !== "string" || token.length < 16 || token.length > 128) {
    return { state: "not_found", invitation: null };
  }

  const admin = createAdminClient();
  const digest = hashInvitationToken(token);

  const { data, error } = await admin
    .from("staff_invitations")
    .select("id, email, full_name, status, expires_at, roles(name)")
    .eq("token_hash", digest)
    .maybeSingle();

  if (error) {
    console.error("findInvitationByToken failed:", error.message);
    return { state: "not_found", invitation: null };
  }

  if (!data) return { state: "not_found", invitation: null };

  const row = data as unknown as {
    id: string;
    email: string;
    full_name: string;
    status: string;
    expires_at: string;
    roles: { name: string } | null;
  };

  const invitation = {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    roleName: row.roles?.name ?? null,
    expiresAt: row.expires_at,
  };

  if (row.status === "accepted") return { state: "accepted", invitation };
  if (row.status === "revoked") return { state: "revoked", invitation };
  if (row.status !== "pending") return { state: "not_found", invitation: null };

  if (isInvitationExpired(row.expires_at)) return { state: "expired", invitation };

  return { state: "valid", invitation };
}

export interface PendingInvitation {
  id: string;
  email: string;
  fullName: string;
  roleName: string | null;
  department: string | null;
  status: string;
  deliveryState: string;
  deliveryError: string | null;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
}

export async function getPendingInvitations(): Promise<{ invitations: PendingInvitation[]; readFailed: boolean }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("staff_invitations")
    .select(
      "id, email, full_name, department, status, delivery_state, delivery_error, expires_at, created_at, roles(name)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getPendingInvitations failed:", error.message);
    return { invitations: [], readFailed: true };
  }

  const invitations = (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      email: string;
      full_name: string;
      department: string | null;
      status: string;
      delivery_state: string;
      delivery_error: string | null;
      expires_at: string;
      created_at: string;
      roles: { name: string } | null;
    };

    return {
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      roleName: r.roles?.name ?? null,
      department: r.department,
      status: r.status,
      deliveryState: r.delivery_state,
      deliveryError: r.delivery_error,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      expired: isInvitationExpired(r.expires_at),
    };
  });

  return { invitations, readFailed: false };
}
