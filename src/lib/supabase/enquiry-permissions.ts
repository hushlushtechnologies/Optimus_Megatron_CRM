import { createClient } from "@/src/lib/supabase/server";
import {
  ENQUIRY_PERMISSION_MESSAGES,
  NO_ENQUIRY_PERMISSIONS,
  toEnquiryPermissions,
  type EnquiryPermissionName,
  type EnquiryPermissions,
} from "@/src/lib/utils/enquiry-permissions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Everything the signed-in person may do with enquiries, from one call.
 *
 * If the lookup fails the answer is "nothing". Denying is the safe way to
 * fail: an enquiry holds a member of the public's contact details.
 */
export async function getMyEnquiryPermissions(supabase: SupabaseServerClient): Promise<EnquiryPermissions> {
  const { data, error } = await supabase.rpc("get_my_permissions");

  if (error) {
    console.error("getMyEnquiryPermissions error:", error);
    return NO_ENQUIRY_PERMISSIONS;
  }

  return toEnquiryPermissions(Array.isArray(data) ? (data as string[]) : []);
}

export async function currentUserEnquiryPermissions(): Promise<EnquiryPermissions> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NO_ENQUIRY_PERMISSIONS;

  return getMyEnquiryPermissions(supabase);
}

export type BeginEnquiryResult =
  | { ok: true; supabase: SupabaseServerClient; userId: string; permissions: EnquiryPermissions }
  | { ok: false; error: string };

/**
 * Every changing enquiry action starts here: signed in, and holding the
 * permission for what it does.
 *
 * The database checks the same permission again through row-level security,
 * so this is a friendly early refusal rather than the only guard.
 */
export async function beginEnquiryAction(permission: EnquiryPermissionName): Promise<BeginEnquiryResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "You must be signed in to do this." };

  const permissions = await getMyEnquiryPermissions(supabase);

  if (!permissions[permission]) {
    return { ok: false, error: ENQUIRY_PERMISSION_MESSAGES[permission] };
  }

  return { ok: true, supabase, userId: user.id, permissions };
}

/** For reads and routes that don't go through beginEnquiryAction. */
export async function requireEnquiryPermission(
  name: EnquiryPermissionName,
): Promise<{ allowed: boolean; error: string | null }> {
  const permissions = await currentUserEnquiryPermissions();

  if (permissions[name]) return { allowed: true, error: null };

  return { allowed: false, error: ENQUIRY_PERMISSION_MESSAGES[name] };
}
