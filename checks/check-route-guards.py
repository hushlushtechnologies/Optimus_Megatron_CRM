#!/usr/bin/env python3
"""
The layout that gates the admin area must exist and must still gate it.

WHY THIS CHECK EXISTS

`app/admin/layout.tsx` went missing from the Sprint 10 branch. It was almost
certainly a copy-paste accident while applying a batch — the kind of thing
that happens when folders are replaced rather than merged — and it did two
jobs:

  1. rendered AdminShell, which is the sidebar
  2. redirected to /login when nobody is signed in, and refused a signed-in
     user with no role

The missing sidebar is how it was noticed. The missing sign-in check is the
part that mattered: in Next.js App Router a layout is the only thing wrapping
every page in its segment, so deleting it does not break a build, does not
fail a type check, and does not raise a single warning. Every page under
/admin simply stops being behind a login.

Twenty-three checkers, 88 test assertions and a clean production build all
passed on a tree with no authentication on the admin area. Nothing was
looking at whether the guard still existed, because nothing imports it —
Next.js finds it by filename.

That is the gap this closes. A guard that is wired up by file location rather
than by an import cannot be protected by a type checker, so it needs a script
that knows the file is supposed to be there.

WHAT IT CHECKS

For each guarded segment below:

  1. the layout file exists
  2. it redirects somewhere when there is no signed-in user
  3. it renders the shell component that holds the navigation

It deliberately does not try to prove the guard is CORRECT — only that it is
present and still doing the two things it was there for. A check that tried
to verify the whole authorization model would be the kind that nobody trusts.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

GUARDED = [
    {
        "layout": "app/admin/layout.tsx",
        "segment": "/admin",
        "shell": "AdminShell",
        "why": "every admin page, including every settings page, sits inside this segment",
    },
]

# A nested layout that must NOT be mistaken for the segment guard. Sprint 10
# added app/admin/settings/layout.tsx, which filters settings pages by
# permission — useful, but it runs INSIDE the admin layout and does no
# sign-in check of its own. If somebody deletes the outer one and keeps this,
# the settings pages still look guarded and are not.
NESTED_NOT_A_GUARD = "app/admin/settings/layout.tsx"


def function_body(text, name):
    """
    The source of one exported function, from its signature to the next
    top-level export or the end of the file.

    Deliberately crude — it only has to be tight enough that a sibling
    function's code does not count as this one's.
    """
    start = re.search(rf"export\s+(?:async\s+)?function\s+{re.escape(name)}\b", text)
    if not start:
        return None

    rest = text[start.end() :]
    nxt = re.search(r"\nexport\s", rest)
    return rest[: nxt.start()] if nxt else rest


# Gate helpers a guarded layout is allowed to delegate to, and the file each
# one must live in. Adding a name here is a deliberate act: the helper is then
# checked for reading the signed-in user itself.
DELEGATES = [
    ("currentStaffGate", "src/lib/supabase/staff-permissions.ts"),
]


def main():
    problems = []
    passed = []

    for guard in GUARDED:
        path = ROOT / guard["layout"]

        if not path.exists():
            problems.append(
                f'{guard["layout"]} does not exist. Nothing is gating {guard["segment"]} — '
                f'{guard["why"]}. Restore it from the last commit that had it: '
                f'git checkout <ref> -- {guard["layout"]}'
            )
            continue

        text = path.read_text(encoding="utf-8", errors="replace")

        # 2. a redirect when there is no user
        #
        # The layout may read the user itself, or delegate to a named gate
        # helper. Delegation is followed one level: the helper must exist and
        # must itself read the user, and the layout must still own the
        # redirect. Accepting the mere presence of a call would turn this
        # check into "does the file mention a function", which is how a guard
        # check stops guarding anything.
        has_user_read = bool(re.search(r"auth\.getUser\(\)|getUser\(\)", text))

        if not has_user_read:
            for helper_name, helper_rel in DELEGATES:
                if not re.search(rf"\b{helper_name}\s*\(", text):
                    continue

                helper_path = ROOT / helper_rel
                if not helper_path.exists():
                    problems.append(
                        f'{guard["layout"]} delegates its gate to {helper_name}(), but '
                        f"{helper_rel} does not exist."
                    )
                    break

                helper_text = helper_path.read_text(encoding="utf-8", errors="replace")
                body = function_body(helper_text, helper_name)

                if body is None:
                    problems.append(
                        f'{guard["layout"]} delegates its gate to {helper_name}(), but no '
                        f"function by that name is exported from {helper_rel}."
                    )
                    break

                # Scoped to that function's own body, not the whole file. The
                # first version searched the file, and staff-permissions.ts
                # happens to contain two functions that read the user — so
                # gutting the one the layout actually calls left the other's
                # call behind to satisfy the check.
                if re.search(r"auth\.getUser\(\)", body):
                    has_user_read = True
                else:
                    problems.append(
                        f'{guard["layout"]} delegates its gate to {helper_name}() in '
                        f"{helper_rel}, but that function never reads the signed-in user. "
                        f"Every page under {guard['segment']} would be reachable without signing in."
                    )
                break

        has_redirect = re.search(r"redirect\(\s*[\"'`]/login", text)

        # A layout that delegates must also BRANCH on what it gets back.
        # Reading the gate and ignoring it is the same as having no gate, and
        # it is the quieter failure of the two: everything still renders.
        if re.search(r"\bcurrentStaffGate\s*\(", text):
            # Specifically the "anything other than ok" branch. An earlier
            # version also accepted `state === "<anything but ok>"`, which the
            # signed-out redirect satisfies on its own — so deleting the branch
            # that stops suspended accounts still looked fine.
            acts_on_state = re.search(r"state\s*!==\s*[\"']ok[\"']", text)
            if not acts_on_state:
                problems.append(
                    f'{guard["layout"]} calls currentStaffGate() but never branches on the '
                    f"state it returns, so a suspended, deactivated or role-less account would "
                    f"reach every page under {guard['segment']}."
                )
        if not (has_user_read and has_redirect):
            missing = []
            if not has_user_read:
                missing.append("it never reads the signed-in user")
            if not has_redirect:
                missing.append("it never redirects to /login")
            problems.append(
                f'{guard["layout"]} exists but no longer gates the segment: '
                f'{"; ".join(missing)}. Every page under {guard["segment"]} would be '
                f"reachable without signing in."
            )
            continue

        # 3. the shell, which is the navigation.
        #
        # Looking for the JSX element, not the name. A bare substring match
        # also matches the import line, so a layout that still imports
        # AdminShell and renders a plain <div> around the children would pass
        # — found by mutation-testing this script, which is exactly the shape
        # of the accident it exists to catch.
        if not re.search(r"<" + re.escape(guard["shell"]) + r"[\s>]", text):
            problems.append(
                f'{guard["layout"]} no longer renders {guard["shell"]}, so the sidebar '
                f'will not appear on any page under {guard["segment"]}.'
            )
            continue

        passed.append(f'{guard["layout"]} gates {guard["segment"]} and renders {guard["shell"]}')

    # The nested settings layout must not be the only thing present.
    nested = ROOT / NESTED_NOT_A_GUARD
    if nested.exists() and not (ROOT / "app/admin/layout.tsx").exists():
        problems.append(
            f"{NESTED_NOT_A_GUARD} exists but app/admin/layout.tsx does not. The nested "
            f"layout filters settings pages by permission and does NO sign-in check, so "
            f"the settings pages look guarded and are not."
        )

    print("=" * 70)
    print("ROUTE GUARDS — THE LAYOUTS THAT GATE A SEGMENT")
    print("=" * 70)
    print()

    for item in passed:
        print(f"  ok   {item}")

    if problems:
        print()
        for problem in problems:
            print(f"  FAIL  {problem}")
        print(f"\n{len(problems)} problem(s).")
        return 1

    print("\nEvery guarded segment still has its guard.")
    print("\nA layout is wired up by filename, not by an import, so nothing else in")
    print("this suite would notice it going missing — not tsc, not the build.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
