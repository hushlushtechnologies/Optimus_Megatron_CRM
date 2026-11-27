#!/usr/bin/env python3
"""
Nothing in the Settings module may force a width wider than a phone.

WHY THIS CHECK EXISTS

Shahida reported horizontal scrollbars in the test drive, sales and report
modules during Sprint 10. The cause was not a hard bug — it was fixed widths
and wide grids that nothing was watching. Settings is now 18 routes and 20+
components built over five batches, which is exactly the kind of surface that
accumulates the same problem one component at a time.

Phase 25 asks for the module to be tested at five widths. A checker cannot
replace looking at it, and does not claim to: what it can do is hold the
layout rules that make the narrow case work, so that the next component added
cannot quietly break them.

THE NARROWEST CASE

375px, minus the shell's horizontal padding, leaves roughly 343px. A single
element wider than that forces the page to scroll sideways, and on a phone
that means a settings form you cannot read without dragging.

WHAT IT CHECKS

  1. A fixed pixel width must be under 343px, or be behind a breakpoint, or
     sit in a flex-wrap container where it can drop to its own line.
  2. A multi-column grid template with a fixed column must be behind a
     breakpoint (lg: or xl:), and the element must have a single-column
     fallback.
  3. A table must be inside a scroll container following the project's
     convention, which check-scroll-containers.py then verifies separately.

WHAT IT DOES NOT CHECK

Rendered width. This reads source, so it catches the rules being broken and
not every way a page can end up too wide — nested padding adding up, a long
unbroken string, a chart with a minimum size. Those need eyes.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 375px phone, less the admin shell's px-4 either side and the card's px-4.
NARROWEST_CONTENT = 343

DIRS = [
    ROOT / "src" / "components" / "settings",
    ROOT / "app" / "admin" / "settings",
]

BREAKPOINTS = ("sm:", "md:", "lg:", "xl:", "2xl:")


def class_lists(text):
    """Every className string, with its line number."""
    for match in re.finditer(r'className=\{?["`]([^"`]*)["`]', text):
        yield text[: match.start()].count("\n") + 1, match.group(1)


def main():
    files = []
    for directory in DIRS:
        if directory.exists():
            files.extend(sorted(directory.rglob("*.tsx")))

    problems = []
    allowed = []
    checked_tables = 0

    for path in files:
        text = path.read_text(encoding="utf-8", errors="replace")
        relative = path.relative_to(ROOT)

        for line, classes in class_lists(text):
            tokens = classes.split()

            for token in tokens:
                # --- rule 1: fixed pixel widths ---
                width = re.match(r"^(?:(\w+):)?(?:min-)?w-\[(\d+)px\]$", token)
                if width:
                    prefix, pixels = width.group(1), int(width.group(2))
                    if prefix and f"{prefix}:" in BREAKPOINTS:
                        continue
                    if pixels <= NARROWEST_CONTENT:
                        continue
                    if "flex-wrap" in classes:
                        allowed.append(
                            f"{relative}:{line}  {token} in a flex-wrap container, so it can drop to its own line"
                        )
                        continue
                    problems.append(
                        f"{relative}:{line}  {token} is wider than {NARROWEST_CONTENT}px with no "
                        f"breakpoint and no flex-wrap, so it forces sideways scrolling on a phone"
                    )

                # --- rule 2: grid templates with a fixed column ---
                grid = re.match(r"^(?:(\w+):)?grid-cols-\[(.+)\]$", token)
                if grid:
                    prefix, template = grid.group(1), grid.group(2)
                    has_fixed = bool(re.search(r"\d+px", template))
                    multi_column = "_" in template or " " in template
                    if not (has_fixed and multi_column):
                        continue
                    if not prefix or f"{prefix}:" not in BREAKPOINTS:
                        problems.append(
                            f"{relative}:{line}  {token} puts a fixed column at every width. "
                            f"Put it behind lg: and give the narrow case a single column."
                        )
                        continue
                    # Behind a breakpoint: there must be a stacking fallback.
                    if "flex-col" not in classes and "grid-cols-1" not in classes:
                        problems.append(
                            f"{relative}:{line}  {token} is behind {prefix}: but the element has no "
                            f"single-column fallback (flex-col or grid-cols-1) for narrow screens"
                        )
                    else:
                        allowed.append(
                            f"{relative}:{line}  {token} behind {prefix}:, stacking below it"
                        )

        # --- rule 3: tables need a scroll container ---
        for match in re.finditer(r"<table\b", text):
            checked_tables += 1
            line = text[: match.start()].count("\n") + 1
            before = text[max(0, match.start() - 400) : match.start()]
            if "overflow-x-auto" not in before and "scrollbar-hidden" not in before:
                problems.append(
                    f"{relative}:{line}  a <table> with no scroll container above it. "
                    f"Wrap it following the project's scrollbar-hidden convention."
                )

    print("=" * 70)
    print("SPRINT 10 — SETTINGS FITS A PHONE")
    print("=" * 70)
    print(f"\n{len(files)} file(s) in the Settings module, narrowest content width {NARROWEST_CONTENT}px.")
    print(f"{checked_tables} table(s) checked for a scroll container.\n")

    if allowed:
        print("Wide, but handled:")
        for item in allowed:
            print(f"  ok   {item}")
        print()

    if problems:
        for problem in problems:
            print(f"  FAIL  {problem}")
        print(f"\n{len(problems)} problem(s).")
        return 1

    print("Nothing forces a width a phone cannot show.")
    print("\nThis reads source, so it holds the layout rules rather than measuring")
    print("rendered pages. Nested padding and long unbroken strings still need eyes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
