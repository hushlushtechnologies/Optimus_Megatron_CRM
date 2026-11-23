#!/usr/bin/env python3
"""
What the badge tones actually come out as, in both themes.

Badges don't use the --omc tokens: they use Tailwind shades on a 10%-alpha
tint of the -500. So the real background is that tint composited over the
card, which is what this works out. Badge text is small, so AA wants 4.5:1.

THIS READS THE SHADES OUT OF badge.tsx.

The first version of this script hardcoded `-400` on both themes, which was
true when it was written and became wrong the moment the component grew a
per-theme shade. A hardcoded assumption fails in both directions: it kept
reporting a failure after the failure was fixed, which teaches people to
ignore the check — and it would have passed a component that had been
changed to something else broken, because it never looked.

So the tone classes are parsed from the component. If the parse finds
nothing, that is a failure too: a check that silently verifies zero tones
is worse than no check.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BADGE = ROOT / "src" / "components" / "ui" / "badge.tsx"

# Tailwind's palette, for the shades a badge might reasonably use.
TAILWIND = {
    "emerald-400": "#34d399", "emerald-500": "#10b981", "emerald-600": "#059669",
    "emerald-700": "#047857", "emerald-800": "#065f46",
    "amber-400": "#fbbf24", "amber-500": "#f59e0b", "amber-600": "#d97706",
    "amber-700": "#b45309", "amber-800": "#92400e",
    "red-400": "#f87171", "red-500": "#ef4444", "red-600": "#dc2626",
    "red-700": "#b91c1c", "red-800": "#991b1b",
    "blue-400": "#60a5fa", "blue-500": "#3b82f6", "blue-600": "#2563eb",
    "blue-700": "#1d4ed8", "blue-800": "#1e40af",
}
CARD = {"dark": "#050d24", "light": "#ffffff"}
TONES = [("success", "emerald"), ("warning", "amber"), ("danger", "red"), ("info", "blue")]


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(x) for x in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def over(fg_hex, bg_hex, alpha):
    f, b = rgb(fg_hex), rgb(bg_hex)
    return tuple(round(f[i] * alpha + b[i] * (1 - alpha)) for i in range(3))


def shades_for(source, tone, colour):
    """
    The light and dark text shade this tone actually uses.

    Tailwind's convention is that a bare class is the light-mode value and
    `dark:` overrides it, so a tone with no dark: variant uses the same
    shade in both — which is the case this check exists to catch.
    """
    block = re.search(
        rf'\b{tone}:\s*\n?\s*((?:"[^"]*"\s*\+?\s*)+)',
        source,
    )
    if not block:
        return None, None

    classes = block.group(1)

    light = re.search(rf'(?<!dark:)\btext-{colour}-(\d{{3}})\b', classes)
    dark = re.search(rf'dark:text-{colour}-(\d{{3}})\b', classes)

    light_shade = f"{colour}-{light.group(1)}" if light else None
    # No dark: override means the light shade applies to both themes.
    dark_shade = f"{colour}-{dark.group(1)}" if dark else light_shade

    return light_shade, dark_shade


if not BADGE.exists():
    print(f"FAIL  cannot find {BADGE.relative_to(ROOT)}")
    sys.exit(1)

source = BADGE.read_text(encoding="utf-8")

failures = []
parsed = 0

for theme, card in CARD.items():
    print(f"\n{theme.upper()} — badge text on its own 10% tint")

    for tone, colour in TONES:
        light_shade, dark_shade = shades_for(source, tone, colour)
        shade = light_shade if theme == "light" else dark_shade

        if shade is None:
            print(f"  FAIL  {tone:8} no text-{colour}-NNN class found in badge.tsx")
            failures.append((theme, tone, colour, "unparsed"))
            continue

        if shade not in TAILWIND:
            print(f"  FAIL  {tone:8} uses {shade}, which this script has no hex for")
            failures.append((theme, tone, colour, "unknown shade"))
            continue

        parsed += 1
        bg = over(TAILWIND[f"{colour}-500"], card, 0.10)
        r = ratio(rgb(TAILWIND[shade]), bg)
        ok = r >= 4.5

        print(
            f"  {'ok  ' if ok else 'FAIL'} {r:5.2f}:1  {tone:8} "
            f"(text-{shade} on bg-{colour}-500/10 over {card})"
        )

        if not ok:
            failures.append((theme, tone, colour, round(r, 2)))

# A parse that found nothing must not read as a pass.
if parsed == 0:
    print("\nFAIL  no badge tones could be parsed out of badge.tsx — check the format")
    failures.append(("both", "all", "all", "nothing parsed"))

if failures:
    print("\nShades that would pass 4.5:1 on the light tint:")
    for colour in ("emerald", "amber", "red", "blue"):
        bg = over(TAILWIND[f"{colour}-500"], "#ffffff", 0.10)
        parts = []
        for shade in ("600", "700", "800"):
            r = ratio(rgb(TAILWIND[f"{colour}-{shade}"]), bg)
            parts.append(f"{colour}-{shade} {r:.2f}:1{' ✓' if r >= 4.5 else ''}")
        print(f"  {colour:8} {'  |  '.join(parts)}")

print("\n" + "=" * 68)
print(
    f"{len(failures)} badge tone(s) below AA"
    if failures
    else f"All {parsed} badge tone/theme pairs meet AA"
)
print("=" * 68)

sys.exit(1 if failures else 0)
