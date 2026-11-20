# Enquiry requests: operations

Everything here is run in the Supabase SQL editor. Use it carefully: it bypasses the app's own checks.

## Roles and permissions

Enquiry permission keys: `view`, `manage`, `delete`, `assign`, `export`, `valuate` (all prefixed
`enquiries.`). Super Admin always has all of them.

What each one gates:

| Key | What it allows |
|---|---|
| `enquiries.view` | Seeing the list, a detail page, and a customer's enquiry history |
| `enquiries.manage` | Creating, editing, assigning, status moves, notes, follow-ups, linking records |
| `enquiries.delete` | Hard-deleting junk, and editing a colleague's notes |
| `enquiries.assign` | Reserved for assignment rules; `manage` currently covers assigning |
| `enquiries.export` | Downloading enquiries as PDF or Excel |
| `enquiries.valuate` | Saving a vehicle valuation or an offer |

`export` and `valuate` are deliberately separate from `manage`. Looking at one customer's details on
screen and taking every customer's details away in a file are different acts; so are working an
enquiry and putting a price on somebody's car.

Give a role a permission (it takes effect at the next page load):

```sql
insert into public.role_permission_grants (role_id, permission)
select r.id, 'enquiries.export'
from public.roles r
where r.name = 'Manager'
on conflict do nothing;
```

See who can do what:

```sql
select r.name as role, g.permission
from public.role_permission_grants g
join public.roles r on r.id = g.role_id
where g.permission like 'enquiries.%'
order by r.name, g.permission;
```

**If `enquiries.valuate` is missing, the "Value it" button does not appear at all.** That is the
permission working, not a broken page. The Phase 1 migration grants the three newer keys to whoever
already had `enquiries.manage`; if you ran the scripts out of order, this repairs it and is safe to
run twice:

```sql
insert into public.role_permission_grants (role_id, permission)
select g.role_id, v.key
from public.role_permission_grants g
cross join (values ('enquiries.assign'), ('enquiries.export'), ('enquiries.valuate')) as v (key)
where g.permission = 'enquiries.manage'
  and not exists (
    select 1 from public.role_permission_grants x
    where x.role_id = g.role_id and x.permission = v.key
  );
```

## The workflow lives in the database

Statuses and the moves between them are rows, not code. Adding a status gives it a tab, a badge and a
place in the status control with no deployment.

The statuses as shipped — 14, of which 9 are open work:

```sql
select key, label, tone, is_open, is_terminal, is_active, sort_order
from public.enquiry_statuses
order by sort_order nulls last, key;
```

`is_open` means it still needs somebody to do something — it drives the Open and Closed tabs and the
dashboard counts. `is_terminal` means it is an ending. `is_active` is the enable switch: set it false
to retire a status without deleting history.

### Adding a status

```sql
insert into public.enquiry_statuses (key, label, tone, is_open, is_terminal, is_active, sort_order)
values ('Awaiting Documents', 'Awaiting Documents', 'warning', true, false, true, 6);

-- Then say where it can be reached from and where it leads. enquiry_type null
-- means every type; name a type to restrict it.
insert into public.enquiry_status_transitions (from_status, to_status, enquiry_type)
values ('In Review', 'Awaiting Documents', 'Finance'),
       ('Awaiting Documents', 'In Review', 'Finance'),
       ('Awaiting Documents', 'Cancelled', null);
```

A status with no inbound transition is unreachable and a status with no outbound one is a dead end.
Check both after adding:

```sql
-- Anything orphaned, i.e. unreachable from New?
with recursive reach(key) as (
  select 'New'
  union
  select t.to_status from public.enquiry_status_transitions t join reach r on t.from_status = r.key
)
select key from public.enquiry_statuses
where is_active and key not in (select key from reach);

-- Anything with no way out that isn't meant to be an ending?
select s.key from public.enquiry_statuses s
where s.is_active and not s.is_terminal
  and not exists (select 1 from public.enquiry_status_transitions t where t.from_status = s.key);
```

### What a type can do

To see the moves available to one type:

```sql
select from_status, to_status, coalesce(enquiry_type, 'any type') as applies_to
from public.enquiry_status_transitions
where enquiry_type is null or enquiry_type = 'Trade-In'
order by from_status, to_status;
```

