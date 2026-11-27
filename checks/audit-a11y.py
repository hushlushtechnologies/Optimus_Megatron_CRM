#!/usr/bin/env python3
"""
Phase 21 accessibility and responsive review, over the Sprint 7 components.

Finds the things that are actually findable in source: an icon-only button
with no accessible name, a decorative icon not hidden from screen readers, a
touch target below 44px, a fixed width that will overflow a phone, an
animation that ignores a reduced-motion preference.

It cannot tell whether a focus order makes sense or a label reads well.
Those are in the manual list in the batch README, not claimed here.
"""

import re
import sys
import pathlib

REPO = pathlib.Path("/home/claude/hushlushtechnologies/optimus_megatron_crm")

# Written or substantially changed in Sprint 7.
# WHAT THIS SCANS, AND WHY IT CHANGED
#
# This used to scan src/components/enquiries only — the module it was written
# for during Sprint 7 — plus one customer tab. Forty-one files, about five per
# cent of the component tree.
#
# So its clean bill of health meant "the enquiries module is fine", while the
# report read as though the application had been checked. The horizontal
# scrollbars reported in Test Drives, Sales and Reports were in files this
# audit had never opened.
#
# It now walks every component and page. That is the only scope at which a
# responsive audit means anything: the bug is always in the module nobody
# thought to look at.
COMPONENTS = sorted(
    path
    for directory in ("src/components", "app")
    for path in (REPO / directory).rglob("*.tsx")
    if "node_modules" not in str(path)
)

# ---------------------------------------------------------------------------
# A RATCHET FOR THE DECORATIVE-ICON BACKLOG
#
# Widening this audit from the enquiries module to the whole application, and
# reading icon names from each file's own lucide-react import instead of a
# hand-kept pattern, took the icon findings from a handful to 121. They are
# real: an icon inside a labelled IconButton should carry aria-hidden so a
# screen reader announces the button's name once rather than twice.
#
# They are also not all the same fix. Most sit inside a control that already
# has an aria-label, where aria-hidden is plainly right. A few are the only
# content of a control whose name comes from a Tooltip, and hiding the icon
# there without first giving the control a name would make it anonymous —
# worse than the thing being fixed.
#
# So they are not auto-fixed, and they are not ignored either. The count is
# pinned. A new one fails the check; clearing some and lowering the number
# is the way the backlog shrinks. If the count drops without the baseline
# moving, the check says so, so the number cannot quietly drift out of date.
# ---------------------------------------------------------------------------
ICON_BACKLOG = 121

findings: list[str] = []


def note(path: pathlib.Path, line_no: int, message: str) -> None:
    findings.append(f"{path.relative_to(REPO)}:{line_no}  {message}")


def strip_comments(text: str) -> str:
    text = re.sub(r"\{/\*.*?\*/\}", "", text, flags=re.S)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def jsx_elements(text: str, tag: str):
    """Each <tag ...> opening element, with its line number."""
    for match in re.finditer(rf"<{tag}(\s[^>]*?)?/?>", text, flags=re.S):
        yield text[: match.start()].count("\n") + 1, match.group(0)


# =====================================================================
# 1. Icon-only controls need an accessible name
# =====================================================================

for path in COMPONENTS:
    text = strip_comments(path.read_text())

    for line_no, element in jsx_elements(text, "button"):
        has_name = (
            "aria-label" in element
            or "aria-labelledby" in element
            or "title=" in element
        )
        if not has_name:
            # A <button> with text children is fine; only flag ones whose
            # content is an icon alone.
            start = text.index(element)
            tail = text[start + len(element) : start + len(element) + 220]
            icon_only = re.match(r"\s*<[A-Z]\w*[^>]*/>\s*</button>", tail)
            if icon_only:
                note(path, line_no, "icon-only <button> with no aria-label")

# =====================================================================
# 2. Decorative icons should be hidden from screen readers
# =====================================================================
#
# An icon beside a word that already says the same thing reads twice.

# WHICH NAMES ARE ICONS
#
# This used to be a hand-kept list with wildcards — Check\w*, Mail\w*,
# MessageSquare\w* — meant to catch CheckCircle and MailOpen. It also caught
# every component whose name happens to start the same way: CheckRow,
# Checklist, CheckInDeskClient, CheckInTestDriveDialog. Four files' worth of
# findings that were not icons at all.
#
# So the names now come from each file's own lucide-react import. That is
# exactly the set of icons the file can render, it needs no maintenance, and
# it cannot collide with a local component.
LUCIDE_IMPORT_RE = re.compile(
    r'import\s*\{([^}]*)\}\s*from\s*["\']lucide-react["\']', re.S
)


