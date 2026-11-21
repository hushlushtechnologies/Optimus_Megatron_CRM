import { createClient } from "@/src/lib/supabase/server";
import {
  NO_OFFER_PERMISSIONS,
  OFFER_PERMISSION_MESSAGES,
  toOfferPermissions,
  type OfferPermissionName,
  type OfferPermissions,
} from "@/src/lib/utils/offer-permissions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Everything the signed-in person may do with offers and loyalty.
 *
 * A failed lookup answers "nothing". Denying is the safe way to fail here:
 * these permissions gate what customers are charged and how many points
 * they hold.
 */
export async function getMyOfferPermissions(
  supabase: SupabaseServerClient,
): Promise<OfferPermissions> {
  const { data, error } = await supabase.rpc("get_my_permissions");

  if (error) {
    console.error("getMyOfferPermissions error:", error);
    return NO_OFFER_PERMISSIONS;
  }

  return toOfferPermissions(Array.isArray(data) ? (data as string[]) : []);
}

export async function currentUserOfferPermissions(): Promise<OfferPermissions> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NO_OFFER_PERMISSIONS;

  return getMyOfferPermissions(supabase);
}

export type BeginOfferResult =
  | { ok: true; supabase: SupabaseServerClient; userId: string; permissions: OfferPermissions }
  | { ok: false; error: string };

/**
 * Every changing offer action starts here: signed in, and holding the
 * permission for what it is about to do.
 *
 * Row-level security checks the same key again, so this is an early, legible
 * refusal rather than the only thing standing between a request and the
 * data.
 */
export async function beginOfferAction(
  permission: OfferPermissionName,
): Promise<BeginOfferResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Please sign in again." };

  const permissions = await getMyOfferPermissions(supabase);

  if (!permissions[permission]) {
    return { ok: false, error: OFFER_PERMISSION_MESSAGES[permission] };
  }

  return { ok: true, supabase, userId: user.id, permissions };
}

/** For a route handler, which answers with a status code rather than a toast. */
export async function requireOfferPermission(
  permission: OfferPermissionName,
): Promise<{ allowed: true; supabase: SupabaseServerClient; userId: string } | { allowed: false; error: string }> {
  const start = await beginOfferAction(permission);

  if (!start.ok) return { allowed: false, error: start.error };

  return { allowed: true, supabase: start.supabase, userId: start.userId };
}
