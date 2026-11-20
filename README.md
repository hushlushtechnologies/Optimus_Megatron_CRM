# Sprint 7 — Batch 4 (Phases 21 and 22)

The review, the testing, the documentation, and the completion report.

**Start with `SPRINT-7-COMPLETION-REPORT.md`.** This file is just what to do with the contents.

---

## What is in here

| | |
|---|---|
| `SPRINT-7-COMPLETION-REPORT.md` | The sprint, end to end: what was built, the decisions, the bugs, what is open |
| `code/` | **Two files to paste** — one fix and one cleanup |
| `docs/` | Three documentation files for `docs/` in your repo |
| `badge-contrast-fix.md` | An accessibility fix I did **not** apply. Your decision |
| `checks/` | The eight scripts behind every verification claim in the report |

---

## 1. Three code files to paste

Small, and all three worth having.

**`src/lib/utils/enquiry-workflow.ts`** — a fix. For a Completed enquiry the status control said
*"Reopen it first if it needs more work"*, and there is no reopen path from Completed. It named a door
that was not there. It now names the real options when there are some, and says plainly there is no
way back when there are none:

| From | Message now |
|---|---|
| Completed | "This enquiry is Completed, which is where it finishes. There's no way back from here." |
| Spam | "This enquiry is Spam. From here it can only go to New." |
| Assigned | "A General enquiry can't go from Assigned to Completed. It can go to In Review." |

**`src/components/enquiries/enquiry-valuation-form.tsx`** — two contrast fixes to my own work, found
by computing the ratios. In light theme the "· expired" text on a valuation read at 3.44:1 where text
needs 4.5:1; it now uses weight instead of colour, so nothing depends on seeing a colour to know an
offer has lapsed. The warning icon beside it was 2.09:1 against its own tint, below even the 3:1 a
graphical object needs, and now inherits the readable colour — it is decorative and the text says the
same thing.

**`src/components/shared/notifications-dropdown.tsx`** — a cleanup. It carried a dead local copy of
the notification routing logic: eleven lines, hardcoded paths, no `enquiry` entry, and unused since
the shared helper took over. Left alone it is a trap — the next person to add a notification type
edits the dead copy and wonders why nothing happens. Removed. It was the last lint warning that was
not the known `<img>` item.

Then:

```bash
npx tsc --noEmit
npm run lint
```

---

## 2. Three documentation files

Copy into `docs/`, alongside the test-drive docs they are written to match.

| File | What it is |
|---|---|
| `docs/enquiry-requests.md` | Operations guide: permissions, configuring the workflow in SQL, archive, audit history, media, the public form, export |
| `docs/enquiry-notifications.md` | The six notifications, the reasoning behind each, and **the query a scheduled job needs for follow-up reminders** |
| `docs/sprint-7-migration.sql` | All four SQL scripts in the order they must run, with a header explaining the one place order matters |

There is no `PROJECT_CONTEXT.md` in the repo, so that part of the plan did not apply. `README.md` is
still the stock Next.js boilerplate — say if you want a real one and I will write it.

---

## 3. The accessibility fix I did not apply

`badge-contrast-fix.md`.

Every badge tone fails WCAG AA in **light** theme — success 1.75:1, warning 1.54:1, danger 2.42:1,
info 2.26:1, where 4.5:1 is needed. Dark theme is fine (6.5–10:1). The component uses Tailwind's
`-400` shades, which are built for dark backgrounds; over a white card the tint composites to
near-white and the text has nothing to contrast against.

I have not changed it, because `badge.tsx` is shared by Inventory, Sales, Leads, Customers, Test
Drives and Reservations, and Sprint 7 did not create it. Restyling five other modules inside an
enquiry sprint is not a decision I should make quietly.

The file has the exact classes, the resulting ratios, and why `-600` is not enough for three of the
four tones. It is a ten-minute change when you want it.

---

## 4. The checks

Eight scripts. Every verification claim in the completion report comes from one of them, so you can
re-run any of them rather than take my word.

```bash
cd checks
python3 -I audit-security.py        # 18 security properties
python3 -I audit-a11y.py            # labels, icons, tap targets, reduced motion
python3 -I audit-contrast.py        # WCAG ratios for the design tokens, both themes
python3 -I badge-contrast.py        # the badge finding above
python3 -I check-payloads.py        # every form sends every field its schema wants
python3 -I check-link-columns.py    # cross-module column names are real
python3 -I check-notifications.py   # every notification has an icon and a route
python3 -I check-promise-all.py "app/admin/enquiries/[id]/page.tsx"
```

They hardcode the repo path at `/home/claude/hushlushtechnologies/optimus_megatron_crm` — change the
`REPO` line at the top of each to point at yours.

These exist because of the Trade-In bug in Phase 10: a payload missing two optional fields, which
`tsc` could not see and which silently discarded everything the customer typed. Each of these checks
has since caught something real. The notification one caught that **every enquiry notification would
have been unclickable** — they would have arrived looking perfectly correct and gone nowhere.

---

## 5. What still needs a person

I cannot click, so these are yours. The step-by-step versions are in the batch 2 and 3 READMEs.

- The five workflows, clicked through end to end in a browser.
- Photo upload from a phone.
- Keyboard-only navigation, and a screen reader pass.
- Both themes on a real device.
- Notifications arriving for a second signed-in user.
- Signing in as a view-only user and confirming the write paths refuse.

RLS was reviewed as policy SQL and backed by the application-level checks, but not exercised against
live data with real user sessions.

---

## 6. Before the module goes live

1. Run `docs/sprint-7-migration.sql`, then the permission check in `docs/enquiry-requests.md`
   section 1. **If `enquiries.valuate` is not granted, the "Value it" button does not appear at all** —
   that is the permission working, not a bug.
2. Set `ENQUIRY_IP_SALT` and `ENQUIRY_ALLOWED_ORIGINS`. Without the first, stored IP hashes are not
   usefully anonymous; without the second, origin checking on the public form is off.
3. Decide on the badge contrast fix.
4. Tell me where the metrics should appear — they are computed and tested but displayed nowhere, which
   is what the plan asked for, and means that code is unreachable until you say.
5. Follow-up reminders need a scheduled job before anybody relies on them. The query is in
   `docs/enquiry-notifications.md`.

---

## 7. Sprint 7 is complete

22 phases of 22. Nothing has been committed or pushed — that needs your approval, and I have not
touched git.

When you want it committed, tell me whether you would like one commit per phase or one for the
sprint, and whether to open a pull request.