Three statuses are type-restricted on purpose: `Inspection Needed` and `Valuation Prepared` only
apply where there is a car to look at (Trade-In and Sell My Car), and `Referred to Finance Team` only
to Finance. **No status means a finance approval.** An enquiry is a conversation; approving finance
happens elsewhere and must never be inferred from a status here.

### Reopening

`Spam`, `Rejected` and `Cancelled` can go back to `New` — that is how a wrongly flagged enquiry is
recovered. `Completed` and `Converted` have no way back, and the app says so plainly rather than
telling somebody to reopen something that cannot be reopened.

## Archive, not delete

Archiving sets `archived_at` and takes the enquiry out of every list, count, dashboard figure and
export, while keeping it on file. It is reversible.

```sql
-- What has been archived, and when
select enquiry_number, status, archived_at
from public.enquiries
where archived_at is not null
order by archived_at desc;

-- Put one back
update public.enquiries set archived_at = null where enquiry_number = 'ENQ-00042';
```

Hard delete is reserved for junk and needs `enquiries.delete`. It removes the detail rows, history and
media with it.

## Audit history

Four sources feed the History panel on an enquiry:

| Table | Written by | Holds |
|---|---|---|
| `enquiry_activity` | A trigger on insert, plus the app | Created, converted, valuation, edits, archive |
| `enquiry_status_history` | A trigger | Every status move, with who and why |
| `enquiry_staff_assignment_history` | A trigger | Every assignment and hand-over |
| `enquiry_notes` / `enquiry_follow_ups` | The app | Notes and contact |

The three application-written activity types are `valuation`, `edited` and `archived`. A trigger
cannot write these: it sees two numbers change and cannot say whether that was a first valuation or a
revision, which is the part somebody reading the history wants.

If `activity_type` carries a CHECK constraint, those three must be allowed or the rows are silently
rejected while the enquiry itself saves. `docs/sprint-7-migration.sql` includes a script that handles
this, and it does nothing when there is no such constraint.

Read one enquiry's full history:

```sql
select 'activity' as source, activity_type as kind, description, changed_at as at
from public.enquiry_activity where enquiry_id = '<uuid>'
union all
select 'status', from_status || ' -> ' || to_status, coalesce(reason, ''), changed_at
from public.enquiry_status_history where enquiry_id = '<uuid>'
union all
select 'assignment', coalesce(to_staff::text, 'unassigned'), coalesce(reason, ''), changed_at
from public.enquiry_staff_assignment_history where enquiry_id = '<uuid>'
order by at desc;
```

## Customer media

Customer vehicle photos go to the **private** `enquiry-media` bucket and are served as one-hour signed
URLs. Nothing in the app produces a public link to one.

```sql
-- Confirm the bucket is still private
select id, public from storage.buckets where id = 'enquiry-media';
```

Photos uploaded against a form somebody then abandoned stay under `drafts/`. There is no scheduled
cleanup yet; until there is, this finds them:

```sql
select name, created_at
from storage.objects
where bucket_id = 'enquiry-media'
  and name like 'drafts/%'
  and created_at < now() - interval '7 days'
order by created_at;
```

## Public intake

`POST /api/enquiries` is the website's entry point. It calls `submit_enquiry()`, which returns a
reference number and whether the submission was a duplicate. The route answers the same way whatever
it concluded, so somebody probing the form learns nothing from the reply.

Two environment variables affect it:

| Variable | What it does |
|---|---|
| `ENQUIRY_IP_SALT` | Salts the stored IP hash. Without it, hashes are not usefully anonymous. |
| `ENQUIRY_ALLOWED_ORIGINS` | Comma-separated origins allowed to post. Without it, origin checking is off. |

Spam caught by the honeypot or the timing check lands on the Spam tab rather than being thrown away,
and notifies nobody.

## Export

`GET /admin/enquiries/export` needs `enquiries.export` and takes:

| Parameter | Values |
|---|---|
| `format` | `excel` or `pdf` |
| `scope` | `current`, `selected`, `type` |
| `ids` | Comma-separated ids, for `scope=selected` |
| `type` | An enquiry type, for `scope=type` |

Plus the list's own filter parameters, which the route parses with the same parser the page uses — so
"everything matching the current filters" means the rows that were on screen.

At most 2,000 rows per file. The hashed IP and user agent are deliberately not included: they exist to
catch spam, they are no use to a salesperson, and a spreadsheet is the last place they should end up.
