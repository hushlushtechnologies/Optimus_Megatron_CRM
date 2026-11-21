# Sprint 8 — Batch 4: Phases 8 & 9 (Create Form + Vehicle Targeting)

**What this gives you:** `/admin/offers/new` — a seven-section campaign form with a live
discount preview, and the targeting UI with a live count of how many vehicles a campaign
would actually cover.

Phases 8 and 9 ship together because the form can't be finished without the targeting step
sitting inside it.

---

## ⚠️ Apply the batches in order

Two files in here replace versions from **Batch 3**, which themselves replaced Batch 2's.
If you paste Batch 4 before Batch 3, you'll lose Batch 3's bulk actions.

| file | Batch 2 | Batch 3 | Batch 4 |
|---|---|---|---|
| `src/lib/validation/offers.ts` | ✓ | ✓ | **✓ use this one** |
| `app/admin/offers/actions.ts` | ✓ | ✓ | **✓ use this one** |

Batch 4's versions contain everything from 2 and 3 plus this batch's additions. If you've
already pasted Batch 3, just overwrite with these.

---

## 1. What to paste

13 files. **Seven new, six replace existing files.**

### New (7)

| file | what it is |
|---|---|
| `src/components/offers/offer-form.tsx` | the seven-section form |
| `src/components/offers/offer-target-picker.tsx` | Phase 9 — which vehicles, with the live count |
| `src/components/offers/offer-eligibility-builder.tsx` | which customers qualify |
| `src/components/shared/form-section.tsx` | the numbered step — see §2 |
| `src/lib/utils/offer-form-preview.ts` | the preview arithmetic, pure and tested |
| `src/lib/utils/offer-rule-values.ts` | rule values → jsonb, including AED→fils |
| `app/admin/offers/new/page.tsx` | the route |

### Replacing (6)

| file | what changed |
|---|---|
| `app/admin/offers/actions.ts` | + targeting preview, car search; rule values now shaped server-side |
| `src/lib/validation/offers.ts` | + `targetPreviewSchema`, `carSearchSchema` |
| `src/lib/supabase/offer-queries.ts` | + `countTargetedVehicles`, `searchCarsForTargeting`; **`TargetSelection` renamed** (§3) |
| `src/lib/utils/offer-rules.ts` | `discountForPrice` takes a narrower type (§3) |
| `src/lib/types/customer.ts` | + `CUSTOMER_LIFECYCLE_STATUSES` (§2) |
| `src/components/enquiries/form/enquiry-form-section.tsx` | **now a 4-line re-export** (§2) |

Then:

```bash
npx tsc --noEmit        # clean
npm run dev
```

No SQL in this batch.

---

## 2. Three files outside the offers module

I touched Sprint 2–7 code in three places. All three are additive; `tsc` across the whole
repo is clean. Here's exactly what and why, so you can reverse any of them if you'd rather.

**`src/components/shared/form-section.tsx` + `enquiry-form-section.tsx`**
Your enquiry form already had a numbered-step component that was precisely what the offer
form needed. Rather than copy it, I moved the implementation to `shared/` and left
`enquiry-form-section.tsx` as a four-line re-export under the old names. **Nothing in
`new-enquiry-form.tsx` changed** — it was the only importer, and it still compiles through
the shim. If you'd rather not have the indirection, paste `shared/form-section.tsx` and
leave the enquiry file alone; the offers form imports the shared one directly.

**`src/lib/types/customer.ts`**
Added one exported const at the end of the file:

```ts
export const CUSTOMER_LIFECYCLE_STATUSES = [
  "Prospect", "Active", "VIP", "Inactive", "Do Not Contact",
] as const satisfies readonly CustomerProfile["lifecycle_status"][];
```

The eligibility builder needs these values in a dropdown. That list was already hardcoded in
three files — `customer-filter-drawer.tsx`, `customer-table.tsx`,
`add-customer-form.tsx` — and I didn't want to make a fourth copy. Those three are
untouched; they can be pointed at this whenever they're next edited. The `satisfies` clause
ties the list to the type, so adding a status to one and not the other becomes a compile
error rather than a dropdown that quietly misses an option.

This is also why there's no "VIP" checkbox in the eligibility builder: VIP is one value of
`lifecycle_status` in your schema, not a boolean. Hard-coding a VIP flag would be a second
customer tagging system the moment somebody wants "Gold".

