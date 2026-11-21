#!/usr/bin/env python3
"""
Every offer filter must survive the whole round trip.

A filter has five jobs to do, in five different files, and a type checker
sees none of them because every value is a string:

  1. declared in OfferFilters
  2. read out of the URL in page.tsx
  3. applied to the query in getOfferList
  4. written back to the URL in changeFilters
  5. offered as a control in the drawer, and shown as a chip

Miss (3) and the filter does nothing. Miss (4) and it can be set but never
cleared. Miss (6) and the person can't tell it's on. All five look fine in
tsc and all five would ship.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path("/home/claude/hushlushtechnologies/optimus_megatron_crm")

failures: list[str] = []


def read(rel: str) -> str:
    path = ROOT / rel
    if not path.exists():
        failures.append(f"missing file: {rel}")
        return ""
    return path.read_text()


# ---------------------------------------------------------------- 1. declared

types_src = read("src/lib/types/offer-list.ts")

block = re.search(r"export interface OfferFilters \{(.*?)\n\}", types_src, re.S)
if not block:
    failures.append("could not find the OfferFilters interface")
    keys: list[str] = []
else:
    keys = re.findall(r"^\s*(\w+):", block.group(1), re.M)

if not keys:
    failures.append("OfferFilters declared no keys")

# EMPTY_OFFER_FILTERS must cover exactly the same set, or countActive lies.
empty = re.search(r"EMPTY_OFFER_FILTERS: OfferFilters = \{(.*?)\n\}", types_src, re.S)
if empty:
    empty_keys = set(re.findall(r"^\s*(\w+):", empty.group(1), re.M))
    for key in keys:
        if key not in empty_keys:
            failures.append(f"{key}: in OfferFilters but not in EMPTY_OFFER_FILTERS")
    for key in empty_keys - set(keys):
        failures.append(f"{key}: in EMPTY_OFFER_FILTERS but not in OfferFilters")
else:
    failures.append("could not find EMPTY_OFFER_FILTERS")

# ------------------------------------------------------------------- 2. read

page_src = read("app/admin/offers/page.tsx")

filters_literal = re.search(r"const filters = \{(.*?)\n  \};", page_src, re.S)
if filters_literal:
    body = filters_literal.group(1)
    for key in keys:
        if not re.search(rf"\b{key}:\s*one\(params\.{key}\)", body):
            failures.append(f"{key}: not read from searchParams in page.tsx")
else:
    failures.append("could not find the filters literal in page.tsx")

# ------------------------------------------------------------------ 3. applied

query_src = read("src/lib/supabase/offer-queries.ts")

for key in keys:
    if not re.search(rf"filters\.{key}\b", query_src):
        failures.append(f"{key}: never applied to the query in getOfferList")

# ------------------------------------------------------------------ 4. written

client_src = read("src/components/offers/offers-list-client.tsx")

entries = re.search(r"const entries:.*?\] = \[(.*?)\n      \];", client_src, re.S)
if entries:
    body = entries.group(1)
    for key in keys:
        if f'["{key}"' not in body:
            failures.append(f"{key}: not written back to the URL in changeFilters")
else:
    failures.append("could not find the entries list in changeFilters")

# ------------------------------------------------------- 5. control, and chip

drawer_src = read("src/components/offers/offer-filter-drawer.tsx")
toolbar_src = read("src/components/offers/offer-toolbar.tsx")

for key in keys:
    # from/to share one paired control and one combined chip.
    if key in {"from", "to"}:
        if f"draft.{key}" not in drawer_src:
            failures.append(f"{key}: no control in the drawer")
        if f"filters.{key}" not in toolbar_src:
            failures.append(f"{key}: never reaches a chip")
        continue

    if f"draft.{key}" not in drawer_src:
        failures.append(f"{key}: no control in the drawer")

    if not re.search(rf'key: "{key}"', toolbar_src):
        failures.append(f"{key}: no chip in the toolbar, so it can't be seen or removed")

# --------------------------------------------- the clear-all / remove escape

# Every chip key the toolbar can emit must be removable.
chip_keys = set(re.findall(r'key: "(\w+)"', toolbar_src))
remove = re.search(r"const removeFilter = \(key: string\) => \{(.*?)\n  \};", toolbar_src, re.S)

if remove:
    body = remove.group(1)
    for chip in sorted(chip_keys):
        # "dates" is handled by name; everything else falls through to the spread.
        handled = f'key === "{chip}"' in body or "...filters, [key]" in body
        if not handled:
            failures.append(f"chip {chip}: removeFilter has no branch for it")
else:
    failures.append("could not find removeFilter")

# ------------------------------------------------------------------- report

print(f"OfferFilters keys: {', '.join(keys)}")
print(f"chips emitted:     {', '.join(sorted(chip_keys))}")
print()

if failures:
    print(f"FAIL — {len(failures)} problem(s):")
    for problem in failures:
        print(f"  - {problem}")
    sys.exit(1)

print(f"PASS — all {len(keys)} filters survive the round trip")
