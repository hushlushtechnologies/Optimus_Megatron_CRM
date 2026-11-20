# Sprint 7 — Enquiry Requests: completion report

**Optimus Megatron Cars CRM** · branch `sprint-7` · 20 November 2026

---

## 1. Where it stands

All 22 phases are built. The module handles five kinds of enquiry — Finance, Trade-In, Sell My Car,
Dream Car and General — from a public website form or logged by staff, through assignment, a
configurable status workflow, notes, follow-ups, valuation and matching, to export and a prepared
metrics layer.

| | |
|---|---|
| Phases complete | 22 of 22 |
| Code files | 77 |
| SQL scripts | 4, combined in `docs/sprint-7-migration.sql` |
| `npx tsc --noEmit` | clean |
| Contrast fixes made | 2, in Sprint 7's own components |
| `npm run lint` | 0 errors, 0 warnings attributable to Sprint 7 |
| `npm run build` | compiles; all five enquiry routes generate |
| Documentation | `docs/enquiry-requests.md`, `docs/enquiry-notifications.md`, `docs/sprint-7-migration.sql` |

Nothing has been committed or pushed. That needs your approval.

---

## 2. What was built

**The data model** (Phase 1–3). Shared fields on `enquiries` plus three type-specific detail tables,
rather than one enormous table or a fully normalised sprawl. Eleven statuses, thirty-six transitions,
five history tables, three permissions, thirty RLS policies, a 49-column list view and a private
media bucket. Status and assignment changes are recorded by triggers in tables of their own, so they
are logged even when a row is changed by hand in SQL.

**The public form and intake** (Phase 4–9). A multi-step form per enquiry type, honeypot and timing
checks, duplicate detection, a hashed IP, and a response that reads the same whatever the server
concluded — so somebody probing the form learns nothing from the reply.

**The admin surface** (Phase 10–15). List with tabs, filters, sorting, pagination and bulk actions;
a detail page; a status control driven by the workflow table; assignment with hand-over reasons.
Adding a status in the database gives it a tab, a badge and a place in the status control with no
deployment — which Phase 15 proved by adding three statuses and thirty transitions with no code
change at all.

**Working an enquiry** (Phase 16–17). Notes marked internal or shareable, archived rather than
deleted. Follow-ups with required outcomes, reschedule reasons appended rather than overwriting, and
a "log contact" path for contact that already happened. Valuation as two separate figures — what the
car is worth and what we would offer — and manual dream-car matching.

**Joining up and finishing** (Phase 18–22). Enquiry history on the customer; links to a lead, deal,
test drive and reservation; six notifications; three audit events a trigger cannot write; PDF and
Excel export in three scopes; a prepared metrics layer.

---

## 3. Decisions you should know about

These shaped the module and are worth disagreeing with now rather than later.

**No separate communications table.** A completed Phone Call, WhatsApp or Email follow-up *is* the
communication record. A third table would hold the same six columns and start disagreeing with this
one about which calls happened.

**Valuation is two numbers, not one.** What a car is worth and what a dealership will pay are
different facts. One field for both means either the valuation is quietly understated or the offer is
quietly inflated.

**Nothing is calculated and nothing matches automatically.** There is no UAE market-value feed behind
the valuation and no formula pretending to be one. Nothing suggests a car for a dream-car brief:
matching on brand and budget alone looks convincing in a demo and produces phone calls about cars the
customer did not ask for. `matched_car_id` is written in exactly one place, reached from exactly one
button.

**Linking creates nothing.** An enquiry arriving is a question, not a deal. Nothing in the module
inserts a deal, reservation, test drive or payment — checked, not just intended.

**No status means a finance approval.** An enquiry is a conversation; approving finance happens
elsewhere and is never inferred from a status here. There is no status with "Approved" in its name,
and the finance form collects no income, documents or ID.

**Archive, not delete.** Archiving takes an enquiry off every list, count, dashboard figure and
export while keeping it on file, reversibly. Hard delete is reserved for junk and needs its own
permission.

**`export` and `valuate` are separate permissions.** Looking at one customer's details on screen and
taking every customer's details away in a file are different acts. So are working an enquiry and
putting a price on somebody's car.

**Response time is measured to the first completed contact,** not to assignment. Giving an enquiry an
owner is not answering the customer, and a metric that counted it as one would report a healthy
response time for a showroom that never rings anybody back.

---

## 4. Bugs found and fixed

Eleven defects were found during the sprint. Ten were mine; one was pre-existing. The ones worth
recording:

**Trade-In and Dream Car enquiries silently discarded everything the customer typed.** The submit
payload was missing two fields. The form collected the data, showed it on the review step, and dropped
it on save — no error, no warning. Both fields were `.optional()` in the schema, so `tsc` was
perfectly happy. Cause: string-replace edits that targeted multi-line text Prettier had already
collapsed to one line, so they matched nothing and failed silently.

