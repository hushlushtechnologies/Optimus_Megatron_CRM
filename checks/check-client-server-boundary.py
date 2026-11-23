#!/usr/bin/env python3
"""
No "use client" file may reach a server-only module.

WHY THIS EXISTS

This bug has landed twice, in two sprints, in the same shape:

  Sprint 8  offer-export-menu.tsx imported one constant from
            offer-export-queries.ts, which imports supabase/server.
  Sprint 9  report-overview-client.tsx imported the metric registry from
            report-overview-queries.ts, which imports supabase/server.

Both times `tsc --noEmit` was clean and `npm run build` failed. Both times the
build error pointed at supabase/server.ts and at the PAGE that rendered the
component — not at the import that actually caused it, which is why it takes a
while to find. And both times the fix was the same: move the shared constants
into a module that imports only types.

A type-only import is erased at build time and is fine. A value import is not.
The distinction is exactly what this script checks, and it is why
`import type { X }` passing while `import { X }` fails looks mysterious.

Catching it here means finding it in a second, with the offending import
named, instead of after a two-minute build.

Usage:
    python3 checks/check-client-server-boundary.py
"""
import os
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent

SEARCH_DIRS = ["src", "app"]

# A module is server-only if it imports one of these.
SERVER_ONLY_MARKERS = (
    "next/headers",
    "server-only",
    "@/src/lib/supabase/server",
    "@/src/lib/supabase/admin",
)

ALIAS = "@/"


def source_files() -> list[pathlib.Path]:
    found: list[pathlib.Path] = []
    for directory in SEARCH_DIRS:
        root = REPO / directory
        if not root.exists():
            continue
        for dirpath, _dirnames, filenames in os.walk(root):
            for name in filenames:
                if name.endswith((".ts", ".tsx")):
                    found.append(pathlib.Path(dirpath) / name)
    return sorted(found)


def resolve(specifier: str, importer: pathlib.Path) -> pathlib.Path | None:
    """The file an import specifier points at, if it is in this repository."""
    if specifier.startswith(ALIAS):
        base = REPO / specifier[len(ALIAS):]
    elif specifier.startswith("."):
        base = (importer.parent / specifier).resolve()
    else:
        return None  # a package

    for candidate in (
        base,
        base.with_suffix(".ts"),
        base.with_suffix(".tsx"),
        base / "index.ts",
        base / "index.tsx",
    ):
        if candidate.is_file():
            return candidate

    return None


# Value imports only. `import type { X } from "y"` and `import { type X }` are
# erased at build time, so they cannot drag a server module into the browser.
IMPORT_RE = re.compile(
    r'^\s*import\s+(?!type\s)(?P<clause>[^"\']*?)\s*from\s*["\'](?P<spec>[^"\']+)["\']',
    re.M,
)


def value_imports(text: str) -> list[str]:
    """Specifiers imported for their values."""
    specs: list[str] = []

    for match in IMPORT_RE.finditer(text):
        clause = match.group("clause")

        # `import { type A, type B } from "x"` is type-only in effect.
        inner = re.search(r"\{(.*)\}", clause, re.S)
        if inner:
            names = [n.strip() for n in inner.group(1).split(",") if n.strip()]
            if names and all(n.startswith("type ") for n in names):
                continue

        specs.append(match.group("spec"))

    # `import "./side-effect"` has no clause and still loads the module.
    for match in re.finditer(r'^\s*import\s*["\']([^"\']+)["\']', text, re.M):
        specs.append(match.group(1))

    return specs


def is_server_only(text: str) -> bool:
    """
    Whether a module is server-only.

    Checks the module's actual IMPORT SPECIFIERS, not its raw text.

    The first version searched the whole file for the marker strings, which
    flagged the two type-only modules written specifically to fix this bug —
    because their explanatory comments mention "next/headers". A check that
    fails on a correct fix, for a reason invisible in its output, is worse
    than no check.

    A type-only import of a marker is fine too: it is erased, so
    `import type { ReadonlyHeaders } from "next/headers"` does not make a
    module server-only.
    """
    for spec in value_imports(text):
        if any(spec == marker or spec.startswith(marker + "/") for marker in SERVER_ONLY_MARKERS):
            return True

    # The explicit directive, which is a real runtime guard rather than a
    # string in a comment. Only counted at the top of the file.
    head = text.lstrip()
    return head.startswith('import "server-only"') or head.startswith("import 'server-only'")


def is_server_action_module(text: str) -> bool:
    """
    A "use server" file is a legitimate boundary, not a leak.

    Next.js replaces an import of a server-action module with an RPC stub, so
    a client component importing one is the correct pattern — and those
    modules import supabase/server by design. Traversing into them reports
    every properly written action in the codebase, which is how a check like
    this gets ignored.

    This is the one exclusion in the script, and it is exactly where a false
    negative could hide: the bug being hunted is a client reaching a PLAIN
    module that imports supabase/server. So the exclusion stops traversal at
    "use server" only, and the mutation test in the Batch 2 README confirms
    the real case is still caught with it in place.
    """
    stripped = text.lstrip()
    return stripped.startswith('"use server"') or stripped.startswith("'use server'")


def main() -> int:
    files = source_files()
    contents = {path: path.read_text(encoding="utf-8", errors="replace") for path in files}

    clients = [p for p, t in contents.items() if t.lstrip().startswith(('"use client"', "'use client'"))]

    print(f"Checked {len(files)} files, {len(clients)} of them client components.\n")

    findings: list[str] = []

    for client in clients:
        # Walk the value-import graph from this client component.
        seen: set[pathlib.Path] = set()
        # (module, the chain that led to it)
        stack: list[tuple[pathlib.Path, list[str]]] = [(client, [])]

        while stack:
            current, chain = stack.pop()
            if current in seen:
                continue
            seen.add(current)

            text = contents.get(current)
            if text is None:
                continue

            # A server-action module is a boundary. Stop here.
            if current is not client and is_server_action_module(text):
                continue

            # The client component itself is allowed to be in app/ and use
            # hooks; what it may not do is reach a server module.
            if current is not client and is_server_only(text):
                route = " -> ".join([client.relative_to(REPO).as_posix()] + chain)
                findings.append(route)
                break

            for spec in value_imports(text):
                target = resolve(spec, current)
                if target and target not in seen:
                    stack.append((target, chain + [target.relative_to(REPO).as_posix()]))

    if findings:
        print("=" * 60)
        print(f"{len(findings)} client component(s) reach a server-only module:\n")
        for route in findings:
            print(f"  {route}")
        print()
        print("Fix: move the shared values into a module that imports only types,")
        print("or change the import to `import type { ... }` if only types are used.")
        print("=" * 60)
        return 1

    print("=" * 60)
    print("No client component reaches a server-only module.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
