#!/usr/bin/env python3
"""
WCAG contrast ratios for the token pairs Sprint 7 actually puts together.

This is the one accessibility property that can be computed exactly rather
than eyeballed, in both themes. AA wants 4.5:1 for body text and 3:1 for
large text and for the boundary of a UI component.
"""
import re, sys, pathlib

CSS = pathlib.Path("/home/claude/hushlushtechnologies/optimus_megatron_crm/app/globals.css").read_text()

def tokens(block: str) -> dict[str, str]:
    return {m.group(1): m.group(2) for m in re.finditer(r"--omc-([a-z-]+):\s*(#[0-9a-fA-F]{6})", block)}

# The dark tokens come first in the file, the light ones in the override.
dark_block = CSS[: CSS.index("--omc-card: #ffffff")]
light_block = CSS[CSS.index("--omc-card: #ffffff") :]

THEMES = {"dark": tokens(dark_block), "light": tokens(light_block)}

def luminance(hex_colour: str) -> float:
    r, g, b = (int(hex_colour[i : i + 2], 16) / 255 for i in (1, 3, 5))
    def channel(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = channel(r), channel(g), channel(b)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def ratio(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    lighter, darker = max(la, lb), min(la, lb)
    return (lighter + 0.05) / (darker + 0.05)

# Pairs this module genuinely renders, with the minimum each needs.
# 4.5 for body text, 3.0 for large text and for component boundaries.
PAIRS = [
    ("text-primary", "card",       4.5, "body text on a card"),
    ("text-muted",   "card",       4.5, "secondary text on a card"),
    ("text-subtle",  "card",       4.5, "captions on a card"),
    ("text-primary", "card-hover", 4.5, "body text on a hovered row"),
    ("text-muted",   "card-hover", 4.5, "secondary text on a hovered row"),
    ("text-subtle",  "card-hover", 4.5, "captions on a hovered row"),
    ("text-primary", "surface",    4.5, "body text on the page background"),
    # The focus ring. WCAG 1.4.11 wants 3:1 against what surrounds it, and
    # it has to clear that on both the card and the page background,
    # because a focused control can sit on either.
    ("focus",        "card",       3.0, "the focus ring on a card"),
    ("focus",        "surface",    3.0, "the focus ring on the page background"),

    # These four are used as TEXT and icon colours — text-success,
    # text-warning and so on — so the bar is 4.5:1, not the 3:1 this list
    # used to ask of them. The old entries called them "badges", which was
    # true when they were written; badges now carry their own Tailwind
    # shades per theme (see badge-contrast.py) and no longer touch these
    # tokens at all. Checking them as badges was measuring something that
    # had stopped existing.
    ("primary",      "card",       4.5, "the gold used as text or an icon on a card"),
    ("success",      "card",       4.5, "success text on a card"),
    ("warning",      "card",       4.5, "warning text on a card"),
    ("danger",       "card",       4.5, "danger text on a card"),
    ("info",         "card",       4.5, "info text on a card"),

    # The foreground ("ink") variants. Checked against both light
    # backgrounds, because semantic text appears on cards and on the page
    # itself, and a value tuned only to the white card falls short on the
    # page background.
    ("primary-text",  "card",       4.5, "gold foreground on a card"),
    ("primary-text",  "surface",    4.5, "gold foreground on the page background"),
    ("success-text",  "card",       4.5, "success foreground on a card"),
    ("success-text",  "surface",    4.5, "success foreground on the page background"),
    ("warning-text",  "card",       4.5, "warning foreground on a card"),
    ("warning-text",  "surface",    4.5, "warning foreground on the page background"),

    ("border",       "card",       1.0, "a card border (decorative)"),
]

# ---------------------------------------------------------------------------
# A known, measured gap — tracked rather than silently tolerated.
#
# In light mode the gold, green and amber tokens are too light to be read as
# text on a white card. The fix is NOT to darken them: the same tokens back
# 239 buttons, 54 pills and so on that carry dark text, and a value dark
# enough to read on white is too dark to sit under dark text. That is
# arithmetic, not taste — there is no single value that satisfies both, which
# check_two_roles() below demonstrates.
#
# The real fix is a second token per colour for foreground use
# (--omc-primary-ink and friends, already defined in globals.css) and a
# migration of the ~514 text-/border- call sites onto them. That is a
# reviewable change of its own rather than something to slip into a polish
# pass, so it is recorded here and printed loudly.
#
# Anything NOT in this set is a regression and fails the check.
# ---------------------------------------------------------------------------
KNOWN_GAPS = {
    ("light", "the gold used as text or an icon on a card"),
    ("light", "success text on a card"),
    ("light", "warning text on a card"),
}

failures = []
known = []

for theme, values in THEMES.items():
    print(f"\n{theme.upper()}")
    for fg_name, bg_name, minimum, label in PAIRS:
        fg, bg = values.get(fg_name), values.get(bg_name)
        if not fg or not bg:
            print(f"  ?     {label}: token missing")
            continue
        r = ratio(fg, bg)
        ok = r >= minimum
        tracked = (theme, label) in KNOWN_GAPS

        if ok:
            mark = "ok  "
        elif tracked:
            mark = "GAP "
        else:
            mark = "FAIL"

        print(f"  {mark} {r:5.2f}:1 (needs {minimum}) — {label}")

        if not ok:
            detail = f"{theme}: {label} is {r:.2f}:1, needs {minimum}:1 ({fg} on {bg})"
            (known if tracked else failures).append(detail)

        # A gap that has been fixed should stop being listed as known, or
        # the list rots into a permanent excuse.
        if ok and tracked:
            failures.append(
                f"{theme}: {label} now passes at {r:.2f}:1 — remove it from KNOWN_GAPS"
            )

# Dark text on the gold primary, which is how every primary button is built.
print("\nDARK-ON-GOLD (every primary button)")
for theme, values in THEMES.items():
    r = ratio("#0b1220", values["primary"])
    ok = r >= 4.5
    print(f"  {'ok  ' if ok else 'FAIL'} {r:5.2f}:1 (needs 4.5) — #0b1220 on {theme} primary")
    if not ok:
        failures.append(f"{theme}: button label is {r:.2f}:1 on the primary fill")

def check_two_roles() -> None:
    """
    Show that the light-mode gold cannot serve both of its roles.

    This is here so the KNOWN_GAPS entries above are backed by arithmetic
    rather than by an assertion in a comment. If someone later proposes
    "just darken the gold", this prints the reason that does not work.
    """
    white = THEMES["light"]["card"]
    button_text = "#0b1220"

    max_for_text = (luminance(white) + 0.05) / 4.5 - 0.05
    min_for_fill = 4.5 * (luminance(button_text) + 0.05) - 0.05

    print("\nWHY THE LIGHT GOLD CANNOT BE DARKENED INSTEAD")
    print(f"  readable as text on {white}      needs luminance <= {max_for_text:.4f}")
    print(f"  usable as a fill under {button_text}   needs luminance >= {min_for_fill:.4f}")
    print(
        "  => no single value satisfies both; foreground use needs its own token"
        if max_for_text < min_for_fill
        else "  => a single value could satisfy both — revisit KNOWN_GAPS"
    )


check_two_roles()

if known:
    print("\n" + "-" * 60)
    print(f"{len(known)} KNOWN gap(s) — tracked in KNOWN_GAPS, not regressions:\n")
    for k in known:
        print(f"  {k}")
    print("\n  Fix: migrate text-/border- call sites onto the --omc-*-text tokens.")
    print("-" * 60)

print("\n" + "=" * 60)
if failures:
    print(f"{len(failures)} contrast failure(s):\n")
    for f in failures:
        print(f"  {f}")
else:
    print(
        "No contrast regressions."
        + (f" {len(known)} known gap(s) still open — see above." if known else
           " Every token pair this module renders meets WCAG AA.")
    )
print("=" * 60)
sys.exit(1 if failures else 0)
