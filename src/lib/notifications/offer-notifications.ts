import { createAdminClient } from "@/src/lib/supabase/admin";
import { createNotification } from "@/src/lib/notifications/create-notification";

// Deliberately NOT a "use server" file. It writes notifications for other
// people, using the admin client, so it must only be reachable from other
// server code — never as an endpoint of its own.

/*
|--------------------------------------------------------------------------
| TELLING PEOPLE ABOUT OFFERS AND POINTS
|--------------------------------------------------------------------------
|
| Eight things worth interrupting somebody for:
|
|   offer_assigned      an exclusive offer put on a customer's account
|   offer_expiring      a live campaign about to end
|   promotion_started   a campaign went live
|   promotion_paused    a live campaign was paused
|   points_earned       a finished sale credited points
|   points_redeemed     points spent against a deal
|   points_expiring     a customer's points are about to lapse
|   points_adjusted     a staff member credited or debited by hand
|
| EVERY ONE OF THESE GOES TO STAFF. No customer is contacted by anything in
| this file.
|
| That is worth saying plainly, because "Exclusive Offer Assigned" and
| "Points Expiring" read like messages to the customer, and the plan asks
| for customer-facing messages to go only through approved, working
| channels. There is no customer email or WhatsApp integration in this
| application. So an assigned offer tells the person who looks after that
| customer, and it is then their job to pick up the phone. Nothing here
| claims, logs or implies that the customer was messaged — because they
| were not.
|
| When a channel does exist, the place to add it is alongside these
| functions, not inside them: the recipient of an internal notification and
| the recipient of a customer message are different people with different
| consent, and collapsing the two is how a customer ends up receiving a
| notification written for staff.
|
| Two of the eight have no call site in the application, by design:
| offer_expiring and points_expiring are due at a time, not in response to
| somebody clicking something. They need a scheduled job — a Supabase cron
| or an edge function on a timer — to find what is now due and call them.
| They are written and left callable so that job is a few lines rather than
| a feature, and so their dedupe keys are already decided. This follows
| notifyEnquiryFollowUpDue, which has the same shape for the same reason,
| and it is why nothing here relies on a browser timer.
*/

/** How many people a team-wide notification will reach before we stop. */
const TEAM_FANOUT_CAP = 50;

/*
|--------------------------------------------------------------------------
| WHO HEARS
|--------------------------------------------------------------------------
*/

/**
 * Everyone holding a given permission.
 *
 * Capped, for the same reason the enquiry version is: a showroom that grows
 * to a hundred staff should not generate a hundred rows every time a
 * campaign is paused. At that size this wants a per-location or per-role
 * rule, and the cap is where that conversation starts rather than a silent
 * performance cliff.
 */
async function staffWithPermission(permission: string): Promise<string[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("role_permission_grants")
    .select("role_id, profiles!inner(id)")
    .eq("permission", permission)
    .limit(TEAM_FANOUT_CAP);

  if (error) {
    console.error("staffWithPermission error:", error);
    return [];
  }

  const ids = new Set<string>();

  for (const row of (data ?? []) as unknown as { profiles: { id: string } | { id: string }[] }[]) {
    const profiles = Array.isArray(row.profiles) ? row.profiles : [row.profiles];
    for (const profile of profiles) if (profile?.id) ids.add(profile.id);
  }

  return [...ids];
}

interface CustomerContext {
  name: string;
  /** The person who looks after this customer, if anybody does. */
  managerId: string | null;
}

async function getCustomerContext(customerId: string): Promise<CustomerContext | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("customer_profiles")
    .select("full_name, primary_relationship_manager_id")
    .eq("id", customerId)
    .maybeSingle();

  if (!data) return null;

  const row = data as unknown as {
    full_name: string | null;
    primary_relationship_manager_id: string | null;
  };

  return {
    name: row.full_name?.trim() || "a customer",
    managerId: row.primary_relationship_manager_id,
  };
}

interface PromotionContext {
  name: string;
  reference: string | null;
  endsAt: string | null;
}

async function getPromotionContext(promotionId: string): Promise<PromotionContext | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("promotions")
    .select("name, reference, ends_at")
    .eq("id", promotionId)
    .maybeSingle();

  if (!data) return null;

  const row = data as unknown as {
    name: string | null;
    reference: string | null;
    ends_at: string | null;
  };

  return {
    name: row.name?.trim() || "A campaign",
    reference: row.reference,
    endsAt: row.ends_at,
  };
}