That bug set the method for the rest of the sprint: **read the real file before editing it, and write
an explicit check for every invariant a type checker cannot see.** Four such checks now exist and are
in the batch zips. Each has since caught something:

| Check | What it caught |
|---|---|
| `check-payloads.py` | "Log contact" never asked *when* contact happened, so every logged call was stamped with the moment it was typed |
| `check-promise-all.py` | Two queries added to the detail page but not to its `Promise.all` |
| `check-link-columns.py` | Confirmed all 24 column names reaching into other modules are names those modules read |
| `check-notifications.py` | **The `enquiry` entity route was missing — all six notifications would have arrived looking correct and gone nowhere when clicked** |

Others: the audit writer used `previous_value` where the column is `old_value` (hidden by a
`Record<string, unknown>` insert, so audit rows would have failed silently while enquiries saved);
`generalCategory` landed in the wrong schema; a `pg_get_constraintdef()` call passed the row instead
of its oid, caught by running the SQL rather than reading it.

One pre-existing issue was also found and dealt with: a **dead duplicate of the notification routing
logic** in `notifications-dropdown.tsx`, with hardcoded paths and no `enquiry` entry, which would
have misled whoever edited it next. Removed.

---

## 5. Phase 21 review — what was actually checked

Rather than assert these, each was re-derived from the code by a script. All are in the batch zip.

**Security — 18 properties, all holding.** Every server action begins with a permission check and runs
its input through a schema; who-did-it columns come from the session and never from the payload; the
media bucket is private and served by signed URL; the export needs its own permission and refuses with
403; anti-spam internals stay out of the export; the finance schema collects no income, ID or
documents; no status reads as an approval; cross-module links cannot reach another customer's records;
`archived_at` is filtered in every read path; the notification fan-out is not reachable as an endpoint.

**Accessibility — no findable issues** across 39 components, after four false positives were
understood (three icons hidden by an `aria-hidden` ancestor, one passed as a prop to a component that
clones it with `aria-hidden` set). `useMotion`, `use-reduced-motion` and `globals.css` all honour a
reduced-motion preference.

**Contrast — computed exactly, in both themes.** Body text, secondary text and captions pass AA on
cards, hovered rows and the page background in both themes. Dark-on-gold button labels pass at 10.2:1
and 8.1:1.

**Two fixes made to my own work, found by that contrast pass.** In light theme the "· expired" text
on a valuation read at 3.44:1, where text needs 4.5:1 — it now uses weight rather than colour, which
also means nothing depends on seeing a colour to know an offer has lapsed. And the warning icon on the
expired banner was 2.09:1 against its own tint, below even the 3:1 a graphical object needs; it is
decorative and sits beside text that says the same thing, so it now inherits the readable colour. The
three remaining `text-danger` icons measure 3.44:1 on their tint, which clears the 3:1 bar for
graphics, and each sits beside text carrying the same message.

**One genuine finding I did not fix, in section 7 below:** every badge tone fails AA in light theme.

**Error handling, loading, empty and permission-denied states** are all present: `loading.tsx` for the
list and the detail page, `app/admin/error.tsx` covering the module while preserving the admin shell,
and empty states throughout.

**One fix made.** For a Completed enquiry the status control said *"Reopen it first if it needs more
work"* — and there is no reopen path from Completed. It named a door that was not there. It now names
the real options when there are some, and says plainly there is no way back when there are none.

---

## 6. Phase 22 testing

**All five workflows from the plan walk end to end**, verified against the real status and transition
data loaded into Postgres 16 — 14 statuses, 64 transitions:

| Workflow | Path |
|---|---|
| Finance | New → Assigned → Follow-Up → In Review → Completed |
| Finance (referred) | New → Assigned → Referred to Finance Team → In Review → Completed |
| Sell My Car | New → Assigned → Inspection Needed → Valuation Prepared → Offer Sent → Completed |
| Trade-In | New → Assigned → Inspection Needed → Valuation Prepared → In Review → Completed |
| Dream Car | New → Assigned → In Review → Follow-Up → Completed |
| General | New → Assigned → In Review → Completed |

**And the moves that must be refused, are.** Finance cannot reach Inspection Needed or Valuation
Prepared; Sell My Car cannot reach Referred to Finance Team; Dream Car cannot reach Inspection Needed;
nothing jumps from New straight to Completed; Completed and Converted have no way out. Spam, Rejected
and Cancelled *can* return to New, which is how a wrongly flagged enquiry is recovered. No status is
orphaned.

**Also executed, not just reviewed:**

- Both export generators produce real `.xlsx` and `.pdf` files; the header row lines up against the
  data, a row with every optional field empty renders as dashes rather than `null`, and the
  autofilter covers exactly the header plus the data.
- The valuation and matching schemas, 15 cases: both refusal rules, the money bounds, and an expiry
  stamped at the end of the Dubai day rather than midnight UTC.
