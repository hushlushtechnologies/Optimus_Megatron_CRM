#!/usr/bin/env python3
"""
Every notification type any module sends must have an icon, and every
entityType must resolve to a route.

Neither is visible to tsc: the type and entityType are plain strings, and a
missing entry means a notification that renders with no icon or, worse, is
unclickable. The entity route was in fact missing until this check was
written.

Phase 23 generalised this from the enquiry module to every sender. The
reason is concrete: Sprint 8 added eight types across offers and loyalty,
and a check that only looked at enquiries would have passed while all eight
of them rendered as a plain bell.

Usage:
    python3 checks/check-notifications.py            every sender module
    python3 checks/check-notifications.py offer      senders matching "offer"
"""
import re
import sys
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent

NOTIFICATIONS_DIR = REPO / "src/lib/notifications"
LINKS = REPO / "src/lib/utils/notification-links.ts"

argument = sys.argv[1] if len(sys.argv) > 1 else ""

senders = sorted(
    path
    for path in NOTIFICATIONS_DIR.glob("*-notifications.ts")
    if not argument or argument in path.name
)

if not senders:
    print(f"No notification sender modules match {argument!r}.")
    sys.exit(1)

links = LINKS.read_text()

# TYPE_ICON ends where ENTITY_ROUTES begins; routes run to the end of the
# file so that LIST_ROUTES is included — a notification with no entity id
# resolves through that map.
icon_block = links[links.index("TYPE_ICON") : links.index("ENTITY_ROUTES")]
known_icons = set(re.findall(r"^\s*([a-z_]+):", icon_block, flags=re.M))

route_block = links[links.index("ENTITY_ROUTES") :]
known_entities = set(re.findall(r'^\s*([a-z_]+):\s*"/admin', route_block, flags=re.M))

failed = False
total_types = 0


def types_in(text: str) -> set[str]:
    """
    Every notification type a module sends, literal or ternary.

    Matched per line and anchored on `type:`, not on the ternary shape.

    An earlier version of this searched the whole file for
    `? "a" : "b"` and collected both branches. That over-matched badly:
    description strings are full of ternaries like
    `${credited ? "credited" : "debited"}` and `${credited ? "to" : "from"}`,
    so the check reported six missing icons for words that are not
    notification types at all. A check that cries wolf gets ignored, and
    then the one real missing icon in it gets ignored too.
    """
    found: set[str] = set()

    for line in text.splitlines():
        if "type:" not in line:
            continue

        # entityType: is a different key with its own map.
        value = re.sub(r".*\btype:", "", line, count=1)

        ternary = re.search(r'\?\s*"([a-z_]+)"\s*:\s*"([a-z_]+)"', value)

        if ternary:
            found.add(ternary.group(1))
            found.add(ternary.group(2))
            continue

        literal = re.match(r'\s*"([a-z_]+)"', value)

        if literal:
            found.add(literal.group(1))

    return found


def entities_in(text: str) -> set[str]:
    return set(re.findall(r'entityType:\s*"([a-z_]+)"', text))


for path in senders:
    text = path.read_text()

    sent_types = types_in(text)
    sent_entities = entities_in(text)

    print(f"\n{path.name}")

    if not sent_types:
        print("  (sends nothing)")
        continue

    for name in sorted(sent_types):
        total_types += 1
        ok = name in known_icons
        print(f"  {name:26} {'has an icon' if ok else 'NO ICON'}")
        if not ok:
            failed = True

    for name in sorted(sent_entities):
        ok = name in known_entities
        print(f"  entity: {name:18} {'has a route' if ok else 'NO ROUTE'}")
        if not ok:
            failed = True

print()
print("=" * 60)

if failed:
    print("Some notifications would render with no icon or no link.")
    sys.exit(1)

print(f"All {total_types} notification type(s) across {len(senders)} module(s) have an icon and a route.")
