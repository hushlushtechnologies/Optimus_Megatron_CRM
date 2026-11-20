import { createAdminClient } from "@/src/lib/supabase/admin";
import { createNotification } from "@/src/lib/notifications/create-notification";

// Deliberately NOT a "use server" file. It writes notifications for other
// people, using the admin client, so it must only be reachable from other
// server code — never as an endpoint of its own.

/*
|--------------------------------------------------------------------------
| TELLING PEOPLE ABOUT ENQUIRIES
|--------------------------------------------------------------------------
|
| Six things worth interrupting somebody for:
|
|   received      a new enquiry nobody owns yet
|   assigned      it is now yours
|   reassigned    it is now somebody else's — both of you hear
|   urgent        it came in marked urgent
|   status        something you own moved
|   follow-up due a follow-up you own has come round
|
| Every one of them goes through createNotification, which drops a
| notification somebody would be sending to themselves and never lets a
| failure here break the action that triggered it. An enquiry must save even
| if the notification does not.
|
| What is NOT here: anything about a valuation or a note. Those are quiet by
| design — a colleague writing a note is not an event, and a system that
| pings on every keystroke gets muted, after which the six above stop
| arriving too.
*/

/** How many people a team-wide notification will reach before we stop. */
const TEAM_FANOUT_CAP = 50;

interface EnquiryContext {
  enquiryNumber: string;
  typeLabel: string;
  customerName: string;
  assignedTo: string | null;
}

async function getEnquiryContext(enquiryId: string): Promise<EnquiryContext | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("enquiry_list")
    .select("enquiry_number, type_label, full_name, customer_name, assigned_to")
    .eq("id", enquiryId)
    .maybeSingle();

  if (!data) return null;

  const row = data as unknown as {
    enquiry_number: string;
    type_label: string | null;
    full_name: string | null;
    customer_name: string | null;
    assigned_to: string | null;
  };

  return {
    enquiryNumber: row.enquiry_number,
    typeLabel: row.type_label ?? "Enquiry",
    /* The customer on file if there is one, otherwise the name they gave. */
    customerName: row.customer_name ?? row.full_name ?? "someone",
    assignedTo: row.assigned_to,
  };
}

async function getActorName(actorId: string | null): Promise<string> {
  if (!actorId) return "Someone";

  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("full_name").eq("id", actorId).maybeSingle();

  return (data as { full_name: string | null } | null)?.full_name?.trim() || "Someone";
}

/**
 * Everyone who can work on enquiries.
 *
 * Used for the two notifications that have no particular owner yet. Capped,
 * because a showroom that grows to a hundred staff should not generate a
 * hundred rows per website enquiry — at that size this wants a per-location
 * or per-role rule, and the cap is where that conversation starts rather
 * than a silent performance cliff.
 */
async function staffWhoManageEnquiries(): Promise<string[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("role_permission_grants")
    .select("role_id, profiles!inner(id)")
    .eq("permission", "enquiries.manage")
    .limit(TEAM_FANOUT_CAP);

  if (error) {
    console.error("staffWhoManageEnquiries error:", error);
    return [];
  }

  const ids = new Set<string>();

  for (const row of (data ?? []) as unknown as { profiles: { id: string } | { id: string }[] }[]) {
    const profiles = Array.isArray(row.profiles) ? row.profiles : [row.profiles];
    for (const profile of profiles) if (profile?.id) ids.add(profile.id);
  }

  return [...ids];
}

/* =========================================================
   A NEW ENQUIRY ARRIVED
========================================================= */

/**
 * Nobody owns it yet, so the team hears about it.
 *
 * The dedupe key is the enquiry itself, so a retried submission or a second
 * call cannot produce two of these for one enquiry.
 */
export async function notifyEnquiryReceived(enquiryId: string, actorId: string | null): Promise<void> {
  try {
    const context = await getEnquiryContext(enquiryId);
    if (!context) return;

    /* Already somebody's: they get the assignment notification instead. */
    if (context.assignedTo) return;

    const recipients = await staffWhoManageEnquiries();

    await Promise.all(
      recipients.map((recipientId) =>
        createNotification({
          recipientId,
          type: "enquiry_received",
          title: `New ${context.typeLabel.toLowerCase()} enquiry`,
          description: `${context.enquiryNumber} from ${context.customerName} is waiting to be picked up.`,
          entityType: "enquiry",
          entityId: enquiryId,
          actorId,
          dedupeKey: `enquiry_received:${enquiryId}:${recipientId}`,
        }),
      ),
    );
  } catch (error) {
    console.error("notifyEnquiryReceived error:", error);
  }
}

/**
 * The same, for the public intake route.
 *
 * submit_enquiry() hands back the reference number rather than the id, and
 * the route runs as an anonymous visitor who cannot read the enquiries table
 * at all. So the number is resolved here, where the admin client already
 * lives, instead of widening what that route can see.
 */
export async function notifyEnquiryReceivedByNumber(enquiryNumber: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data } = await admin
      .from("enquiries")
      .select("id, status")
      .eq("enquiry_number", enquiryNumber)
      .maybeSingle();

    if (!data) return;

    const row = data as unknown as { id: string; status: string };

    /*
     * Caught by the honeypot or the timing check. It is on the Spam tab for
     * somebody to look through, which is not the same as worth a ping.
     */
    if (row.status === "Spam") return;

    await notifyEnquiryReceived(row.id, null);
  } catch (error) {
    console.error("notifyEnquiryReceivedByNumber error:", error);
  }
}

/* =========================================================
   URGENT
========================================================= */

/**
 * An enquiry marked urgent.
 *
 * Goes to the person who owns it, or to the team when nobody does — an
 * urgent enquiry sitting unassigned is the case that most needs saying out
 * loud.
 */