async function getActorName(actorId: string | null): Promise<string> {
  if (!actorId) return "Someone";

  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("full_name").eq("id", actorId).maybeSingle();

  return (data as { full_name: string | null } | null)?.full_name?.trim() || "Someone";
}

/*
 * Two status conventions live in this codebase, and mixing them up is a
 * silent failure rather than a loud one.
 *
 *   promotions.status   lowercase — 'draft', 'active', 'paused', ...
 *   sales_deals.status  capitalised — 'Draft', 'Confirmed', 'Completed', ...
 *
 * Both are enforced by CHECK constraints, so neither is going to drift. A
 * comparison against the wrong casing never matches, which would mean these
 * notifications simply never arriving, with nothing in any log to say why.
 * So the status is normalised before it is compared.
 */
function isLive(status: string): boolean {
  return status.trim().toLowerCase() === "active";
}

function isPaused(status: string): boolean {
  return status.trim().toLowerCase() === "paused";
}

/** Dubai is UTC+04:00 all year, so a date can be formatted without a zone database. */
function dubaiDate(iso: string | null): string | null {
  if (!iso) return null;

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  }).format(parsed);
}

/*
|--------------------------------------------------------------------------
| AN EXCLUSIVE OFFER WAS ASSIGNED
|--------------------------------------------------------------------------
*/

/**
 * An offer has been put on one customer's account.
 *
 * Goes to whoever looks after that customer, because they are the person
 * who will mention it next time they speak. If nobody looks after them, it
 * goes to the staff who assign offers — an exclusive offer nobody knows
 * about is an offer that never gets used.
 *
 * The dedupe key is the assignment itself, so a retried save produces one
 * notification rather than two.
 */
export async function notifyOfferAssigned(
  assignmentId: string,
  promotionId: string,
  customerId: string,
  actorId: string | null,
): Promise<void> {
  try {
    const [promotion, customer, actorName] = await Promise.all([
      getPromotionContext(promotionId),
      getCustomerContext(customerId),
      getActorName(actorId),
    ]);

    if (!promotion || !customer) return;

    const recipients = customer.managerId
      ? [customer.managerId]
      : await staffWithPermission("offers.assign");

    const validTo = dubaiDate(promotion.endsAt);

    await Promise.all(
      recipients.map((recipientId) =>
        createNotification({
          recipientId,
          type: "offer_assigned",
          title: "Exclusive offer assigned",
          description: `${actorName} assigned ${promotion.name} to ${customer.name}${
            validTo ? `, valid until ${validTo}` : ""
          }.`,
          entityType: "customer",
          entityId: customerId,
          actorId,
          dedupeKey: `offer_assigned:${assignmentId}:${recipientId}`,
        }),
      ),
    );
  } catch (error) {
    console.error("notifyOfferAssigned error:", error);
  }
}

/*
|--------------------------------------------------------------------------
| A CAMPAIGN WENT LIVE, OR STOPPED
|--------------------------------------------------------------------------
*/

/**
 * A campaign's status changed to something worth announcing.
 *
 * Only Active and Paused are. A draft being edited, or an archived campaign
 * being tidied away, is housekeeping — and a system that pings on every
 * keystroke gets muted, after which the ones that matter stop arriving too.
 *
 * Goes to the people who manage campaigns, not everybody who can see them:
 * a salesperson does not need to know the moment a campaign is paused, they
 * need the pricing to be right, which it will be.
 *
 * No dedupe key. The same campaign may legitimately be paused and resumed
 * several times, and each is a real event.
 */
export async function notifyPromotionStatusChanged(
  promotionId: string,
  toStatus: string,
  actorId: string | null,
): Promise<void> {
  try {
    if (!isLive(toStatus) && !isPaused(toStatus)) return;

    const [promotion, actorName] = await Promise.all([
      getPromotionContext(promotionId),
      getActorName(actorId),
    ]);

    if (!promotion) return;

    const recipients = await staffWithPermission("offers.manage");

    const started = isLive(toStatus);
    const endsOn = dubaiDate(promotion.endsAt);

    await Promise.all(
      recipients.map((recipientId) =>
        createNotification({
          recipientId,
          type: started ? "promotion_started" : "promotion_paused",
          title: started ? "Campaign is live" : "Campaign paused",
          description: started
            ? `${promotion.name} was activated by ${actorName}${endsOn ? ` and runs until ${endsOn}` : ""}.`
            : `${promotion.name} was paused by ${actorName}. Customers will no longer see this discount.`,
          entityType: "promotion",
          entityId: promotionId,
          actorId,
        }),
      ),
    );
  } catch (error) {
    console.error("notifyPromotionStatusChanged error:", error);
  }
}

