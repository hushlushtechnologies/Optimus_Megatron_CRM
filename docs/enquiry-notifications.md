# Enquiry notifications

Six things the enquiry module interrupts somebody for, and the reasoning behind each. All of them go
through the shared notification system, so they appear in the same bell as leads and test drives.

| Type | Who hears | When |
|---|---|---|
| `enquiry_received` | Everyone with `enquiries.manage` | A new enquiry arrives unassigned |
| `enquiry_assigned` | The new owner | An enquiry is given to somebody |
| `enquiry_reassigned` | The new owner **and** the previous one | An enquiry changes hands |
| `enquiry_urgent` | The owner, or the team if unowned | Priority is raised to Urgent |
| `enquiry_status_changed` | The owner | Somebody else moves their enquiry |
| `follow_up_due` | The follow-up's owner | A scheduled follow-up comes round |

## Decisions worth knowing

**A reassignment tells both people.** Without it, work vanishes off somebody's list with no
explanation and they keep chasing an enquiry that is no longer theirs.

**Nothing pings on a note or a valuation.** A colleague writing a note is not an event. A system that
pings on everything gets muted, and then the six above stop arriving too.

**Urgent only fires on the way up.** Being told something became *less* urgent is noise.

**Nobody notifies themselves.** The shared `createNotification` drops a notification whose recipient
is the actor, so moving your own enquiry is silent.

**A new website enquiry notifies after the response has gone.** The route uses `after()` from
`next/server`, so a visitor never waits on our internal fan-out and a notification failure can never
turn a saved enquiry into an error on their screen.

**Spam and duplicates notify nobody.** Spam is on a tab for somebody to look through, which is not the
same as worth a ping. A duplicate is the same person sending the same thing twice, and the first one
was already announced.

**A notification never breaks the thing that caused it.** Every function here swallows its own
errors. An enquiry must save even when the notification does not.

## Follow-up reminders need a scheduled job

`follow_up_due` is the one notification nothing in the app calls, because there is no moment in a
request to call it from: it is due at a *time*, not in response to somebody clicking something.

`notifyEnquiryFollowUpDue(followUpId)` is written, callable, and already decided about
de-duplication — one notification per follow-up however many times the job runs. What is missing is
the thing that calls it.

Until that exists, **reminder choices are stored and not delivered.**

A Supabase scheduled function (or any cron that can reach the app) needs to find follow-ups now due
and call it for each. The query it wants:

```sql
select f.id
from public.enquiry_follow_ups f
join public.enquiries e on e.id = f.enquiry_id
where f.status = 'Scheduled'
  and f.assigned_to is not null
  and e.archived_at is null
  -- due, allowing for the reminder lead time the person chose
  and f.scheduled_at - make_interval(mins => coalesce(f.reminder_minutes_before, 0)) <= now()
  -- and not already announced
  and not exists (
    select 1 from public.notifications n
    where n.dedupe_key = 'enquiry_follow_up_due:' || f.id::text
  )
order by f.scheduled_at
limit 200;
```

The `limit` matters: a job that tries to clear a year's backlog in one run is a job that times out
halfway and leaves nobody knowing how far it got.

## Team notifications are capped

`enquiry_received` and `enquiry_urgent` have no particular owner, so they go to everyone with
`enquiries.manage` — capped at 50 recipients.

That is fine at current size. At a hundred staff this wants a per-location or per-role rule instead,
and the cap is where that conversation should start rather than a silent performance cliff. One
website enquiry should not write a hundred rows.

## Checking it works

Every type needs an icon and every entity type needs a route, or a notification arrives looking
correct and goes nowhere when clicked. Both live in `src/lib/utils/notification-links.ts`:

- `TYPE_ICON` — one entry per notification type
- `ENTITY_ROUTES` — one entry per entity type, `enquiry` included

Neither is visible to TypeScript: both are string lookups into a `Record<string, …>`. The
`enquiry` entity route was in fact missing when this module was first wired up, which made all six
notifications unclickable while looking perfectly fine.

Recent enquiry notifications, to confirm they are landing:

```sql
select n.type, n.title, n.entity_type, n.entity_id, n.created_at, p.full_name as recipient
from public.notifications n
left join public.profiles p on p.id = n.recipient_id
where n.type like 'enquiry%' or n.type = 'follow_up_due'
order by n.created_at desc
limit 30;
```

If a type appears here but clicking does nothing, the entity route is the thing to check.