export async function notifyEnquiryUrgent(enquiryId: string, actorId: string | null): Promise<void> {
  try {
    const context = await getEnquiryContext(enquiryId);
    if (!context) return;

    const recipients = context.assignedTo ? [context.assignedTo] : await staffWhoManageEnquiries();

    const actorName = await getActorName(actorId);

    await Promise.all(
      recipients.map((recipientId) =>
        createNotification({
          recipientId,
          type: "enquiry_urgent",
          title: "Enquiry marked urgent",
          description: `${context.enquiryNumber} from ${context.customerName} was marked urgent by ${actorName}.`,
          entityType: "enquiry",
          entityId: enquiryId,
          actorId,
          dedupeKey: `enquiry_urgent:${enquiryId}:${recipientId}`,
        }),
      ),
    );
  } catch (error) {
    console.error("notifyEnquiryUrgent error:", error);
  }
}

/* =========================================================
   ASSIGNED AND REASSIGNED
========================================================= */

/**
 * Handed to somebody.
 *
 * On a reassignment the person losing it hears too. Without that, work
 * disappears off somebody's list with no explanation, and they keep
 * following up on an enquiry that is no longer theirs.
 */
export async function notifyEnquiryAssigned(
  enquiryId: string,
  newStaffId: string | null,
  previousStaffId: string | null,
  actorId: string | null,
): Promise<void> {
  try {
    if (newStaffId === previousStaffId) return;

    const [context, actorName] = await Promise.all([getEnquiryContext(enquiryId), getActorName(actorId)]);
    if (!context) return;

    const label = `${context.enquiryNumber} (${context.customerName})`;
    const reassignment = previousStaffId !== null && newStaffId !== null;

    if (newStaffId) {
      await createNotification({
        recipientId: newStaffId,
        type: reassignment ? "enquiry_reassigned" : "enquiry_assigned",
        title: reassignment ? "Enquiry reassigned to you" : "Enquiry assigned to you",
        description: `${label} was ${reassignment ? "reassigned" : "assigned"} to you by ${actorName}.`,
        entityType: "enquiry",
        entityId: enquiryId,
        actorId,
      });
    }

    if (previousStaffId && previousStaffId !== newStaffId) {
      await createNotification({
        recipientId: previousStaffId,
        type: "enquiry_reassigned",
        title: newStaffId ? "Enquiry reassigned away from you" : "Enquiry taken off you",
        description: newStaffId
          ? `${label} was reassigned to another colleague by ${actorName}.`
          : `${label} was unassigned by ${actorName}.`,
        entityType: "enquiry",
        entityId: enquiryId,
        actorId,
      });
    }
  } catch (error) {
    console.error("notifyEnquiryAssigned error:", error);
  }
}

/* =========================================================
   STATUS MOVED
========================================================= */

/**
 * Something you own has moved.
 *
 * Only the owner hears, and only when somebody else moved it. A status
 * change is the ordinary rhythm of the work; sending it to the whole team
 * would be most of the noise in the system.
 */
export async function notifyEnquiryStatusChanged(
  enquiryId: string,
  fromStatus: string,
  toStatus: string,
  actorId: string | null,
): Promise<void> {
  try {
    if (fromStatus === toStatus) return;

    const [context, actorName] = await Promise.all([getEnquiryContext(enquiryId), getActorName(actorId)]);
    if (!context?.assignedTo) return;

    await createNotification({
      recipientId: context.assignedTo,
      type: "enquiry_status_changed",
      title: `Enquiry moved to ${toStatus}`,
      description: `${context.enquiryNumber} (${context.customerName}) went from ${fromStatus} to ${toStatus}, changed by ${actorName}.`,
      entityType: "enquiry",
      entityId: enquiryId,
      actorId,
    });
  } catch (error) {
    console.error("notifyEnquiryStatusChanged error:", error);
  }
}

/* =========================================================
   FOLLOW-UP DUE
========================================================= */

/**
 * A follow-up has come round.
 *
 * This is the one notification nothing in the app calls, because there is no
 * moment in a request to call it from: it is due at a time, not in response
 * to somebody clicking something. It needs a scheduled job — a Supabase
 * cron or an edge function on a timer — to find follow-ups now due and call
 * this for each.
 *
 * Written now and left callable so that job is a few lines rather than a
 * feature, and so the dedupe key is already decided: one notification per
 * follow-up, however many times the job runs.
 */
export async function notifyEnquiryFollowUpDue(followUpId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data } = await admin
      .from("enquiry_follow_ups")
      .select("id, enquiry_id, type, scheduled_at, assigned_to, status")
      .eq("id", followUpId)
      .maybeSingle();

    if (!data) return;

    const followUp = data as unknown as {
      enquiry_id: string;
      type: string;
      scheduled_at: string;
      assigned_to: string | null;
      status: string;
    };

    /* Done, cancelled or nobody's: nothing to chase. */
    if (followUp.status !== "Scheduled" || !followUp.assigned_to) return;

    const context = await getEnquiryContext(followUp.enquiry_id);
    if (!context) return;

    await createNotification({
      recipientId: followUp.assigned_to,
      type: "follow_up_due",
      title: `${followUp.type} due`,
      description: `${context.enquiryNumber} (${context.customerName}) — your ${followUp.type.toLowerCase()} is due.`,
      entityType: "enquiry",
      entityId: followUp.enquiry_id,
      actorId: null,
      dedupeKey: `enquiry_follow_up_due:${followUpId}`,
    });
  } catch (error) {
    console.error("notifyEnquiryFollowUpDue error:", error);
  }
}
