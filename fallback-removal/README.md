# Fallback removal — apply only after `sql/21` says SAFE

These seven files remove the role-name fallbacks from inventory, customers and leads.

**Do not apply them yet.** Run this first, in the Supabase SQL editor:

```
sql/21-sprint-11-fallback-preflight.sql
```

It is read-only and returns one row.

- **`SAFE TO REMOVE THE FALLBACKS`** → copy these files over your repo and deploy.
- **`STOP`** → the `problems` column names the key and the role. Fix that first. Applying
  these files while it says STOP takes that role's access away the moment the code deploys.

---

## Why there is a preflight rather than a question

Batch 2 moved three modules onto permission keys and left a fallback: if a key is absent
from `app_permissions`, the helper drops back to the old role-name array. That exists so
that deploying the code before running `sql/17` degrades to the previous behaviour instead
of locking every member of staff out of inventory, customers and leads at once.

Removing the fallback is only safe if the keys are really there and really granted, and I
can't see your database. Rather than ask and hope, `sql/21` answers it — including the case
I care most about: a role **renamed** since `sql/17` ran. `sql/17` matched roles by name,
and Phase 8 now lets you change them, so a rename is the most likely way this goes wrong.
The preflight names the key and the role when it happens.

---

## What changes

```
src/lib/supabase/module-permission-core.ts     the fallback itself, removed
src/lib/supabase/module-permissions.ts         the legacyRoles parameter, gone
src/lib/supabase/inventory-permissions.ts      arrays removed
src/lib/supabase/customer-permissions.ts       arrays removed
src/lib/supabase/lead-permissions.ts           arrays removed
src/lib/supabase/lead-notes-queries.ts         array removed
src/lib/supabase/customer-detail-queries.ts    array removed

checks/check-permission-grant-transcription.py REPLACED — see below
```

After this, a missing permission key means **access refused and logged**, not a silent
downgrade to role names. That is the correct behaviour for an authorisation system: a
permission that cannot be confirmed is a permission that is not held.

## The checker is replaced, not deleted

It used to keep the grants in `sql/17` and the fallback arrays in step. With the arrays
gone there is no second copy to compare — so it becomes the inverse check: **no
authorisation decision anywhere may be made on a role name.**

That is worth a build failure. Any check written as `roleName === "Inventory Manager"`
stops matching the first time somebody renames that role in the Phase 8 editor, silently,
with no error and no log — just a feature that quietly stops working for the person whose
job it is. Refusing to build with one in the tree is the cheapest way to stop it coming
back.

It distinguishes a role from a word that merely looks like one: `enquiry.enquiry_type ===
"Finance"` is an enquiry type, not a role, and an earlier version of this check flagged two
of those before it was narrowed to comparisons whose left-hand side mentions a role.

---

## This bundle was applied and verified before it was sent

Not just written. A scratch copy of the repository with these seven files in place:

- `tsc --noEmit` — clean
- `next build` — compiled successfully, every route present
- `npm test` — all 27 test files pass
- all 28 checkers pass, including the replacement one

And the replacement checker was mutation-tested: reintroducing a role-name array, a direct
`=== "Super Admin"` comparison, and an `.includes("Inventory Manager")` are each caught,
while the enquiry-type comparison correctly stays quiet.
