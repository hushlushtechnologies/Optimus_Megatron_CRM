#!/usr/bin/env python3
"""
A Client Component may not take a prop whose type carries a React component.

WHY THIS CHECK EXISTS

Clicking Settings produced a console error for every page in the navigation:

    Only plain objects can be passed to Client Components from Server
    Components. Classes or other objects with methods are not supported.
      {id: "company", ..., icon: {$$typeof: ..., render: ...}}

`SettingsPage.icon` is a Lucide component. The settings layout is a Server
Component, `SettingsNavigation` is a Client Component, and React has to
serialize the props between them. A component is not serializable.

WHAT MAKES THIS WORTH A SCRIPT

Nothing else catches it.

  tsc            passes — the types are perfectly valid on both sides
  next build     compiles successfully
  eslint         silent
  every test     silent

I shipped it, ran all four, and reported the batch as verified. The error only
appears when the page actually renders, which is the one thing none of those
four do. This script is the part of my own process that was missing.

HOW IT WORKS

Two passes:

  1. Find every type with a field typed as a React component — LucideIcon,
     ComponentType, ElementType, ReactElement, FC. That is derived from the
     source rather than hard-coded, so a new registry type with an icon is
     covered the day it is written.

  2. For each "use client" file, read the props of its exported components and
     fail if any prop's type is one of those.

A client component may still USE those types internally — settings-search.tsx
has `const go = (page: SettingsPage) => ...` and that is fine, because nothing
crosses a boundary. Only prop positions are checked.

THE FIX, when this fails: pass ids and let the client resolve them from the
registry it imports itself. Strings serialize; components do not. The
permission filtering stays on the server, which is the only place it can
happen. See resolveSettingsPages in settings-registry.ts.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# A field of one of these types makes its containing type non-serializable.
COMPONENT_TYPES = (
    "LucideIcon",
    "ComponentType",
    "ElementType",
    "ReactElement",
    "FC<",
    "typeof Sun",  # the pattern used for an icon lookup map
)

TYPE_DIRS = [ROOT / "src" / "lib" / "types", ROOT / "src" / "lib" / "supabase"]
CLIENT_DIRS = [ROOT / "src" / "components", ROOT / "app"]


def types_carrying_components():
    """Type names with at least one field typed as a React component."""
    found = {}

    for directory in TYPE_DIRS:
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*.ts")):
            text = path.read_text(encoding="utf-8", errors="replace")

            # Each `interface Name {...}` / `type Name = {...}` block.
            for match in re.finditer(
                r"(?:export\s+)?(?:interface|type)\s+(\w+)\s*(?:=\s*)?\{", text
            ):
                name = match.group(1)
                start = match.end() - 1
                depth, index = 0, start
                while index < len(text):
                    if text[index] == "{":
                        depth += 1
                    elif text[index] == "}":
                        depth -= 1
                        if depth == 0:
                            break
                    index += 1
                body = text[start : index + 1]

                for component_type in COMPONENT_TYPES:
                    if re.search(r":\s*(?:readonly\s+)?" + re.escape(component_type), body):
                        found[name] = (
                            str(path.relative_to(ROOT)),
                            component_type.rstrip("<"),
                        )
                        break

    return found


def props_of_client_components(text):
    """
    (component name, props source) for each exported component in a file.

    Two shapes are used in this codebase: a named `XProps` interface, and an
    inline object type in the parameter list.
    """
    interfaces = {}
    for match in re.finditer(r"interface\s+(\w*Props)\s*\{", text):
        start = match.end() - 1
        depth, index = 0, start
        while index < len(text):
            if text[index] == "{":
                depth += 1
            elif text[index] == "}":
                depth -= 1
                if depth == 0:
                    break
            index += 1
        interfaces[match.group(1)] = text[start : index + 1]

    for match in re.finditer(r"export\s+function\s+(\w+)\s*\(([^)]*)\)", text, re.S):
        name, params = match.group(1), match.group(2)

        named = re.search(r":\s*(\w*Props)\b", params)
        if named and named.group(1) in interfaces:
            yield name, interfaces[named.group(1)]
            continue

        inline = re.search(r":\s*(\{.*\})\s*$", params, re.S)
        if inline:
            yield name, inline.group(1)


def main():
    carriers = types_carrying_components()

    print("=" * 70)
    print("CLIENT COMPONENT PROPS MUST BE SERIALIZABLE")
    print("=" * 70)
    print()

    if not carriers:
        print("  FAIL  found no types carrying a React component — this script's")
        print("        pattern is stale, so it is not checking anything")
        return 1

    print("Types that cannot cross the server/client boundary:")
    for name, (where, why) in sorted(carriers.items()):
        print(f"  {name:<28} {why} field, in {where}")
    print()

    problems = []
    client_files = 0
    checked = 0

    for directory in CLIENT_DIRS:
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*.tsx")):
            if "node_modules" in str(path):
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            if '"use client"' not in text.split("\n")[0:4].__str__():
                # Only the first few lines can carry the directive.
                if not re.match(r'^\s*(?://[^\n]*\n|\s)*["\']use client["\']', text):
                    continue

            client_files += 1
            relative = path.relative_to(ROOT)

            for component, props in props_of_client_components(text):
                checked += 1
                for name in carriers:
                    if re.search(r":\s*(?:readonly\s+)?" + name + r"\b", props):
                        problems.append(
                            f"{relative}  {component}() takes a prop typed {name}, which "
                            f"carries a React component. A Server Component rendering it "
                            f"will throw at render time, and tsc will not notice. Pass ids "
                            f"and resolve them client-side instead."
                        )

    print(f"{client_files} client component file(s), {checked} component(s) with props.\n")

    if problems:
        for problem in problems:
            print(f"  FAIL  {problem}")
        print(f"\n{len(problems)} problem(s).")
        return 1

    print("No client component takes a prop that cannot be serialized.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