/**
 * Several campaigns changed status at once.
 *
 * One notification, not one per campaign. A bulk pause is a single decision
 * by a single person, and the per-campaign version of this would put fifty
 * rows in front of everybody who manages campaigns for one click — which is
 * how a notification list stops being read, after which the ones that matter
 * stop arriving too.
 *
 * Names the first few campaigns rather than all of them, because the useful
 * version of this message is one somebody can read at a glance and then go
 * and look.
 */
export async function notifyPromotionsBulkStatusChanged(
  promotionIds: string[],
  toStatus: string,
  actorId: string | null,
): Promise<void> {
  try {
    if (!isLive(toStatus) && !isPaused(toStatus)) return;
    if (promotionIds.length === 0) return;

    /* One campaign is not a bulk operation; say it properly. */
    if (promotionIds.length === 1) {
      await notifyPromotionStatusChanged(promotionIds[0], toStatus, actorId);
      return;
    }

    const admin = createAdminClient();

    const { data } = await admin
      .from("promotions")
      .select("name")
      .in("id", promotionIds.slice(0, 3));

    const names = ((data ?? []) as unknown as { name: string | null }[])
      .map((row) => row.name?.trim())
      .filter((name): name is string => Boolean(name));

    const actorName = await getActorName(actorId);
    const recipients = await staffWithPermission("offers.manage");

    const remaining = promotionIds.length - names.length;
    const listed = names.join(", ");
    const subject =
      remaining > 0 ? `${listed} and ${remaining} more` : listed || `${promotionIds.length} campaigns`;

    const started = isLive(toStatus);

    await Promise.all(
      recipients.map((recipientId) =>
        createNotification({
          recipientId,
          type: started ? "promotion_started" : "promotion_paused",
          title: started
            ? `${promotionIds.length} campaigns are live`
            : `${promotionIds.length} campaigns paused`,
          description: `${actorName} ${started ? "activated" : "paused"} ${subject}.`,
          entityType: "offers",
          entityId: null,
          actorId,
        }),
      ),
    );
  } catch (error) {
    console.error("notifyPromotionsBulkStatusChanged error:", error);
  }
}

/*
|--------------------------------------------------------------------------
| A CAMPAIGN IS ABOUT TO END
|--------------------------------------------------------------------------
*/

/**
 * A live campaign ends soon.
 *
 * Nothing in the application calls this, because it is due at a time rather
 * than in response to anybody doing anything. It needs a scheduled job:
 *
 *   select id from public.promotions
 *   where status = 'Active'
 *     and archived_at is null
 *     and ends_at between now() and now() + interval '3 days';
 *
 * and then this function for each id. The dedupe key is the campaign and
 * the day, so a job that runs hourly still produces one notification per
 * campaign per day rather than twenty-four.
 */
export async function notifyOfferExpiringSoon(promotionId: string): Promise<void> {
  try {
    const promotion = await getPromotionContext(promotionId);
    if (!promotion) return;

    const recipients = await staffWithPermission("offers.manage");

    const endsOn = dubaiDate(promotion.endsAt);

    /* Dubai's day, so a job running at 02:00 local time does not dedupe
       against the previous day. */
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());

    await Promise.all(
      recipients.map((recipientId) =>
        createNotification({
          recipientId,
          type: "offer_expiring",
          title: "Campaign ending soon",
          description: `${promotion.name}${endsOn ? ` ends on ${endsOn}` : " is ending"}. Extend it or let it close.`,
          entityType: "promotion",
          entityId: promotionId,
          actorId: null,
          dedupeKey: `offer_expiring:${promotionId}:${today}:${recipientId}`,
        }),
      ),
    );
  } catch (error) {
    console.error("notifyOfferExpiringSoon error:", error);
  }
}

/*
|--------------------------------------------------------------------------
| POINTS MOVED
|--------------------------------------------------------------------------
*/

/**
 * A finished sale credited points.
 *
 * Goes to whoever looks after the customer. Not to the team: points being
 * earned is the system working normally, and the only person it changes
 * anything for is the one who will next talk to that customer.
 *
 * The dedupe key is the ledger entry, so a retried transition cannot
 * produce two notifications even if it somehow produced two attempts.
 */
export async function notifyPointsEarned(
  customerId: string,
  points: number,
  dealId: string,
  actorId: string | null,
): Promise<void> {
  try {
    if (points <= 0) return;

    const customer = await getCustomerContext(customerId);
    if (!customer?.managerId) return;

    await createNotification({
      recipientId: customer.managerId,
      type: "points_earned",
      title: "Loyalty points earned",
      description: `${customer.name} earned ${points.toLocaleString("en-US")} points on a completed sale.`,
      entityType: "customer",
      entityId: customerId,
      actorId,
      dedupeKey: `points_earned:${dealId}:${customer.managerId}`,
    });
  } catch (error) {
    console.error("notifyPointsEarned error:", error);
  }
}

