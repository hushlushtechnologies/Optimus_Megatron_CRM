#!/usr/bin/env python3
"""
Every notification type the enquiry module sends must have an icon, and
every entityType must have a route.

Neither is visible to tsc: the type and entityType are plain strings, and a
missing entry means a notification that renders with no icon or, worse, is
unclickable. The entity route was in fact missing until this check was
written.
"""
import re, sys, pathlib

REPO = pathlib.Path("/home/claude/hushlushtechnologies/optimus_megatron_crm")

sender = (REPO / "src/lib/notifications/enquiry-notifications.ts").read_text()
links = (REPO / "src/lib/utils/notification-links.ts").read_text()

sent_types = set(re.findall(r'type:\s*"([a-z_]+)"', sender))
# The reassigned/assigned ternary names both in one expression.
sent_types |= set(re.findall(r'\?\s*"([a-z_]+)"\s*:\s*"([a-z_]+)"', sender)[0]) if re.search(r'\?\s*"[a-z_]+"\s*:\s*"[a-z_]+"', sender) else set()

sent_entities = set(re.findall(r'entityType:\s*"([a-z_]+)"', sender))

icon_block = links[links.index("TYPE_ICON"):links.index("ENTITY_ROUTES")]
known_icons = set(re.findall(r"^\s*([a-z_]+):", icon_block, flags=re.M))

route_block = links[links.index("ENTITY_ROUTES"):]
known_entities = set(re.findall(r'^\s*([a-z_]+):\s*"/admin', route_block, flags=re.M))

failed = False

print("notification types sent by the enquiry module:")
for t in sorted(sent_types):
    ok = t in known_icons
    print(f"  {t:26} {'has an icon' if ok else 'NO ICON'}")
    if not ok: failed = True

print("\nentity types sent:")
for e in sorted(sent_entities):
    ok = e in known_entities
    print(f"  {e:26} {'has a route' if ok else 'NO ROUTE — notification would be unclickable'}")
    if not ok: failed = True

print()
print("FAIL" if failed else "every notification the module sends has an icon and a route")
sys.exit(1 if failed else 0)
