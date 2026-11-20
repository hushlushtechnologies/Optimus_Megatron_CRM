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
    ("primary",      "card",       3.0, "the gold accent on a card"),
    ("success",      "card",       3.0, "a success badge on a card"),
    ("warning",      "card",       3.0, "a warning badge on a card"),
    ("danger",       "card",       3.0, "a danger badge on a card"),
    ("info",         "card",       3.0, "an info badge on a card"),
    ("border",       "card",       1.0, "a card border (decorative)"),
]

failures = []

for theme, values in THEMES.items():
    print(f"\n{theme.upper()}")
    for fg_name, bg_name, minimum, label in PAIRS:
        fg, bg = values.get(fg_name), values.get(bg_name)
        if not fg or not bg:
            print(f"  ?     {label}: token missing")
            continue
        r = ratio(fg, bg)
        ok = r >= minimum
        print(f"  {'ok  ' if ok else 'FAIL'} {r:5.2f}:1 (needs {minimum}) — {label}")
        if not ok:
            failures.append(f"{theme}: {label} is {r:.2f}:1, needs {minimum}:1 ({fg} on {bg})")

# Dark text on the gold primary, which is how every primary button is built.
print("\nDARK-ON-GOLD (every primary button)")
for theme, values in THEMES.items():
    r = ratio("#0b1220", values["primary"])
    ok = r >= 4.5
    print(f"  {'ok  ' if ok else 'FAIL'} {r:5.2f}:1 (needs 4.5) — #0b1220 on {theme} primary")
    if not ok:
        failures.append(f"{theme}: button label is {r:.2f}:1 on the primary fill")

print("\n" + "=" * 60)
if failures:
    print(f"{len(failures)} contrast failure(s):\n")
    for f in failures:
        print(f"  {f}")
else:
    print("Every token pair this module renders meets WCAG AA.")
print("=" * 60)
sys.exit(1 if failures else 0)