def icon_names(text: str) -> set[str]:
    names: set[str] = set()
    for block in LUCIDE_IMPORT_RE.findall(text):
        for part in block.split(","):
            part = part.strip()
            if not part:
                continue
            # Handle `Check as CheckIcon` — the local alias is what's rendered.
            if " as " in part:
                part = part.split(" as ")[-1].strip()
            if part and part[0].isupper():
                names.add(part)
    return names


for path in COMPONENTS:
    text = strip_comments(path.read_text())

    names = icon_names(text)
    if not names:
        continue

    icon_re = re.compile(
        r"<(" + "|".join(sorted(map(re.escape, names), key=len, reverse=True)) + r")\b([^>]*?)/?>",
        flags=re.S,
    )

    for match in icon_re.finditer(text):
        attrs = match.group(2) or ""

        if "aria-hidden" in attrs or "aria-label" in attrs:
            continue

        before = text[: match.start()]

        # (a) Passed as a prop — `icon={<Inbox />}`, `leftIcon={<Plus />}`.
        # The receiving component decides how to render it, and the shared
        # ones clone it with aria-hidden already set.
        if re.search(r"\b\w+=\{\s*$", before):
            continue

        # (b) Inside an element already hidden from screen readers. Looks
        # back for an aria-hidden opening tag with no closing tag between it
        # and the icon, which is a heuristic: it would miss a hidden
        # grandparent whose child element closes in between. Anything it
        # does flag is listed for a human to confirm, not auto-fixed.
        window = before[-500:]
        hidden_at = window.rfind('aria-hidden="true"')
        if hidden_at != -1 and "</" not in window[hidden_at:]:
            continue

        line_no = before.count("\n") + 1
        note(path, line_no, f"<{match.group(1)}> icon without aria-hidden")

# =====================================================================
# 3. Touch targets
# =====================================================================
#
# The repo's own convention is min-h-11 (44px) for anything tapped on a
# phone. Flag a control that pins itself smaller with no sm: escape.

for path in COMPONENTS:
    text = strip_comments(path.read_text())

    for line_no, line in enumerate(text.splitlines(), start=1):
        if re.search(r'className="[^"]*\bh-(7|8)\b', line) and "sm:" not in line:
            if "<button" in line or "<Button" in line or "onClick" in line:
                note(path, line_no, "tap target pinned under 44px with no sm: override")

# =====================================================================
# 4. Fixed widths that will overflow a phone
# =====================================================================

for path in COMPONENTS:
    text = strip_comments(path.read_text())

    # A fixed width is w-[460px]. These are NOT fixed widths and must not be
    # reported as such:
    #
    #   max-w-[460px]      a cap. With w-full this is the correct responsive
    #                      pattern — full width on a phone, capped above it.
    #                      This is what every filter drawer in the app does.
    #   min-w-[460px]      handled separately below.
    #   lg:w-[460px]       only applies from 1024px up, where 460px fits.
    #
    # The original pattern was \bw-\[(\d+)px\], and \b matches between the
    # "-" and the "w" of "max-w-", so it flagged every correctly written
    # drawer in the enquiries module. Two findings that stood in this audit
    # for a sprint were both correct code — which is worse than no check,
    # because a report that cries wolf gets skimmed and then ignored.
    FIXED_WIDTH = re.compile(r"(?<![-:\w])w-\[(\d+)px\]")
    RESPONSIVE_W = re.compile(r"\b(?:sm|md|lg|xl|2xl):w-\[(\d+)px\]")

    for line_no, line in enumerate(text.splitlines(), start=1):
        for match in FIXED_WIDTH.finditer(line):
            if int(match.group(1)) > 360:
                note(
                    path,
                    line_no,
                    f"fixed width {match.group(1)}px exceeds a small phone viewport",
                )

        # A responsive-prefixed fixed width is fine at its own breakpoint,
        # but only if the unprefixed case is handled. Flag it when there is
        # no w-full or w-auto alongside to cover phone widths.
        for match in RESPONSIVE_W.finditer(line):
            if int(match.group(1)) > 360 and not re.search(r"\bw-(?:full|auto)\b", line):
                note(
                    path,
                    line_no,
                    f"{match.group(0)} has no unprefixed width — phones get the browser default",
                )

        min_w = re.search(r"(?<![-:\w])min-w-\[(\d+)px\]", line)
        if min_w and int(min_w.group(1)) > 360:
            # The scroll container is usually the PARENT element, not this
            # line — which is how the test-drive calendar's correct
            # `overflow-x-auto` wrapper around a `min-w-[760px]` child was
            # reported as having no scroll container at all.
            all_lines = text.splitlines()
            window = "\n".join(all_lines[max(0, line_no - 12) : line_no])
            if re.search(r"\boverflow-(?:x-)?(?:auto|scroll)", window) is None:
                note(path, line_no, f"min-width {min_w.group(1)}px with no scroll container")

