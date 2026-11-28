#!/usr/bin/env python3
"""
Every server action that writes must check a permission first.

THE SWEEP THIS IS FOR

Sprint 11 Phase 10 asks for an enforcement sweep: find the places where a
permission check is missing rather than assuming ten sprints of actions all
have one. A server action is a public HTTP endpoint. Anybody with a session can
call any exported action in the application, with any arguments, from a
console. The form that normally calls it is not a gate, the page it lives on is
not a gate, and neither is the fact that no button is rendered.

So a "use server" file whose functions write to the database and never ask
whether the caller is allowed to is an unauthenticated-ish write endpoint for
every member of staff, whatever their role.

WHAT COUNTS AS A WRITE

An .insert(, .update(, .delete(, .upsert( or an .rpc( call. RPC counts because
a security-definer function is exactly the kind of thing worth guarding, and
because this codebase does most of its privileged writes that way.

WHAT COUNTS AS A CHECK

A call to one of the project's permission helpers (assertCan*, require*,
current*Access, begin*Action, has*Permission), or an auth.getUser() followed by
a refusal. The list is explicit rather than a pattern, so adding a new helper
is a deliberate edit here.

WHAT IS ALLOWED THROUGH, AND WHY

  - actions that only read
  - the invitation accept action, whose authorisation IS its token: it is
    listed by name below, because "a public write endpoint" is the point of it
  - sign-in and sign-out

EXIT 1 on any unguarded writing action. A finding here is not a style note.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

SCANNED = [ROOT / "app", ROOT / "src"]

WRITE_CALL = re.compile(r"\.(insert|update|delete|upsert|rpc)\s*\(")

def discover_guards() -> set[str]:
    """
    The project's permission helpers, read out of the permission modules.

    Hand-writing this list was the first version and it was wrong within one
    run: it had beginSalesAction and not beginOfferAction, so forty perfectly
    well guarded actions in offers and enquiries were reported as unguarded.
    Forty false positives is how a check gets switched off, and a switched-off
    check is where the real one hides.

    So the list is derived. Every exported function in a *permission*.ts module
    counts as a guard, which means adding a new helper cannot silently fall
    outside this check.

    Functions that only READ a permission set without refusing anything are
    excluded by name below — they answer "what may this person do" for the
    benefit of a screen, and an action that calls one and then writes anyway
    has not checked anything.
    """
    guards: set[str] = set()

    for path in sorted((ROOT / "src" / "lib" / "supabase").glob("*permission*.ts")):
        text = path.read_text(encoding="utf-8", errors="replace")
        guards.update(re.findall(r"export\s+(?:async\s+)?function\s+(\w+)", text))

    # ---------------------------------------------------------------
    # Two sets, not one.
    #
    # The SEED is every permission-module export, read-only lookups included,
    # because a gate is usually built on top of a lookup: beginTestDriveAction()
    # refuses based on getMyTestDrivePermissions(). Pruning the lookups from the
    # seed left the propagation below with nothing to grow from, and eleven
    # guarded test-drive actions were reported as unguarded a second time.
    #
    # The ACTION-LEVEL set is what an action must call. A lookup is not a check:
    # an action that asks "what may this person do" and then writes regardless
    # has checked nothing.
    # ---------------------------------------------------------------
    seed = set(guards)

    read_only = {
        "visibleCategories",
        "visiblePages",
        "canOpenSection",
        "canOpenSettingsPage",
        "listTestDriveHosts",
        "isEligibleTestDriveHost",
        "ifFinancial",
        "getMySalesPermissions",
        "getMyOfferPermissions",
        "getMyEnquiryPermissions",
        "getMyTestDrivePermissions",
    }

    guards -= read_only

    # ---------------------------------------------------------------
    # Second pass: gates that wrap a gate.
    #
    # beginTestDriveAction() lives in test-drive-action-helpers.ts, not in a
    # *permission*.ts module, and it is unmistakably a gate: it calls a
    # permission helper and refuses. The first version of this script missed it
    # and reported eleven well-guarded test-drive actions as unguarded.
    #
    # So the set is grown to a fixed point, but only through REFUSAL-SHAPED
    # names — begin*, require*, assert*, ensure*, or anything with Guard in it.
    # Propagating through every function that merely touches a permission
    # helper would sweep in the display-only lookups that decide whether to
    # draw a button, and an action that calls one of those and then writes has
    # not checked anything.
    # ---------------------------------------------------------------
    refusal_shaped = re.compile(r"^(begin|require|assert|ensure)[A-Z]|Guard")

    sources: list[tuple[str, str]] = []
    for directory in (ROOT / "src", ROOT / "app"):
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*.ts")):
            if "node_modules" in str(path):
                continue
            sources.append((str(path), path.read_text(encoding="utf-8", errors="replace")))

    for _ in range(4):  # a fixed point; four levels is far more than this code uses
        before = len(guards)
        reachable = seed | guards
        call_pattern = re.compile(r"\b(" + "|".join(sorted(re.escape(n) for n in reachable)) + r")\s*\(")

        for _path, text in sources:
            for match in re.finditer(r"export\s+(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=)", text):
                name = match.group(1) or match.group(2)
                if not name or name in guards or not refusal_shaped.search(name):
                    continue

                rest = text[match.end() :]
                nxt = re.search(r"\nexport\s", rest)
                body = rest[: nxt.start()] if nxt else rest

                if call_pattern.search(body):
                    guards.add(name)

        if len(guards) == before:
            break

    if not guards:
        raise SystemExit(
            "check-action-permission-guards: found no permission helpers at all. "
            "Either the permission modules moved or this script's glob is wrong — "
            "either way it cannot judge anything, so it fails rather than passing."
        )

    return guards


GUARD_NAMES = discover_guards()
GUARD_CALL = re.compile(r"\b(" + "|".join(sorted(re.escape(name) for name in GUARD_NAMES)) + r")\s*\(")

# A refusal that depends on the signed-in user, for actions that do their own
# check rather than calling a helper.
OWN_CHECK = re.compile(r"auth\.getUser\(\)")

# Files whose authorisation is deliberately something other than a permission
# key. Each one needs a reason, and the reason is in the file.
ALLOWED_WITHOUT_GUARD = {
    # The invitation token IS the authorisation. See the file's header.
    "app/invite/[token]/actions.ts",
    # Signing in cannot require being signed in.
    "app/login/actions.ts",
    "app/logout/actions.ts",
}

problems: list[str] = []
checked = 0
read_only = 0


def is_server_action_file(text: str) -> bool:
    """A "use server" directive at the top, possibly under a comment block."""
    return bool(re.match(r'^\s*(?://[^\n]*\n|/\*[\s\S]*?\*/\s*|\s)*["\']use server["\']', text))


def exported_functions(text: str) -> list[tuple[str, int]]:
    """Exported async functions, with the offset each one starts at."""
    return [
        (match.group(1), match.start())
        for match in re.finditer(r"export\s+async\s+function\s+(\w+)", text)
    ]


def function_source(text: str, start: int) -> str:
    """
    One function's body: from its declaration to the NEXT declaration of any
    kind, exported or not.

    The first version stopped only at the next *exported* function, so a
    read-only action followed by a private helper swallowed that helper's body
    — and getLeadFollowUpsAction(), which does nothing but return a query, was
    reported as an unguarded insert because the private logFollowUpActivity()
    below it has one.
    """
    rest = text[start:]
    nxt = re.search(
        r"\n(?:export\s+)?(?:async\s+)?function\s+\w|\n(?:export\s+)?const\s+\w+\s*=\s*(?:async\s*)?\(",
        rest[1:],
    )
    return rest[: nxt.start() + 1] if nxt else rest


def local_guards(text: str, known: set[str]) -> set[str]:
    """
    Refusal-shaped helpers declared inside this file that call a known guard.

    archiveLeadNote() is guarded by assertCanModifyLeadNote(), a private
    function in the same file. Only looking at exported functions missed it and
    reported a guarded action as unguarded.
    """
    found: set[str] = set()
    pattern = re.compile(r"\b(" + "|".join(sorted(re.escape(n) for n in known)) + r")\s*\(")
    refusal_shaped = re.compile(r"^(begin|require|assert|ensure)[A-Z]|Guard")

    for match in re.finditer(r"(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(", text):
        name = match.group(1) or match.group(2)
        if not name or not refusal_shaped.search(name):
            continue
        if pattern.search(function_source(text, match.start())):
            found.add(name)

    return found


def main() -> int:
    global checked, read_only

    for directory in SCANNED:
        if not directory.exists():
            continue

        for path in sorted(directory.rglob("*.ts")):
            if "node_modules" in str(path):
                continue

            text = path.read_text(encoding="utf-8", errors="replace")
            if not is_server_action_file(text):
                continue

            relative = str(path.relative_to(ROOT))
            if relative in ALLOWED_WITHOUT_GUARD:
                continue

            # Private gates in this file count too.
            file_guards = GUARD_NAMES | local_guards(text, GUARD_NAMES)
            file_pattern = re.compile(
                r"\b(" + "|".join(sorted(re.escape(n) for n in file_guards)) + r")\s*\("
            )

            for name, start in exported_functions(text):
                body = function_source(text, start)

                if not WRITE_CALL.search(body):
                    read_only += 1
                    continue

                checked += 1

                if file_pattern.search(body) or OWN_CHECK.search(body):
                    continue

                line = text[:start].count("\n") + 1
                write = WRITE_CALL.search(body)
                problems.append(
                    f"{relative}:{line}  {name}() writes ({write.group(1)}) with no permission check. "
                    f"A server action is a public endpoint — any signed-in user can call it directly."
                )

    if problems:
        print("check-action-permission-guards: FAIL")
        for problem in problems:
            print(f"  - {problem}")
        print()
        print("Add a check from the project's helpers, or if the action is")
        print("deliberately open, list it in ALLOWED_WITHOUT_GUARD with a reason.")
        return 1

    print(
        f"check-action-permission-guards: ok "
        f"({checked} writing action(s) guarded, {read_only} read-only action(s) skipped)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
