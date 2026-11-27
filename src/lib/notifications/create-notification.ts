import { createAdminClient } from "@/src/lib/supabase/admin";
import { findNotificationEvent } from "@/src/lib/types/notification-catalog";

// Deliberately NOT a "use server" file: every export of a "use server" file
// becomes a callable endpoint, and this one inserts notifications for ANY
// user. It must only ever be imported by other server code.

export interface CreateNotificationInput {
  recipientId: string;
  type: string;
  title: string;
  description?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actorId?: string | null;
  dedupeKey?: string | null;
}

/*
|------------------------------------------------------------------------------
| The preference gate — Phase 18
|------------------------------------------------------------------------------
|
| Added in Sprint 10. The toggles on the preferences page are only real if
| something consults them before sending, and this is the only place every
| notification in the app passes through, so this is where it goes. Putting
| the check in each of the four helper modules instead would mean four places
| to forget it, and the one that got forgotten would be silently sending.
|
| THREE RULES, IN THIS ORDER
|
| 1. A mandatory event ignores preferences entirely and is never looked up.
|    Sprint 10: "ordinary staff must not be able to disable mandatory security
|    or financial notifications." There is a check constraint in sql/15 that
|    refuses to store such a preference, and this is the belt to its braces —
|    if a row ever existed, by hand or by a constraint that got dropped, it
|    would still not be honoured.
|
| 2. An uncatalogued type sends. A notification type nobody has added to the
|    catalog is a gap in the catalog, not permission to drop the message.
|    Failing open here matters: the alternative is that adding a notification
|    and forgetting the catalog entry produces something that is never sent
|    and never errors.
|
| 3. A failed preference lookup sends. Same reasoning. If the preferences
|    table cannot be read, the choice is between sending something somebody
|    may not want and silently dropping something they may need. The first is
|    recoverable by them; the second is invisible to everyone.
|
| All three fail toward delivery, which is the direction where mistakes are
| visible and complainable rather than silent.
|
|------------------------------------------------------------------------------
*/

async function recipientWantsThis(
  admin: ReturnType<typeof createAdminClient>,
  recipientId: string,
  type: string,
): Promise<boolean> {
  const event = findNotificationEvent(type);

  // Rules 1 and 2.
  if (!event) return true;
  if (event.mandatory) return true;

  const { data, error } = await admin
    .from("notification_preferences")
    .select("enabled")
    .eq("user_id", recipientId)
    .eq("preference_key", event.preferenceKey)
    .maybeSingle();

  if (error) {
    // Rule 3. 42P01 is "table does not exist", i.e. sql/15 has not been run,
    // which is the normal state until she runs it and must not stop
    // notifications working as they did before this change.
    if (error.code !== "42P01") {
      console.error("notification preference lookup failed:", error);
    }
    return true;
  }

  // No row means on. A row exists because somebody switched it off.
  if (!data) return true;
  return data.enabled === true;
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  // Nobody needs a notification about something they just did themselves.
  if (input.actorId && input.recipientId === input.actorId) return;

  try {
    const admin = createAdminClient();

    if (!(await recipientWantsThis(admin, input.recipientId, input.type))) return;

    const { error } = await admin.from("notifications").insert({
      recipient_id: input.recipientId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      actor_id: input.actorId ?? null,
      dedupe_key: input.dedupeKey ?? null,
    });

    // 23505 = the dedupe index caught a duplicate, which is the point of it.
    if (error && error.code !== "23505") {
      console.error("createNotification error:", error);
    }
  } catch (error) {
    // A failed notification must never fail the action that triggered it.
    console.error("createNotification threw:", error);
  }
}

/**
 * Send one notification to everybody holding a permission.
 *
 * Every existing helper sends to one named individual — the assignee, the
 * previous assignee, or the customer's relationship manager. Payment
 * verification cannot work that way: the people who need to know are whoever
 * holds payments.verify, which is a role question, and that is the gap this
 * closes.
 *
 * The recipient list comes from payment_verifier_ids() in sql/15 rather than
 * from a query here, so "can verify a payment" has one definition — the same
 * role_permission_grants the rest of the app authorises against. Sprint 10:
 * "do not send a notification to an unauthorized recipient containing
 * restricted customer or financial information." The permission IS the
 * recipient list, so there is no second rule to get out of step.
 *
 * Each recipient still goes through createNotification, so the self-exclusion,
 * the preference gate and the dedupe all behave exactly as they do elsewhere.
 * The dedupe key is made per recipient, because one key shared across
 * recipients would mean only the first person was ever told.
 */
export async function notifyPaymentVerifiers(input: {
  paymentId: string;
  title: string;
  description?: string | null;
  /** Whoever recorded the payment. Excluded: they are the one who must not verify it. */
  recordedBy: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("payment_verifier_ids", {
      p_exclude: input.recordedBy,
    });

    if (error) {
      console.error("notifyPaymentVerifiers could not resolve recipients:", error);
      return;
    }

    const ids = ((data ?? []) as ({ payment_verifier_ids: string } | string)[])
      .map((row) => (typeof row === "string" ? row : row.payment_verifier_ids))
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    if (ids.length === 0) {
      /*
       * Worth a log line rather than silence. It means no role holds
       * payments.verify, so a payment can be recorded and there is nobody
       * the system can tell — which is a permissions problem rather than a
       * notification problem, and invisible from the payment screen.
       */
      console.warn(
        "notifyPaymentVerifiers: nobody holds payments.verify, so payment",
        input.paymentId,
        "has no verifier to notify.",
      );
      return;
    }

    await Promise.all(
      ids.map((recipientId) =>
        createNotification({
          recipientId,
          type: "payment_verification_required",
          title: input.title,
          description: input.description ?? null,
          entityType: "payment",
          entityId: input.paymentId,
          actorId: input.recordedBy,
          dedupeKey: `payment_verification:${input.paymentId}:${recipientId}`,
        }),
      ),
    );
  } catch (error) {
    console.error("notifyPaymentVerifiers threw:", error);
  }
}