---

## 3. Two renames you'd otherwise hit as type errors

**`TargetSelection` changed shape.** It was `{ kind, id }`; it's now
`{ targetKind, targetId }`.

While wiring the targeting picker into the form I found the picker was producing
`{ kind, id }` while `upsertPromotionSchema` expects `{ targetKind, targetId }` — two
spellings of one payload, which is how Sprint 7's trade-in fields went missing. Zod would
have rejected it loudly rather than silently, but one shape end-to-end is better than a
mapping step nobody remembers. The names now match the database columns.

**`discountForPrice` takes less.** It wanted a whole `Promotion` (18 fields) but reads
three. It now takes `DiscountInputs = Pick<Promotion, "discountType" | "discountValue" |
"maxDiscountFils">`. A full `Promotion` still satisfies it, so every existing caller is
unchanged. This is what lets the form's preview call the *actual engine function* rather
than reimplementing the maths — which matters, because a preview that rounds differently
from the engine is a preview that lies.

---

## 4. What to try

Open `/admin/offers/new`.

| do this | expect |
|---|---|
| Type a name | Section 1's circle becomes a tick |
| Set 15% and leave the example price at 250,000 | Preview: AED 250,000 → 212,500, saving 37,500 |
| Add a max discount of 20,000 | Preview caps at 20,000 and says it was capped |
| Set a minimum price of 300,000 | "This price is below the minimum you set" |
| Open **Which vehicles** → Brands, tick two | Count updates: "Covers 7 of 184 vehicles in stock" |
| Tick a brand with no stock | Amber box: "matches no vehicles in stock… would publish and then do nothing" |
| Untick everything | "Covers all 184 vehicles in stock" |
| Open **Specific vehicles**, type 2 characters | Searches stock server-side, 20 results max |
| Open **Who qualifies** → Add a rule | Six rule kinds; changing the kind clears the value |
| Add "Lifetime spend" → type 50000 | Stored as 5,000,000 fils — the conversion is server-side |
| Set an end date before the start | "This is before the start", publish disabled |
| Fill things in, then hit browser back/refresh | Browser warns about unsaved changes |
| Fill things in, then Cancel | "Leave without saving?" |
| **Save and publish** | Confirms first, naming whether it covers all stock or your targets |

If you don't hold `offers.publish`, there's no publish button — just "Save as draft", plus a
line in section 7 explaining why. And if you somehow submit a publish anyway, the server
saves it as a draft and the toast says so rather than silently publishing or silently
failing.

---

## 5. Decisions worth knowing

**1. Vehicle targeting is OR. Customer eligibility is AND.** Both are written on screen in
those words. A vehicle qualifies if it matches *any one* target; a customer must satisfy
*every* rule. Those produce very different audiences and nobody should have to guess which
one they just built.

**2. The count is honest about being a snapshot.** It says "Counted now. It changes as stock
arrives and sells — the campaign isn't pinned to these 7." Because it isn't: targeting is by
brand/model/collection/location, so tomorrow's arrivals are included automatically.

**3. Zero matches is a warning, not an error.** You can still save and publish it — stock
might be on its way. But it says plainly that the campaign "would publish and then do
nothing", because a campaign that looks live and isn't is worse than one that won't save.

**4. Money conversion happens on the server.** The lifetime-spend rule is typed in dirhams
and stored in fils. That conversion is in `offer-rule-values.ts`, called from the action —
not in the form. A client that converted money itself would be a client deciding a money
value.

**5. Both buttons build the payload the same way.** One `payloadFor(status)` function, and
the only difference between draft and publish is the `status` field. Two payload builders is
how a field gets into one path and not the other.

**6. Points multiplier is in the form, and says it does nothing yet.** The database column
and the schema both carry it, so leaving it out of the form would make double-points
campaigns unreachable through the UI. It's there with a note that loyalty is switched off
until Phase 17 configures it. (I only noticed it was missing because a check script caught
it — see below.)

---

## 6. How this was checked

**`checks/check-offer-payload.py`** — this is the Sprint 7 trade-in bug written as a test.
It parses `upsertPromotionSchema` and the form's payload builder and asserts they match in
both directions: every schema field is sent, nothing is sent that isn't in the schema, and
**nothing the form collects fails to reach the payload**. That last one is the actual Sprint
7 failure: `tradeInVehicle` and `dreamCar` were collected, never sent, both `.optional()`,
so `tsc` passed and every answer the customer typed was dropped.