# =====================================================================
# 5. Alerts need a role so a screen reader announces them
# =====================================================================

for path in COMPONENTS:
    text = strip_comments(path.read_text())

    # An error paragraph styled as a danger box.
    for match in re.finditer(r"<p\b([^>]*?)>", text, flags=re.S):
        attrs = match.group(1)
        looks_like_error = "bg-danger/" in attrs or "border-danger/" in attrs
        if looks_like_error and "role=" not in attrs:
            line_no = text[: match.start()].count("\n") + 1
            note(path, line_no, "error message without role=\"alert\"")

# =====================================================================
# 6. Reduced motion
# =====================================================================

# The animations in this module all come through useMotion, so that hook is
# the single place a reduced-motion preference has to be honoured.
motion_helpers = [
    path
    for path in (REPO / "src/hooks").glob("use-*motion*.ts")
    if path.exists()
]

print("Reduced motion")
if not motion_helpers:
    print("  ?    no motion helper found to check")
else:
    for helper in motion_helpers:
        text = helper.read_text()
        respects = "useReducedMotion" in text or "prefers-reduced-motion" in text
        print(
            f"  {'ok  ' if respects else 'FAIL'} {helper.relative_to(REPO)}"
            f" {'honours a reduced-motion preference' if respects else 'does not mention reduced motion'}"
        )
        if not respects:
            findings.append(f"{helper.relative_to(REPO)}  animation ignores prefers-reduced-motion")

globals_css = (REPO / "app/globals.css").read_text()
has_global_guard = "prefers-reduced-motion" in globals_css
print(
    f"  {'ok  ' if has_global_guard else 'FAIL'} app/globals.css "
    f"{'has a prefers-reduced-motion block' if has_global_guard else 'has no prefers-reduced-motion block'}"
)
if not has_global_guard:
    findings.append("app/globals.css  no global prefers-reduced-motion guard")

# =====================================================================

print(f"\nChecked {len(COMPONENTS)} components")
print("=" * 60)

icon_findings = [f for f in findings if "icon without aria-hidden" in f]
other_findings = [f for f in findings if "icon without aria-hidden" not in f]

if other_findings:
    print(f"{len(other_findings)} finding(s) to fix:\n")
    for item in other_findings:
        print(f"  {item}")
    print()

failed = bool(other_findings)

if icon_findings:
    count = len(icon_findings)
    if count > ICON_BACKLOG:
        print(
            f"{count} decorative-icon finding(s) — {count - ICON_BACKLOG} MORE than the "
            f"pinned backlog of {ICON_BACKLOG}:\n"
        )
        for item in icon_findings[-(count - ICON_BACKLOG) :]:
            print(f"  {item}")
        print("\n  Add aria-hidden=\"true\" to the new one(s), or raise ICON_BACKLOG")
        print("  deliberately with a reason.\n")
        failed = True
    elif count < ICON_BACKLOG:
        print(
            f"{count} decorative-icon finding(s) — {ICON_BACKLOG - count} FEWER than the "
            f"pinned backlog of {ICON_BACKLOG}."
        )
        print(f"  Good. Lower ICON_BACKLOG to {count} so the gain is held.\n")
        failed = True
    else:
        print(f"{count} decorative-icon finding(s), matching the pinned backlog.")
        print("  Pre-existing and tracked; see ICON_BACKLOG for why they are not")
        print("  auto-fixed. Run with --list to see them.\n")

if not findings:
    print("No findable accessibility or responsive issues.")

if "--list" in sys.argv and icon_findings:
    print("Decorative-icon backlog:\n")
    for item in icon_findings:
        print(f"  {item}")
    print()

print("=" * 60)
sys.exit(1 if failed else 0)
