#!/usr/bin/env python3
"""
No authorisation decision is made on a role NAME any more.

THE INVERSE OF WHAT THIS FILE USED TO DO

Before Batch 5 this script kept two copies of the same rule in step: the grants
in sql/17 and the role-name fallback arrays in the helpers. Batch 5 removed the
fallbacks, so there is no longer a second copy to compare — and the useful
check becomes the opposite one: make sure the arrays do not come back.

WHY THAT IS WORTH A BUILD FAILURE

Phase 8 lets an administrator rename a role. Every authorisation decision
written as `roles.name === "Inventory Manager"` stops matching the first time
somebody does, and it fails OPEN or CLOSED silently — no error, no log, just a
feature that quietly stops working for the person whose job it is. That is the
bug this whole sprint was arranged around, and the cheapest way to stop it
returning is to refuse to build with one in the tree.

WHAT IT LOOKS FOR

A role name from the known set, in a file that makes authorisation decisions,
used in a comparison or a membership test. Not mentions in comments, not the
seed list in sql/16 (which is where names are allowed, once, before anybody can
rename anything), and not display strings.

Exit 1 on any finding.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Where an authorisation decision could be made.
SCANNED = [ROOT / "app", ROOT / "src"]

# Files allowed to know role names, each for a stated reason.
ALLOWED = {
    # The canonical list of role names, for seeding and for display. It makes
    # no decisions itself.
    "src/lib/permissions/roles.ts",
}

ROLE_NAMES = [
    "Super Admin",
    "Admin",
    "Manager",
    "Sales Executive",
    "Finance",
    "Inventory Manager",
    "Content Manager",
    "Viewer",
]

NAMES = "|".join(re.escape(n) for n in ROLE_NAMES)

# A name used in a decision ABOUT A ROLE.
#
# The left-hand side has to mention a role, because several of these words are
# not only role names. "Finance" is also an enquiry type, and the first version
# of this check flagged `enquiry.enquiry_type === "Finance"` in two files as
# role-name authorisation. Matching the string alone cannot tell a role from a
# category that happens to share a word.
ROLEISH = r"[A-Za-z_.\[\]\"']*[Rr]ole[A-Za-z_.\[\]\"']*"

# Built from a list and joined, rather than as a run of adjacent literals:
# Python will implicitly concatenate two string literals across a newline, but
# not a variable and a literal, and the first version of this block was a
# syntax error for exactly that reason.
DECISION = re.compile(
    "|".join(
        [
            # roleName === "Admin"
            ROLEISH + r"\s*(?:===|!==|==|!=)\s*[\"'](?:" + NAMES + r")[\"']",
            # "Admin" === roleName
            r"[\"'](?:" + NAMES + r")[\"']\s*(?:===|!==|==|!=)\s*" + ROLEISH,
            # ["Admin", "Manager"].includes(whatever)
            r"\[\s*(?:[\"'](?:" + NAMES + r")[\"']\s*,?\s*)+\]\s*\.includes\(",
            # something.includes("Admin")
            r"\.includes\(\s*[\"'](?:" + NAMES + r")[\"']\s*\)",
        ]
    )
)

# An array literal of role names, which is the shape that was removed.
ROLE_ARRAY = re.compile(
    r"=\s*\[\s*(?:[\"'](?:" + "|".join(re.escape(n) for n in ROLE_NAMES) + r")[\"']\s*,?\s*){2,}\]"
)


def blank_comments(source: str) -> str:
    """
    Replace comments with spaces, keeping every newline and every offset.

    Deleting them shifted every line number after the first comment block, so
    the findings pointed at the wrong lines — which is worse than no line
    number, because somebody goes to look and finds nothing there.
    """

    def blank(match: re.Match[str]) -> str:
        return re.sub(r"[^\n]", " ", match.group(0))

    source = re.sub(r"/\*[\s\S]*?\*/", blank, source)
    return re.sub(r"(?<!:)//[^\n]*", blank, source)


def main() -> int:
    problems: list[str] = []
    scanned = 0

    for directory in SCANNED:
        if not directory.exists():
            continue

        for path in sorted(list(directory.rglob("*.ts")) + list(directory.rglob("*.tsx"))):
            if "node_modules" in str(path):
                continue

            relative = str(path.relative_to(ROOT))
            if relative in ALLOWED:
                continue

            text = blank_comments(path.read_text(encoding="utf-8", errors="replace"))
            scanned += 1

            for match in ROLE_ARRAY.finditer(text):
                line = text[: match.start()].count("\n") + 1
                problems.append(
                    f"{relative}:{line}  an array of role names. Renaming a role in the Phase 8 "
                    f"editor would silently stop this matching. Use a permission key."
                )

            for match in DECISION.finditer(text):
                line = text[: match.start()].count("\n") + 1
                snippet = " ".join(match.group(0).split())[:60]
                problems.append(
                    f"{relative}:{line}  decides on a role name ({snippet}). Use a permission key."
                )

    if problems:
        print("check-permission-grant-transcription: FAIL")
        seen = set()
        for problem in problems:
            if problem in seen:
                continue
            seen.add(problem)
            print(f"  - {problem}")
        print()
        print("Role names are display text. Authorisation goes through app_permissions.")
        return 1

    print(f"check-permission-grant-transcription: ok ({scanned} file(s), no role-name authorisation)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