- The metrics arithmetic, 36 assertions: an empty window returning `null` rather than 0%, a reply
  back-dated before the enquiry arrived clamped rather than going negative, and a completed vehicle
  inspection counting as a follow-up that happened but **not** as a reply to the customer.
- The Phase 19 SQL in four scenarios, including a constraint carrying a value in use that is not in
  our known list — rebuilt without losing it, while still refusing junk.
- The workflow gate in TypeScript: the reopen path, terminal handling, same-status moves, and that an
  unreadable workflow does not freeze the module.

**Not tested by me, and needing a person:** the five workflows clicked through in a browser; photo
upload on a phone; keyboard-only navigation; a screen reader; both themes on a real device; and
notifications arriving for a second signed-in user. The batch READMEs carry the step-by-step lists.

---

## 7. Open items

Nothing here blocks using the module.

**One accessibility defect, needing your decision.** Every badge tone fails WCAG AA in **light**
theme — computed, not estimated:

| Tone | Light | Dark | AA needs |
|---|---|---|---|
| success | 1.75:1 | 8.87:1 | 4.5:1 |
| warning | 1.54:1 | 10.13:1 | 4.5:1 |
| danger | 2.42:1 | 6.52:1 | 4.5:1 |
| info | 2.26:1 | 6.82:1 | 4.5:1 |

`badge.tsx` uses Tailwind's `-400` shades on a 10% tint. Over a dark card that is fine; over a white
one the tint composites to near-white and the text is effectively invisible. The component was built
for the dark theme, which is the default.

I have **not** changed it. It is a shared component used by Inventory, Sales, Leads, Customers, Test
Drives and Reservations, Sprint 7 did not create it, and silently restyling six other modules inside
an enquiry sprint is not mine to do. The fix is small — deeper shades under the `.light` class, dark
mode untouched — and `badge-contrast-fix.md` in this batch has the exact classes and their verified
ratios. Say the word and it is a ten-minute change.

**Follow-up reminders are stored, not delivered.** `follow_up_due` is the one notification nothing
calls, because it is due at a *time* rather than in response to a click. The function is written and
callable with its de-duplication already decided; `docs/enquiry-notifications.md` has the query a
scheduled job needs.

**The metrics have no UI.** Computed and tested, displayed nowhere — which is what the plan asked for,
but it means that code is unreachable until you say where the figures should appear.

**Team notifications are capped at 50 recipients.** Fine now; at a hundred staff this wants a
per-location or per-role rule rather than a silent performance cliff.

**Photos from abandoned forms linger** under `drafts/` in the bucket. No scheduled cleanup yet;
`docs/enquiry-requests.md` has the query that finds them.

**Two environment variables are still unset:** `ENQUIRY_IP_SALT` and `ENQUIRY_ALLOWED_ORIGINS`.
Without the first, stored IP hashes are not usefully anonymous; without the second, origin checking
on the public form is off. Both matter before the form is live.

**Carried from Sprint 6, unchanged:** `docs/sprint-6-qa.md` and `docs/leads-sales-integration.md` were
never written; C1 global search (⌘K), C2 motion parity for Sprints 1–5, C4 route transitions, C5
count-up, C6 seven `<img>` → `<Image>` (the only remaining lint warnings), C7 per-module `error.tsx`
as a refinement over the admin-wide one. The unsaved-changes guard still misses sidebar clicks, the
same as add-car and add-customer — one change in the app shell fixes all three.

`public/logo.png` is now present, so that item is closed; both exports pick it up.

---

## 8. Before you go live

1. Run `docs/sprint-7-migration.sql` in order, then the permission check in
   `docs/enquiry-requests.md` section 1 — **if `enquiries.valuate` is not granted, the "Value it"
   button does not appear at all.**
2. Set `ENQUIRY_IP_SALT` and `ENQUIRY_ALLOWED_ORIGINS`.
3. Click through the five workflows and the mobile photo upload yourself.
4. Decide on the badge contrast fix.
5. Decide where the metrics should appear.
6. Tell me when to commit and push, and whether you want one commit per phase or one for the sprint.

---

## 9. What I could not verify here

`npm run build` cannot reach `fonts.googleapis.com` from my sandbox, so it fails on the font fetch.
With the font stubbed locally the whole app compiles and all 32 pages generate, including
`/admin/enquiries`, `/admin/enquiries/[id]`, `/admin/enquiries/new`, `/admin/enquiries/export` and
`/api/enquiries`. `app/layout.tsx` was restored byte-for-byte afterwards and is unchanged in what
ships. The build will work on your machine; it is an environment limit, not a code problem.

I also cannot run the real Supabase instance, so RLS was reviewed as policy SQL and verified by the
application-level checks above, not exercised against live data with real user sessions. Signing in as
a view-only user and confirming the write paths refuse is on the manual list.
