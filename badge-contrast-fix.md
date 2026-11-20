# Optional: badge contrast in light theme

**Not applied.** This changes a shared component used by six other modules, and Sprint 7 did not
create it. Your call.

## The problem

Every badge tone fails WCAG AA in light theme. These are computed, not estimated — the background is
the tone's own 10% tint composited over the card colour, and badge text is small, so AA wants 4.5:1.

| Tone | Light theme | Dark theme | AA needs |
|---|---|---|---|
| success | **1.75:1** | 8.87:1 | 4.5:1 |
| warning | **1.54:1** | 10.13:1 | 4.5:1 |
| danger | **2.42:1** | 6.52:1 | 4.5:1 |
| info | **2.26:1** | 6.82:1 | 4.5:1 |

At 1.54:1 the text is effectively invisible.

**Why:** `badge.tsx` uses Tailwind's `-400` shades, which are designed to sit on dark backgrounds. The
app's default theme is dark, and over `#050d24` they are comfortable. In light theme the 10% tint
composites to near-white and the same `-400` text has nothing to contrast against.

This affects every enquiry status badge, and equally every badge in Inventory, Sales, Leads,
Customers, Test Drives and Reservations.

## The fix

Deeper shades under the `.light` class. Dark theme is untouched — same classes, same bytes.

The app uses `.light` as an opt-in class on an ancestor (dark is `:root`), so the override is an
arbitrary variant: `[.light_&]:text-emerald-700`. Nothing in the repo uses this pattern yet, so this
would be the first instance of it.

In `src/components/ui/badge.tsx`, the tone map becomes:

```ts
neutral: "bg-card-hover text-text-muted border border-border",

success:
  "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 " +
  "[.light_&]:text-emerald-700",

warning:
  "bg-amber-500/10 text-amber-400 border border-amber-500/20 " +
  "[.light_&]:text-amber-700",

danger:
  "bg-red-500/10 text-red-400 border border-red-500/20 " +
  "[.light_&]:text-red-700",

info:
  "bg-blue-500/10 text-blue-400 border border-blue-500/20 " +
  "[.light_&]:text-blue-700",
```

The dot indicators lower down the same file (`bg-emerald-400` and friends) are decorative and sit
beside the label, so they can stay as they are. If you would rather they matched, the same
`[.light_&]:bg-emerald-700` works.

## What that gives you

| Tone | Light, after | Dark, after |
|---|---|---|
| success | 4.99:1 ✓ | 8.87:1 (unchanged) |
| warning | 4.65:1 ✓ | 10.13:1 (unchanged) |
| danger | 5.66:1 ✓ | 6.52:1 (unchanged) |
| info | 5.96:1 ✓ | 6.82:1 (unchanged) |

`-600` is not enough for three of the four: emerald-600 reaches 3.43:1, amber-600 2.95:1 and red-600
4.23:1, all short of 4.5. Only blue-600 would pass, at 4.59:1. Hence `-700` across the board, which
also keeps the four tones consistent with each other.

## Before applying

Look at one badge of each tone in light theme in Inventory and Sales as well as Enquiries. The deeper
shades read as more saturated, and on a white card that is the point — but it is a visible change to
five modules you did not ask me to touch, which is exactly why it is sitting here rather than in the
code.

## Re-checking it yourself

`badge-contrast.py` in this batch recomputes the table above from the hex values. Run it after any
change to the tones or to `--omc-card`:

```bash
python3 badge-contrast.py
```