It found two things on first run. One was a parser bug of mine. The other was real:
`pointsMultiplier` existed in the schema and the database but had no field in the form. Now
wired end to end.

I then mutation-tested it — deleted `targets` from the payload, and added a second inline
payload that could drift from the first. It caught both, and named the Sprint 7 bug by name
for the first one.

**`checks/audit-offers-security.py`** — 21 checks from the lines in your brief. Mutation-
tested too: I broke four things deliberately and it caught three. The fourth was a false
pass — my "unknown rules fail closed" check used a regex that matched any `return false`
anywhere in the file, so flipping a default to `true` still passed. Now it checks *every*
switch default individually and catches both of the engine's defaults by line number.

**`checks/check-offer-filters.py`** — all six list filters still survive the round trip.

**Tests — 102 assertions across four suites:**

```bash
npx tsx tests/rule-value-test.mts      # 23 — rule values, including AED→fils
npx tsx tests/form-preview-test.mts    # 24 — the preview arithmetic
```

(The 34 engine + 21 campaign-window assertions are in the Batch 1 and 2 zips.)

One of those 24 caught me out. I expected 7.5% of AED 199,999.99 to be 1,499,999 fils; it's
1,500,000. The exact figure is 1,499,999.925 and the engine rounds half-up — so a tenth of a
fil goes the customer's way. **The code was right and my expectation was wrong.** That's the
fourth time across these two sprints that my test expectation was the error, which is the
argument for writing the arithmetic out longhand rather than eyeballing it.

Also ran: `tsc` clean, `eslint` clean on everything new, `next build` compiles with both
`/admin/offers` and `/admin/offers/new` present.

Two lint rules bit during this batch, both real: `react-hooks/set-state-in-effect` (calling
`setState` synchronously in an effect body — fixed by moving the calls inside the debounce
timers, which also stops the spinner flickering on every keystroke) and `react-hooks/refs`
(I'd used a ref for the unsaved-changes baseline and read it during render — it's state, and
a ref would have left the "Unsaved changes" line stale).

---

## 7. Where we are

| batch | phases | status |
|---|---|---|
| 1 | 2–4 | ✅ migrations + rules engine |
| 2 | 5–6 | ✅ components + dashboard |
| 3 | 7 | ✅ promotions table |
| **4** | **8–9** | **✅ this zip — create form + targeting** |
| 5 | 10–14 | next — customer offers, segments, coupon codes, detail page, lifecycle |
| 6 | **15–16** | **inventory + sales pricing integration — on its own** |
| 7 | 17–22 | loyalty settings, wallet, earn, redeem, adjustments, customer profile |
| 8 | 23–26 | notifications, audit, exports, security review, testing, docs |

The admin surface for campaigns is now complete: you can create one, target it, schedule it,
publish it, find it, filter it, pause it and archive it.

**Batch 6 (Phases 15–16) is the one that changes how prices are calculated.** Everything so
far has been additive — new tables, new screens, one derived column. That batch touches the
path a real deal is priced through, which is why it's on its own with nothing else in it.

---

## 8. Still waiting on you

**1. The loyalty numbers** (needed before Phase 17): points per AED spent, and what one
point is worth in fils when redeemed. The database refuses to enable loyalty without both.

**2. Is anything live in Supabase?** Fourth time asking. It decides whether Phases 15–16
need to be reversible in a hurry, and that's the batch where it matters.

**3. Did Batch 1's migration commit?** If it errored on `created_at`, run
`03-promotions-created-at.sql` from Batch 3 first, then re-run `01`.

---

## 9. Still open from Sprint 7

- Three dead files to delete: `enquiry-filter-bar.tsx`, `enquiry-export-menu.tsx`,
  `app/admin/enquiries/new/export/`
- Badge contrast — every tone fails WCAG AA in light theme (warning 1.54:1); fix documented
  in `badge-contrast-fix.md`, touches shared `badge.tsx`, your call
- `ENQUIRY_IP_SALT` and `ENQUIRY_ALLOWED_ORIGINS` env vars
- Follow-up-due notifications need a scheduled job
