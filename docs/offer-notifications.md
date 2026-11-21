# Offer and loyalty notifications

Sprint 8, Phase 23.

## The one thing to know first

**Every notification in this module goes to staff. No customer is contacted
by any of it.**

That needs saying plainly, because "Exclusive Offer Assigned" and "Points
Expiring" read like messages to the customer. They are not. There is no
customer email or WhatsApp integration in this application, so an assigned
offer tells the person who looks after that customer, and it is then their
job to pick up the phone.

Nothing in the code claims, logs, or implies that a customer was messaged —
because none was. If you are asked "did the customer get told about their
points?", the answer is no, and the place to add that is alongside these
functions rather than inside them: the recipient of an internal notification
and the recipient of a customer message are different people with different
consent, and collapsing the two is how a customer receives a notification
written for staff.

## The eight

| Type | Who hears | When |
|---|---|---|
| `offer_assigned` | The customer's relationship manager, or staff with `offers.assign` if they have none | An offer is put on a customer's account |
| `promotion_started` | Staff with `offers.manage` | A campaign goes live |
| `promotion_paused` | Staff with `offers.manage` | A live campaign is paused |
| `offer_expiring` | Staff with `offers.manage` | **Scheduled job only** — a live campaign ends soon |
| `points_earned` | The customer's relationship manager | A completed sale credits points |
| `points_redeemed` | The customer's relationship manager | Points are applied to a deal |
| `points_adjusted` | The customer's manager **and** staff with `loyalty.settings` | Somebody credits or debits by hand |
| `points_expiring` | The customer's relationship manager | **Scheduled job only** — points about to lapse |

`points_adjusted` goes further than the rest on purpose. A manual adjustment
is the one action in the loyalty module that creates value out of nothing,
and the sprint plan names unauthorised manual adjustment as a case to test.
Oversight of a hand-written credit should not depend on somebody thinking to
go and look.

## What does not notify

A campaign being created, edited, duplicated or archived. A code being
created or deactivated. A draft being saved.

These are housekeeping. A system that pings on every keystroke gets muted,
after which the eight above stop arriving too. The same reasoning is in
`enquiry-notifications.ts`, which deliberately stays quiet about notes and
valuations.

## The two with no call site

`notifyOfferExpiringSoon` and `notifyPointsExpiringSoon` are written,
exported and callable, and **nothing in the application calls them**.

That is deliberate, not an oversight. Both are due at a *time* rather than
in response to anybody clicking anything, so there is no moment in a request
to call them from. They need a scheduled job — a Supabase cron or an edge
function on a timer. The sprint plan's rule is "do not rely on a browser
timer to activate or expire offers", and this is the same principle applied
to telling people about it.

They are written now so that job is a few lines rather than a feature, and
so their dedupe keys are already decided. `notifyEnquiryFollowUpDue` has the
same shape for the same reason.

### Campaigns ending soon

```sql
select id from public.promotions
where status = 'active'
  and archived_at is null
  and ends_at between now() and now() + interval '3 days';
```

Then `notifyOfferExpiringSoon(id)` for each. Dedupe key is the campaign and
the Dubai day, so an hourly job still sends one per campaign per day.

### Points expiring

```sql
select customer_id,
       sum(points - consumed_points) as expiring,
       min(expires_at)               as first_expiry
from public.loyalty_ledger
where entry_type = 'earn'
  and expires_at between now() and now() + interval '30 days'
  and points > consumed_points
group by customer_id;
```

Then `notifyPointsExpiringSoon(customer_id, expiring, first_expiry)`. Dedupe
key is the customer and the month, so a daily job does not send thirty
notifications about one expiry.

The obvious home for both is alongside `expire_loyalty_points()`, which
already needs a schedule.

## Two traps in this code

### Status casing

`promotions.status` is **lowercase** (`'active'`, `'paused'`).
`sales_deals.status` is **capitalised** (`'Confirmed'`, `'Completed'`). Both
are enforced by CHECK constraints, so neither will drift — but a comparison
against the wrong casing never matches, and the symptom is notifications
silently never arriving with nothing in any log to say why.

This bit during development: the first version of
`notifyPromotionStatusChanged` compared against `"Active"` and would never
have fired. The module now normalises with `isLive()` and `isPaused()`
rather than comparing literals.

### A CHECK constraint on `notifications.type`

The `notifications` table is not created by any migration in this repo, so
whether `type` and `entity_type` carry CHECK constraints is unknown per
environment. If they do, these inserts are rejected at runtime — and
`createNotification` swallows its own errors by design, so the only symptom
is notifications that never arrive.

`sql/08-phase-23-notification-types.sql` widens both constraints if they
exist. It reads the values the constraint already allows **out of the
constraint definition** and unions them with the values in the table and the
eight new ones, so nothing can be lost. Rebuilding from the table's contents
alone — which is what `sql/04-phase-19-audit-types.sql` does for
`enquiry_activity` — is not safe enough here: `notifications.type` has around
forty values across six modules and a given database will have rows for only
some of them, so that approach would quietly revoke every allowed-but-unused
type and break test drive or payment notifications weeks later.

## Guard rails

`checks/check-notifications.py` verifies that every type any sender module
emits has an icon in `notification-links.ts`, and that every `entityType`
resolves to a route. Neither is visible to `tsc` — they are plain strings,
and a missing entry means a notification with no icon or, worse, one that
cannot be clicked.

```
python3 checks/check-notifications.py          # every module
python3 checks/check-notifications.py offer    # just this one
```

## Failure behaviour

A notification can never fail the action that triggered it.
`createNotification` catches and logs everything, and each `notify*` function
wraps its own body too. An offer must save even if the notification does not.

The same rule applies to loyalty settlement in
`src/lib/supabase/loyalty-settlement.ts`: a sale that completed must stay
completed even if the points could not be credited. Because
`earn_loyalty_for_deal` is idempotent, the recoverable state is a missing
credit that re-running the transition repairs; the unrecoverable state would
be a sale stuck half-finished because the loyalty programme had a bad day.