/**
 * Points were spent against a deal.
 *
 * Goes to the customer's manager. The person who applied them is the actor
 * and createNotification drops their own copy, so in the common case —
 * the manager doing it themselves — nobody is interrupted.
 */
export async function notifyPointsRedeemed(
  customerId: string,
  points: number,
  dealId: string,
  actorId: string | null,
): Promise<void> {
  try {
    if (points <= 0) return;

    const customer = await getCustomerContext(customerId);
    if (!customer?.managerId) return;

    await createNotification({
      recipientId: customer.managerId,
      type: "points_redeemed",
      title: "Loyalty points redeemed",
      description: `${points.toLocaleString("en-US")} of ${customer.name}'s points were applied to a deal.`,
      entityType: "customer",
      entityId: customerId,
      actorId,
      dedupeKey: `points_redeemed:${dealId}:${points}:${customer.managerId}`,
    });
  } catch (error) {
    console.error("notifyPointsRedeemed error:", error);
  }
}

/**
 * Somebody granted or took away points by hand.
 *
 * This one goes further than the others: the customer's manager hears, and
 * so do the people who own the loyalty programme. A manual adjustment is
 * the one action in this module that creates value out of nothing, and the
 * plan names unauthorised manual adjustment as a case to test. Oversight of
 * it should not depend on somebody thinking to look.
 *
 * No dedupe key: two adjustments of the same size on the same day are two
 * real events, and collapsing them is exactly the wrong behaviour here.
 */
export async function notifyPointsAdjusted(
  customerId: string,
  points: number,
  reason: string,
  actorId: string | null,
): Promise<void> {
  try {
    if (points === 0) return;

    const [customer, actorName] = await Promise.all([
      getCustomerContext(customerId),
      getActorName(actorId),
    ]);

    if (!customer) return;

    const oversight = await staffWithPermission("loyalty.settings");

    const recipients = new Set<string>(oversight);
    if (customer.managerId) recipients.add(customer.managerId);

    const credited = points > 0;
    const size = Math.abs(points).toLocaleString("en-US");

    await Promise.all(
      [...recipients].map((recipientId) =>
        createNotification({
          recipientId,
          type: "points_adjusted",
          title: credited ? "Points granted by hand" : "Points removed by hand",
          description: `${actorName} ${credited ? "credited" : "debited"} ${size} points ${
            credited ? "to" : "from"
          } ${customer.name}. Reason: ${reason}`,
          entityType: "customer",
          entityId: customerId,
          actorId,
        }),
      ),
    );
  } catch (error) {
    console.error("notifyPointsAdjusted error:", error);
  }
}

/**
 * A customer's points are about to lapse.
 *
 * Like notifyOfferExpiringSoon, nothing in the application calls this. It
 * needs a scheduled job, and the obvious one runs alongside
 * expire_loyalty_points():
 *
 *   select customer_id, sum(points - consumed_points) as expiring
 *   from public.loyalty_ledger
 *   where entry_type = 'earn'
 *     and expires_at between now() and now() + interval '30 days'
 *     and points > consumed_points
 *   group by customer_id;
 *
 * and then this function per customer. The dedupe key is the customer and
 * the month, so a daily job does not send thirty notifications about the
 * same expiry.
 */
export async function notifyPointsExpiringSoon(
  customerId: string,
  points: number,
  expiresOn: string,
): Promise<void> {
  try {
    if (points <= 0) return;

    const customer = await getCustomerContext(customerId);
    if (!customer?.managerId) return;

    const when = dubaiDate(expiresOn);

    /* Year and month in Dubai, so a daily job dedupes to one per month. */
    const month = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      timeZone: "Asia/Dubai",
    }).format(new Date(expiresOn));

    await createNotification({
      recipientId: customer.managerId,
      type: "points_expiring",
      title: "Loyalty points expiring",
      description: `${customer.name} has ${points.toLocaleString("en-US")} points expiring${
        when ? ` on ${when}` : " soon"
      }. Worth a call.`,
      entityType: "customer",
      entityId: customerId,
      actorId: null,
      dedupeKey: `points_expiring:${customerId}:${month}:${customer.managerId}`,
    });
  } catch (error) {
    console.error("notifyPointsExpiringSoon error:", error);
  }
}
