#!/usr/bin/env python3
"""
What the badge tones actually come out as, in both themes.

Badges don't use the --omc tokens: they use Tailwind's -400 shades on a
10%-alpha tint of the -500. So the real background is that tint composited
over the card, which is what this works out. Badge text is small, so AA
wants 4.5:1.
"""
TAILWIND = {
    "emerald-400": "#34d399", "emerald-500": "#10b981",
    "amber-400":   "#fbbf24", "amber-500":   "#f59e0b",
    "red-400":     "#f87171", "red-500":     "#ef4444",
    "blue-400":    "#60a5fa", "blue-500":    "#3b82f6",
}
CARD = {"dark": "#050d24", "light": "#ffffff"}

def rgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
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

TONES = [("success", "emerald"), ("warning", "amber"), ("danger", "red"), ("info", "blue")]

failures = []
for theme, card in CARD.items():
    print(f"\n{theme.upper()} — badge text on its own 10% tint")
    for tone, colour in TONES:
        bg = over(TAILWIND[f"{colour}-500"], card, 0.10)
        fg = rgb(TAILWIND[f"{colour}-400"])
        r = ratio(fg, bg)
        ok = r >= 4.5
        print(f"  {'ok  ' if ok else 'FAIL'} {r:5.2f}:1  {tone:8} (text-{colour}-400 on bg-{colour}-500/10 over {card})")
        if not ok:
            failures.append((theme, tone, colour, round(r, 2)))

# What shade WOULD pass on the light tint?
if failures:
    print("\nShades that would pass 4.5:1 on the light tint:")
    DEEPER = {
        "emerald": {"600": "#059669", "700": "#047857", "800": "#065f46"},
        "amber":   {"600": "#d97706", "700": "#b45309", "800": "#92400e"},
        "red":     {"600": "#dc2626", "700": "#b91c1c", "800": "#991b1b"},
        "blue":    {"600": "#2563eb", "700": "#1d4ed8", "800": "#1e40af"},
    }
    for colour, shades in DEEPER.items():
        bg = over(TAILWIND[f"{colour}-500"], "#ffffff", 0.10)
        parts = []
        for shade, hexv in shades.items():
            r = ratio(rgb(hexv), bg)
            parts.append(f"{colour}-{shade} {r:.2f}:1{' ✓' if r >= 4.5 else ''}")
        print(f"  {colour:8} {'  |  '.join(parts)}")

print("\n" + "=" * 68)
print(f"{len(failures)} badge tone(s) below AA" if failures else "All badge tones meet AA")
print("=" * 68)
