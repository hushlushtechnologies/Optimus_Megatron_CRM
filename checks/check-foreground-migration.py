#!/usr/bin/env python3
"""
Where the gold, green and amber tokens are used as a FOREGROUND, and whether
each one sits on a light surface or a dark one.

WHY THIS EXISTS

In light mode these three tokens are too light to read as text on a white
card — 2.26 to 2.59:1, against the 4.5:1 AA wants. They cannot simply be
darkened, because the same tokens fill 239 buttons that carry dark text;
audit-contrast.py prints the arithmetic showing no single value does both.

So globals.css defines a second value per colour for foreground use:
--omc-primary-text, --omc-success-text, --omc-warning-text. Migrating the call
sites onto them is what closes the gap.

WHY IT IS NOT A FIND-AND-REPLACE

The sidebar is dark in BOTH themes — .light does not override
--sidebar-background (#000614). It uses text-primary and border-primary for
its active item. Swapping those for the ink values would put dark gold on
near-black and make the active item in the navigation almost invisible in
light mode. The migration would have fixed a contrast failure on cards by
creating a worse one in the shell.

So every site has to be classified by the surface it renders on, which is
what this does. It reports three groups:

  LIGHT    the element sits on a card, the page, or an inherited light
           surface -> migrating it is correct

Note the scale of what is left: `text-primary-text` is now defined, which
covers the 154 uses that already asked for it by name. What remains is the
`text-primary` / `border-primary` uses that render on a light surface and
should move to the foreground token.
  DARK     the element sits on a sidebar or an explicitly dark surface
           -> it must keep the bright token
  UNKNOWN  the surface cannot be determined from the markup -> needs eyes

It changes nothing. It is a worklist.
"""
import os
import pathlib
import re
import sys
from collections import defaultdict

REPO = pathlib.Path(__file__).resolve().parent.parent
SCAN_DIRS = ("src", "app")

# Foreground uses of the three fill tokens. The leading guard matters: without
# it, "text-primary" also matches inside "text-text-primary", which is the
# body-text token and nothing to do with the gold.
FOREGROUND_RE = re.compile(
    r"(?<![-:\w])(text|border|ring|decoration|outline|fill|stroke)-(primary|success|warning)\b"
)

# Surfaces that are dark whatever the theme. The sidebar tokens are defined
# only in :root — .light leaves them alone — so anything painted with them is
# dark in light mode too.
DARK_SURFACE_RE = re.compile(
    r"\b(?:bg|from|via|to)-(?:sidebar-\w+|black|slate-[789]\d{2}|gray-[789]\d{2}|zinc-[789]\d{2}|neutral-[789]\d{2}|navy\w*)\b"
    r"|\bbg-\[#0[0-9a-f]{5}\]"
)

# Surfaces that follow the theme, so they are light in light mode.
LIGHT_SURFACE_RE = re.compile(
    r"\b(?:bg|from|via|to)-(?:card|card-hover|surface|base|white|transparent)\b"
)

# Files whose whole purpose is the dark application shell.
DARK_BY_FILE = re.compile(r"(?:^|/)(?:admin-)?sidebar[^/]*\.tsx$|/layout/[^/]*sidebar")


def classify(line: str, path: pathlib.Path) -> str:
    if DARK_BY_FILE.search(str(path)):
        return "DARK"
    if DARK_SURFACE_RE.search(line):
        return "DARK"
    if LIGHT_SURFACE_RE.search(line):
        return "LIGHT"
    return "UNKNOWN"


def main() -> int:
    groups: dict[str, list[tuple[str, int, str, str]]] = defaultdict(list)
    files_touched: set[str] = set()

    for directory in SCAN_DIRS:
        root = REPO / directory
        if not root.exists():
            continue

        for dirpath, _dirs, files in os.walk(root):
            if "node_modules" in dirpath:
                continue

            for name in sorted(files):
                if not name.endswith((".ts", ".tsx")):
                    continue

                path = pathlib.Path(dirpath) / name
                rel = str(path.relative_to(REPO))

                for line_no, line in enumerate(
                    path.read_text(encoding="utf-8", errors="replace").splitlines(),
                    start=1,
                ):
                    for match in FOREGROUND_RE.finditer(line):
                        token = match.group(0).lstrip("-:")
                        verdict = classify(line, path)
                        groups[verdict].append((rel, line_no, token, line.strip()[:70]))
                        files_touched.add(rel)

    total = sum(len(v) for v in groups.values())

    print(f"{total} foreground use(s) of the fill tokens, across {len(files_touched)} file(s).\n")

    for verdict, note in (
        ("LIGHT", "migrate these to the -text tokens"),
        ("DARK", "leave these alone — they render on a dark surface in both themes"),
        ("UNKNOWN", "surface not determinable from the markup — needs a look"),
    ):
        hits = groups.get(verdict, [])
        print(f"{verdict}: {len(hits)}  — {note}")

    # A per-file summary is what somebody actually works from.
    if groups.get("DARK"):
        print("\nDARK — files that must keep the bright tokens:")
        by_file: dict[str, int] = defaultdict(int)
        for rel, _ln, _tok, _src in groups["DARK"]:
            by_file[rel] += 1
        for rel, count in sorted(by_file.items(), key=lambda kv: -kv[1]):
            print(f"  {count:4}  {rel}")

    if groups.get("UNKNOWN"):
        print("\nUNKNOWN — top files by count:")
        by_file = defaultdict(int)
        for rel, _ln, _tok, _src in groups["UNKNOWN"]:
            by_file[rel] += 1
        for rel, count in sorted(by_file.items(), key=lambda kv: -kv[1])[:15]:
            print(f"  {count:4}  {rel}")

    print("\n" + "=" * 70)
    print("This check reports; it changes nothing. See the Sprint 9 completion")
    print("report, section 7, for why the migration is not a find-and-replace.")
    print("=" * 70)

    # Reporting a worklist is not a failure.
    return 0


if __name__ == "__main__":
    sys.exit(main())
