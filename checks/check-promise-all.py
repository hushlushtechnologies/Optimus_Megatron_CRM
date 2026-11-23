#!/usr/bin/env python3
"""
Assert every `const [...] = await Promise.all([...])` lines up one for one.

A short array hands back undefined for the extra names, and tsc only notices
when the receiving property happens to be non-nullable — so a report figure
reads `undefined.count` and dies, or worse, silently becomes null and shows
as a dash. This is the kind of mistake that survives a type check.

WHAT CHANGED IN PHASE 16

This used to take a filename on the command line and inspect only the FIRST
destructure in it:

    path = sys.argv[1]
    seg = src[src.index("const ["):]

Run with no arguments — which is how every other check in this directory is
run, and how a CI loop would run it — it crashed with an IndexError. So in
practice it was run by hand, on one file, once, during the sprint that added
it. Meanwhile the report queries grew destructures of five and seven, which
is exactly what it was written to guard.

It now walks the repository and checks every occurrence. Pass a path to
check a single file.
"""
import os
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
SCAN_DIRS = ("src", "app")

DESTRUCTURE = re.compile(r"const\s*\[", re.MULTILINE)


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def split_top_level(text: str) -> list[str]:
    """Split on commas that are not nested inside brackets or a string."""
    parts: list[str] = []
    depth = 0
    buf = ""
    quote: str | None = None

    for ch in text:
        if quote:
            buf += ch
            if ch == quote:
                quote = None
            continue

        if ch in "\"'`":
            quote = ch
            buf += ch
            continue

        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1

        if ch == "," and depth == 0:
            parts.append(buf)
            buf = ""
        else:
            buf += ch

    if buf.strip():
        parts.append(buf)

    return [p.strip() for p in parts if p.strip()]


def match_bracket(text: str, start: int) -> int:
    """Index of the bracket closing the one at `start`, or -1."""
    pairs = {"[": "]", "(": ")", "{": "}"}
    opening = text[start]
    closing = pairs[opening]
    depth = 0
    quote: str | None = None
    i = start

    while i < len(text):
        ch = text[i]

        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'`":
            quote = ch
        elif ch == opening:
            depth += 1
        elif ch == closing:
            depth -= 1
            if depth == 0:
                return i

        i += 1

    return -1


def check_file(path: pathlib.Path) -> list[str]:
    findings: list[str] = []
    raw = path.read_text(encoding="utf-8", errors="replace")
    text = strip_comments(raw)

    for match in DESTRUCTURE.finditer(text):
        open_bracket = match.end() - 1
        close_bracket = match_bracket(text, open_bracket)
        if close_bracket == -1:
            continue

        names_src = text[open_bracket + 1 : close_bracket]

        # Only destructures fed by Promise.all are in scope.
        after = text[close_bracket + 1 : close_bracket + 60]
        if "Promise.all" not in after:
            continue

        promise_open = text.index("Promise.all", close_bracket)
        array_open = text.index("[", promise_open)
        array_close = match_bracket(text, array_open)
        if array_close == -1:
            continue

        names = split_top_level(names_src)
        items = split_top_level(text[array_open + 1 : array_close])

        # A rest element legitimately absorbs any number of items.
        if any(n.startswith("...") for n in names):
            continue

        if len(names) != len(items):
            line = text[: match.start()].count("\n") + 1
            rel = path.relative_to(REPO)
            findings.append(
                f"{rel}:{line}  {len(names)} name(s) destructured from "
                f"{len(items)} promise(s)"
            )

    return findings


def main() -> int:
    if len(sys.argv) > 1:
        paths = [pathlib.Path(sys.argv[1]).resolve()]
    else:
        paths = []
        for directory in SCAN_DIRS:
            root = REPO / directory
            if not root.exists():
                continue
            for dirpath, _dirs, files in os.walk(root):
                if "node_modules" in dirpath:
                    continue
                for name in files:
                    if name.endswith((".ts", ".tsx")):
                        paths.append(pathlib.Path(dirpath) / name)

    findings: list[str] = []
    checked = 0

    for path in paths:
        if not path.exists():
            print(f"FAIL  {path} does not exist")
            return 1
        checked += 1
        findings.extend(check_file(path))

    print(f"Checked {checked} file(s) for Promise.all destructure arity.\n")
    print("=" * 60)

    if findings:
        print(f"{len(findings)} mismatch(es):\n")
        for f in findings:
            print(f"  {f}")
    else:
        print("Every Promise.all destructure matches its array.")

    print("=" * 60)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
