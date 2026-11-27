#!/usr/bin/env python3
"""
Every horizontal scroll container must be consistent and keyboard-reachable.

WHY THIS EXISTS

A horizontal scrollbar was visible in the Reports, Sales-report and
Test-Drive modules. The cause was not a layout bug — every wide view had a
correct overflow-x container. It was that four of them did not hide the
scrollbar, while eighteen others did.

This project's convention is to hide it:

    scrollbar-hidden                        the shared utility class
    [scrollbar-width:none] + [&::-webkit-scrollbar]:hidden   the same, inline

Two rules follow from that convention, and this checks both.

RULE 1 — CONSISTENCY

A scroll container that does not hide its bar looks like a mistake next to
twenty that do, which is exactly how it was reported.

RULE 2 — HIDING THE BAR REMOVES THE ONLY MOUSE AFFORDANCE

So a container that hides it has to be reachable another way: its own
tabIndex, or focusable children (links, buttons) that Tab walks through and
the browser scrolls into view.

Hiding the bar on a table of plain cells with no tabIndex leaves a keyboard
user no route to the off-screen columns at all. That is a worse bug than the
visible scrollbar, and it is the one you introduce while fixing it — which
is why both rules are checked together rather than just the tidy one.
"""
import os
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
SCAN_DIRS = ("src/components", "app")

OVERFLOW_RE = re.compile(r"overflow-(?:x-)?(?:auto|scroll)")
HIDES_BAR_RE = re.compile(
    r"scrollbar-hidden|scrollbar-width:\s*none|webkit-scrollbar\]:hidden"
)
# Its own keyboard entry point.
TABINDEX_RE = re.compile(r"tabIndex=\{?0")
# Or focusable children that Tab reaches, which the browser scrolls into view.
#
# The guard matters. In report-breakdown-table the only focusable child is
# `{getRowHref && <Link ...>}` — present only when a caller passes that prop,
# which most report sections do not. A pattern that just looked for "<Link"
# read that as unconditionally reachable and passed a table whose keyboard
# route had been deleted. So a conditionally-rendered focusable does not
# count as reachability; it counts as not knowing.
FOCUSABLE_RE = re.compile(r"<(?:Link|a|button|Button|input|select|textarea)\b")


def focusable_children(markup: str) -> tuple[bool, bool]:
    """
    (has an unconditional focusable child, has a conditional one).

    The guard matters. In report-breakdown-table the only focusable child is

        {getRowHref && (
          <Link ...>

    which exists only when a caller passes that prop — and most report
    sections do not. Treating any "<Link" in the file as reachability passed
    a table whose keyboard route had been deleted, which is precisely the
    regression this check is for. So each match is examined for a guard in
    the text just before it.
    """
    unconditional = False
    conditional = False

    for match in FOCUSABLE_RE.finditer(markup):
        before = markup[max(0, match.start() - 120) : match.start()]
        # A guard with no intervening closing brace still applies here.
        guarded = bool(re.search(r"(?:&&|\?)\s*\(?\s*$", before)) or bool(
            re.search(r"\{\s*[\w.?()]+\s*&&\s*\(?\s*$", before)
        )
        if guarded:
            conditional = True
        else:
            unconditional = True

    return unconditional, conditional


# A tablist's children are tabs. That is what the role means, so they are
# focusable without this script having to see them.
TABLIST_RE = re.compile(r'role="tablist"')

# Children handed in as a prop, or a custom component, may well be focusable
# and this script cannot tell from the markup. Claiming a failure there would
# be a guess; so would passing it silently. It gets its own list.
OPAQUE_CHILD_RE = re.compile(r"\{children\}|<[A-Z][A-Za-z0-9]*\b")

# How far around the match to look. A className is often a multi-line cn()
# call, and the focusable children sit in the element's body below it.
LOOK_BEHIND = 12
LOOK_AHEAD = 30

# Files excluded, with the reason. Anything not listed here is checked.
EXCLUDED = {
    # No importers — the live shell is inventory/add-car/add-car-shell.tsx,
    # which follows the convention. Left in place rather than deleted,
    # since removing a file is not this check's call to make.
    "src/components/inventory/add-car-shell.tsx": "dead duplicate, no importers",
}


def main() -> int:
    inconsistent: list[str] = []
    unreachable: list[str] = []
    opaque: list[str] = []
    ok = 0
    excluded_seen = 0

    for directory in SCAN_DIRS:
        root = REPO / directory
        if not root.exists():
            continue

        for dirpath, _dirs, files in os.walk(root):
            if "node_modules" in dirpath:
                continue

            for name in sorted(files):
                if not name.endswith(".tsx"):
                    continue

                path = pathlib.Path(dirpath) / name
                rel = str(path.relative_to(REPO))
                lines = path.read_text(encoding="utf-8", errors="replace").splitlines()

                for index, line in enumerate(lines):
                    if not OVERFLOW_RE.search(line):
                        continue

                    if rel in EXCLUDED:
                        excluded_seen += 1
                        continue

                    behind = "\n".join(lines[max(0, index - LOOK_BEHIND) : index + 2])
                    ahead = "\n".join(lines[index : index + LOOK_AHEAD])
                    window = behind + "\n" + ahead

                    hides = bool(HIDES_BAR_RE.search(behind))

                    if not hides:
                        inconsistent.append(
                            f"{rel}:{index + 1}  scroll container does not hide its scrollbar"
                        )
                        continue

                    unconditional, conditional = focusable_children(ahead)

                    if TABINDEX_RE.search(window) or TABLIST_RE.search(window) or unconditional:
                        ok += 1
                        continue

                    if conditional:
                        opaque.append(
                            f"{rel}:{index + 1}  hides its scrollbar; its only focusable "
                            f"child is conditional, so reachability depends on the caller"
                        )
                        continue

                    if OPAQUE_CHILD_RE.search(ahead):
                        opaque.append(
                            f"{rel}:{index + 1}  hides its scrollbar; children are a "
                            f"component or a prop, so reachability needs a look"
                        )
                        continue

                    unreachable.append(
                        f"{rel}:{index + 1}  hides its scrollbar with no tabIndex "
                        f"and only non-focusable children"
                    )

    print(
        f"{ok} scroll container(s) consistent and keyboard-reachable"
        + (f"; {excluded_seen} excluded by name" if excluded_seen else "")
        + ".\n"
    )

    print("=" * 70)

    if opaque:
        print(f"{len(opaque)} container(s) this script cannot judge:\n")
        for item in opaque:
            print(f"  {item}")
        print("\n  Not a failure — just not verifiable from the markup.\n")

    if not inconsistent and not unreachable:
        print("Every horizontal scroll container follows the convention.")
        print("=" * 70)
        return 0

    if inconsistent:
        print(f"{len(inconsistent)} container(s) showing a scrollbar the rest of the app hides:\n")
        for item in inconsistent:
            print(f"  {item}")
        print("\n  Add `scrollbar-hidden` — and a keyboard route, since hiding the")
        print("  bar removes the only way to scroll with a mouse.\n")

    if unreachable:
        print(f"{len(unreachable)} container(s) a keyboard user cannot scroll:\n")
        for item in unreachable:
            print(f"  {item}")
        print("\n  Add role=\"region\", aria-label and tabIndex={0}, as the")
        print("  test-drive calendar and the report breakdown tables do.\n")

    print("=" * 70)
    return 1


if __name__ == "__main__":
    sys.exit(main())
