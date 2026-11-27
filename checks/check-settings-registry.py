#!/usr/bin/env python3
"""
The settings registry and the routes on disk must agree.

WHY THIS EXISTS SEPARATELY FROM THE TEST

test/settings-registry-test.mts asserts the same route invariant, and it
runs in `npm test`. This checker exists because of how the next five batches
of Sprint 10 will actually go: each one flips entries from "planned" to
"ready" and adds their route files, and the flip is one word in a file a
long way from the route.

The failure is quiet. A page marked "ready" with no route file gets a 404
from the catch-all — correctly, since claiming "not available yet" about a
page that is supposed to exist would hide the bug — so what ships is a dead
link in the navigation that nothing complains about.

It also checks the reverse, which the test cannot: a route file that exists
with no registry entry. Those are invisible — not in the navigation, not in
search, not permission-gated by the layout's filtering, reachable only by
typing the URL. A settings page nobody can find and nobody checked the
permissions on is worse than a missing one.
"""
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
REGISTRY = REPO / "src" / "lib" / "types" / "settings-registry.ts"
SETTINGS_APP_DIR = REPO / "app" / "admin" / "settings"

ENTRY_RE = re.compile(
    r"\{\s*"
    r"id:\s*\"(?P<id>[^\"]+)\",.*?"
    r"href:\s*\"(?P<href>[^\"]+)\",.*?"
    r"status:\s*\"(?P<status>ready|planned)\"",
    re.S,
)


def registry_entries() -> list[dict[str, str]]:
    source = REGISTRY.read_text(encoding="utf-8")

    start = source.index("export const SETTINGS_PAGES")
    end = source.index("\n];", start)
    block = source[start:end]

    return [match.groupdict() for match in ENTRY_RE.finditer(block)]


def route_hrefs() -> set[str]:
    """Every href that has a real page.tsx, excluding the catch-all."""
    found: set[str] = set()

    if not SETTINGS_APP_DIR.exists():
        return found

    for page in SETTINGS_APP_DIR.rglob("page.tsx"):
        rel = page.parent.relative_to(REPO)
        href = "/" + str(rel).replace("\\", "/").removeprefix("app/")

        # The catch-all answers for every planned page; it is not a route of
        # its own.
        if "[" in href:
            continue

        found.add(href)

    return found


def main() -> int:
    if not REGISTRY.exists():
        print(f"FAIL  cannot find {REGISTRY.relative_to(REPO)}")
        return 1

    entries = registry_entries()

    if not entries:
        print("FAIL  no registry entries could be parsed — check the format")
        return 1

    routes = route_hrefs()
    problems: list[str] = []

    ready = [entry for entry in entries if entry["status"] == "ready"]
    planned = [entry for entry in entries if entry["status"] == "planned"]

    for entry in ready:
        if entry["href"] not in routes:
            problems.append(
                f"{entry['id']} is \"ready\" but app{entry['href']}/page.tsx does not exist "
                f"— the navigation will link to a 404"
            )

    known = {entry["href"] for entry in entries}
    # The settings root is the overview, which has no registry entry of its own.
    known.add("/admin/settings")

    for href in sorted(routes):
        if href not in known:
            problems.append(
                f"app{href}/page.tsx exists but nothing in the registry points at it "
                f"— unreachable, unsearchable, and not permission-gated by the layout"
            )

    # A planned page with a route file is the opposite mistake: the page was
    # built and nobody flipped the status, so it stays hidden.
    for entry in planned:
        if entry["href"] in routes:
            problems.append(
                f"{entry['id']} has a route at app{entry['href']}/page.tsx but is still "
                f"\"planned\" — built and hidden; flip it to \"ready\""
            )

    print(
        f"{len(entries)} registry entries ({len(ready)} ready, {len(planned)} planned) "
        f"against {len(routes)} route file(s).\n"
    )
    print("=" * 70)

    if problems:
        print(f"{len(problems)} problem(s):\n")
        for problem in problems:
            print(f"  {problem}")
        print("=" * 70)
        return 1

    print("The registry and the routes agree.")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
