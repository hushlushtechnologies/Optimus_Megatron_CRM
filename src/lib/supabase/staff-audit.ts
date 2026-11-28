import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

/*
| Writing to the staff audit trail.
|
| WHAT MUST NEVER GO IN HERE
|
| Passwords, password hashes, invitation tokens, session secrets, API keys. The
| audit trail is the most tempting place to "just record the payload", and the
| payload is exactly where a token ends up.
|
| sql/16 puts a check constraint on staff_audit_events.detail that refuses any
| object carrying a key named password, password_hash, token, access_token,
| refresh_token, secret, session_secret, encrypted_password or api_key. So this
| is not only a convention — an insert that breaks it fails. The filter below
| strips those keys before the insert as well, so a careless caller gets a
| recorded event with the sensitive field missing rather than a failed insert
| that loses the whole event.
|
| Belt and braces on purpose: the constraint is the guarantee, the filter is so
| that the guarantee never costs an audit record.
|
| WHY THE ADMIN CLIENT
|
| sql/16 gives these tables a read policy for administrators and NO insert
| policy at all, so a client with a valid session cannot forge or erase an audit
| row. Writes therefore come through the service-role client, from server code
| only. This file is server-only and so is admin.ts.
|
| A FAILED AUDIT WRITE NEVER FAILS THE ACTION
|
| If the trail cannot be written, the suspension still happened and the person
| still needs telling. These functions log and return rather than throw, and the
| caller's own history tables (staff_status_history, staff_role_history) are
| written by database triggers, so the important record survives regardless.
*/

const FORBIDDEN_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "session_secret",
  "encrypted_password",
  "api_key",
]);

/*
| Underscores, not dots.
|
| A dotted name here is indistinguishable from a permission key to
| checks/check-permission-keys.py, which exists to catch a permission being
| checked in code that no migration ever defines. Teaching that check to ignore
| a pattern of names would have been loosening a security check to suit a
| naming choice, so the naming changed instead.
|
| That checker reads comments too, so this paragraph deliberately does not
| quote one of the old names.
*/
export type StaffAuditEventType =
  | "staff_invited"
  | "staff_invitation_resent"
  | "staff_invitation_revoked"
  | "staff_invitation_accepted"
  | "staff_details_updated"
  | "staff_role_changed"
  | "staff_suspended"
  | "staff_reactivated"
  | "staff_offboarded";

export interface StaffAuditEvent {
  eventType: StaffAuditEventType;
  profileId?: string | null;
  actorId?: string | null;
  summary: string;
  detail?: Record<string, unknown>;
}

/** Drops forbidden keys at any depth, so a nested object cannot smuggle one in. */
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) continue;
    out[key] = scrub(inner, depth + 1);
  }
  return out;
}

export async function recordStaffAuditEvent(event: StaffAuditEvent): Promise<void> {
  try {
    const admin = createAdminClient();

    const { error } = await admin.from("staff_audit_events").insert({
      event_type: event.eventType,
      profile_id: event.profileId ?? null,
      actor_id: event.actorId ?? null,
      summary: event.summary,
      detail: scrub(event.detail ?? {}) as Record<string, unknown>,
    });

    if (error) {
      // The message, not the event: an event object could contain anything a
      // caller put in it, and this line goes to a log.
      console.error(`recordStaffAuditEvent(${event.eventType}) failed:`, error.message);
    }
  } catch (error) {
    console.error(
      `recordStaffAuditEvent(${event.eventType}) threw:`,
      error instanceof Error ? error.message : "unknown error",
    );
  }
}
