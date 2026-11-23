#!/usr/bin/env python3
"""
Every colour utility in the source must resolve to a colour Tailwind knows.

WHY THIS EXISTS

`text-primary-text` was used in 97 files, 154 times, and was never defined.
Tailwind v4 generates a utility only for a colour name in its theme, so the
class produced no CSS at all. Those elements fell back to the inherited body
colour. Links meant to stand out looked like ordinary text — and because
`hover:text-primary-hover` IS defined, they turned gold only on hover, which
reads as a deliberate design rather than a fault.

Nothing catches this. It is not a type error, the build succeeds, the page
renders, and the element simply has the wrong colour. It survived several
sprints.

The failure is one-directional and quiet: a misspelled or undefined colour
never errors, it just does nothing. That is exactly what a check is for.

WHAT COUNTS AS DEFINED

  - a --color-NAME in the @theme block of globals.css
  - Tailwind's own palette (slate, red, emerald, ... with a shade)
  - the keywords: white, black, transparent, current, inherit
  - an arbitrary value: text-[#ff0000], bg-[var(--x)]
"""
import os
import pathlib
import re
import sys
from collections import defaultdict

REPO = pathlib.Path(__file__).resolve().parent.parent
CSS = REPO / "app" / "globals.css"
SCAN_DIRS = ("src", "app")

# "from", "via" and "to" are deliberately absent. They are real gradient
# colour-stop prefixes, but they also match ordinary data strings — the
# test-drive source slug "from-lead" is not a class — and there is no way to
# tell from the token alone. Gradient stops in this project all use the
# palette or an arbitrary value, so the coverage lost is small and the noise
# avoided is not.
PROPERTIES = ("text", "bg", "border", "ring", "fill", "stroke", "decoration", "outline", "divide", "shadow", "accent", "caret")

TAILWIND_PALETTE = {
    "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber",
    "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue",
    "indigo", "violet", "purple", "fuchsia", "pink", "rose",
}
KEYWORDS = {"white", "black", "transparent", "current", "inherit", "none", "auto"}

# Utilities whose suffix is a size/style rather than a colour, so a name that
# is not a colour is correct there and must not be reported.
NON_COLOUR_SUFFIX = {
    "text": {"xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl",
             "7xl", "8xl", "9xl", "left", "center", "right", "justify", "start",
             "end", "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip",
             "left", "top", "bottom"},
    "border": {"0", "2", "4", "8", "x", "y", "t", "r", "b", "l", "s", "e",
               "solid", "dashed", "dotted", "double", "hidden", "none",
               "collapse", "separate", "spacing"},
    "ring": {"0", "1", "2", "4", "8", "inset", "offset"},
    "shadow": {"xs", "sm", "md", "lg", "xl", "2xl", "inner", "none",
               "soft-sm", "soft-md", "soft-lg", "soft-xl"},
    "divide": {"0", "2", "4", "8", "x", "y", "solid", "dashed", "dotted", "none"},
    "outline": {"0", "1", "2", "4", "8", "none", "dashed", "dotted", "double",
                "hidden", "offset"},
    "decoration": {"0", "1", "2", "4", "8", "solid", "dashed", "dotted",
                   "double", "wavy", "none", "slice", "clone", "from-font",
                   "auto"},
    "stroke": {"0", "1", "2"},
    "from": {}, "via": {}, "to": {},
    "fill": {"none"},
    "bg": {"fixed", "local", "scroll", "clip", "origin", "bottom", "center",
           "left", "right", "top", "repeat", "no-repeat", "cover", "contain",
           "none", "gradient", "blend", "auto"},
    "accent": {"auto"},
    "caret": {},
}

CLASS_RE = re.compile(
    r"(?<![-\w])(?:(?:[a-z0-9-]+|\[[^\]]+\]):)*"
    r"(" + "|".join(PROPERTIES) + r")-"
    r"([a-z][a-z0-9]*(?:-[a-z0-9]+)*)"
    r"(?![\w\[])"
)


def defined_colours() -> set[str]:
    """Colour names Tailwind will generate a utility for."""
    if not CSS.exists():
        return set()
    text = CSS.read_text(encoding="utf-8")
    return {m.group(1) for m in re.finditer(r"--color-([a-z0-9-]+):", text)}


def handwritten_utilities() -> set[str]:
    """
    Utility classes written by hand in globals.css rather than generated.

    This project's typography lives in an `@layer utilities` block — a
    literal `.text-body-sm { ... }` and friends — so those classes are
    perfectly real without being colour tokens. Reading only --color-*
    reported 1,013 uses of text-body-sm as broken, which is the kind of
    noise that gets a check deleted on sight.
    """
    if not CSS.exists():
        return set()
    text = CSS.read_text(encoding="utf-8")
    return {m.group(1) for m in re.finditer(r"^\s*\.([a-z][a-z0-9-]*)\s*\{", text, re.M)}


