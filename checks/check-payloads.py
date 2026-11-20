#!/usr/bin/env python3
"""
Does each form actually send every field its schema expects?

This is the check that would have caught the trade-in bug: both missing
fields were .optional() in the schema, so tsc was happy while Trade-In and
Dream Car enquiries silently dropped everything the customer had typed.

A type checker cannot see a missing optional key. This can.
"""

import re
import sys
import pathlib

REPO = pathlib.Path("/home/claude/hushlushtechnologies/optimus_megatron_crm")


def strip_comments(text: str) -> str:
    """Block and line comments out, so a comma inside one can't split a field."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def balanced(text: str, open_at: int) -> str:
    """The contents of the {...} starting at open_at."""
    depth = 0
    for i, ch in enumerate(text[open_at:], start=open_at):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[open_at + 1 : i]
    sys.exit("unbalanced braces")


def top_level_keys(literal: str) -> set[str]:
    """
    Keys of an object literal, however it is laid out.

    Splits on depth-0 commas rather than newlines: `{ enquiryId, carId }` on
    one line has to yield two keys, and a nested object's keys must not leak
    in as if they were fields of the outer one.
    """
    literal = strip_comments(literal)

    parts, depth, current = [], 0, ""
    for ch in literal:
        if ch in "{[(":
            depth += 1
        elif ch in "}])":
            depth -= 1

        if ch == "," and depth == 0:
            parts.append(current)
            current = ""
        else:
            current += ch
    parts.append(current)

    keys = set()
    for part in parts:
        # `key: value`, or shorthand `key`.
        match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::|$)", part.strip())
        if match:
            keys.add(match.group(1))

    return keys


def schema_keys(path: str, name: str) -> set[str]:
    """Top-level fields of the z.object() assigned to `name`."""
    text = (REPO / path).read_text()

    start = text.index("const " + name)
    # `.object({` may sit on its own line after a bare `z`.
    open_at = text.index("{", text.index(".object(", start))

    return top_level_keys(balanced(text, open_at))


def payload_keys(path: str, action: str) -> set[str]:
    """Keys of the object literal passed to `action(...)`."""
    text = (REPO / path).read_text()

    start = text.index(action + "(")
    open_at = text.index("{", start)

    return top_level_keys(balanced(text, open_at))


CASES = [
    (
        "valuation",
        ("src/lib/validation/enquiry-valuation.ts", "enquiryValuationSchema"),
        ("src/components/enquiries/enquiry-valuation-form.tsx", "saveEnquiryValuationAction"),
    ),
    (
        "dream car match",
        ("src/lib/validation/enquiry-valuation.ts", "matchDreamCarSchema"),
        ("src/components/enquiries/enquiry-dream-car-match.tsx", "matchDreamCarAction"),
    ),
    (
        "add note",
        ("src/lib/validation/enquiry-work.ts", "addEnquiryNoteSchema"),
        ("src/components/enquiries/enquiry-notes-panel.tsx", "addEnquiryNoteAction"),
    ),
    (
        "schedule follow-up",
        ("src/lib/validation/enquiry-work.ts", "createEnquiryFollowUpSchema"),
        ("src/components/enquiries/enquiry-follow-ups-panel.tsx", "createEnquiryFollowUpAction"),
    ),
    (
        "log contact",
        ("src/lib/validation/enquiry-work.ts", "logEnquiryContactSchema"),
        ("src/components/enquiries/enquiry-follow-ups-panel.tsx", "logEnquiryContactAction"),
    ),
    (
        "complete follow-up",
        ("src/lib/validation/enquiry-work.ts", "completeEnquiryFollowUpSchema"),
        ("src/components/enquiries/enquiry-follow-ups-panel.tsx", "completeEnquiryFollowUpAction"),
    ),
    (
        "reschedule follow-up",
        ("src/lib/validation/enquiry-work.ts", "rescheduleEnquiryFollowUpSchema"),
        ("src/components/enquiries/enquiry-follow-ups-panel.tsx", "rescheduleEnquiryFollowUpAction"),
    ),
]

failed = False

for label, (schema_path, schema_name), (form_path, action) in CASES:
    expected = schema_keys(schema_path, schema_name)
    sent = payload_keys(form_path, action)

    missing = expected - sent
    extra = sent - expected

    status = "match" if not missing and not extra else "MISMATCH"
    print(f"{label:24} {status}")

    if missing or extra:
        failed = True
        print(f"    schema wants : {sorted(expected)}")
        print(f"    form sends   : {sorted(sent)}")
        if missing:
            print(f"    MISSING      : {sorted(missing)}")
        if extra:
            print(f"    NOT IN SCHEMA: {sorted(extra)}")

print()
print("FAIL" if failed else "every form sends every field its schema expects")
sys.exit(1 if failed else 0)