# Tailwind utilities that share a property prefix with the colour utilities
# but take a direction, width or offset rather than a colour. Without these
# the check reports bg-gradient-to-r and border-l-2 as broken colours, which
# is noise, and noise is how a check earns its way into being ignored.
STRUCTURAL = re.compile(
    r"^(?:"
    r"(?:gradient|linear|radial|conic)-to-[trbl]{1,2}|"       # bg-gradient-to-br
    r"(?:gradient|linear|radial|conic)(?:-to)?-\w+|"
    r"clip-\w+|"                                              # bg-clip-text
    r"[xytrbls]-\d+|"                                         # border-l-2
    r"\d+(?:\.\d+)?|"                                        # border-0
    r"offset-\d+|"                                            # ring-offset-2
    r"color"                                                   # a CSS property name
    r")$"
)


def is_resolvable(prop: str, name: str, colours: set[str], handwritten: set[str]) -> bool:
    if STRUCTURAL.match(name):
        return True

    # ring-offset-<colour> and outline-offset-<colour> take a colour after
    # the word "offset", so resolve the remainder rather than the whole.
    if name.startswith("offset-"):
        return is_resolvable(prop, name[len("offset-") :], colours, handwritten)

    # A class written out by hand in globals.css is as real as a generated one.
    if f"{prop}-{name}" in handwritten:
        return True

    if name in colours or name in KEYWORDS:
        return True

    # Tailwind palette with a shade, e.g. emerald-400.
    parts = name.rsplit("-", 1)
    if len(parts) == 2 and parts[0] in TAILWIND_PALETTE and parts[1].isdigit():
        return True
    if name in TAILWIND_PALETTE:
        return True

    # A size/style suffix for this property is not a colour at all.
    if name in NON_COLOUR_SUFFIX.get(prop, set()):
        return True

    # A longer defined name may be a prefix match, e.g. sidebar-card.
    return any(name == c for c in colours)


def main() -> int:
    colours = defined_colours()
    handwritten = handwritten_utilities()

    if not colours:
        print("FAIL  no --color-* tokens found in app/globals.css")
        return 1

    unresolved: dict[tuple[str, str], list[str]] = defaultdict(list)
    scanned = 0

    for directory in SCAN_DIRS:
        root = REPO / directory
        if not root.exists():
            continue

        for dirpath, _dirs, files in os.walk(root):
            if "node_modules" in dirpath:
                continue

            for name in sorted(files):
                if not name.endswith((".ts", ".tsx")):
                    continue

                path = pathlib.Path(dirpath) / name
                scanned += 1
                rel = str(path.relative_to(REPO))

                for line_no, line in enumerate(
                    path.read_text(encoding="utf-8", errors="replace").splitlines(),
                    start=1,
                ):
                    # Only look inside string literals; prose and identifiers
                    # are not class names.
                    for literal in re.findall(r'"([^"\n]*)"|\'([^\'\n]*)\'|`([^`\n]*)`', line):
                        for candidate in literal:
                            if not candidate:
                                continue
                            for match in CLASS_RE.finditer(candidate):
                                prop, value = match.group(1), match.group(2)
                                if not is_resolvable(prop, value, colours, handwritten):
                                    unresolved[(prop, value)].append(f"{rel}:{line_no}")

    print(
        f"Scanned {scanned} file(s) against {len(colours)} --color-* token(s) "
        f"and {len(handwritten)} hand-written utility class(es).\n"
    )

    if not unresolved:
        print("=" * 70)
        print("Every colour utility resolves to a defined colour.")
        print("=" * 70)
        return 0

    print("=" * 70)
    print(f"{len(unresolved)} colour utility name(s) that generate NO CSS:\n")

    for (prop, value), sites in sorted(unresolved.items(), key=lambda kv: -len(kv[1])):
        files = sorted({s.rsplit(":", 1)[0] for s in sites})
        print(f"  {prop}-{value}   {len(sites)} use(s) in {len(files)} file(s)")
        for site in sites[:3]:
            print(f"      {site}")
        if len(sites) > 3:
            print(f"      ... and {len(sites) - 3} more")

    print("\nThese render with the inherited value, silently. Either define the")
    print("colour in the @theme block of globals.css or correct the class.")
    print("=" * 70)
    return 1


if __name__ == "__main__":
    sys.exit(main())
