#!/usr/bin/env python3
"""
The create form's payload must match upsertPromotionSchema, field for field.

This is the Sprint 7 trade-in bug written as a check. There, the submit
payload was missing tradeInVehicle and dreamCar; both were .optional() in the
schema, so tsc passed, the action ran, the row saved, and everything the
customer typed was silently dropped.

A field the form collects but never sends looks exactly like a field nobody
filled in. Nothing upstream can tell the difference — not the type checker,
not Zod, not the database. So it gets checked here.
"""

import pathlib
import re
import sys

REPO = pathlib.Path("/home/claude/hushlushtechnologies/optimus_megatron_crm")

schema_src = (REPO / "src/lib/validation/offers.ts").read_text()
form_src = (REPO / "src/components/offers/offer-form.tsx").read_text()

failures: list[str] = []


def fields_of(name: str, text: str) -> list[str]:
    """
    Top-level keys of a z.object({...}) at nesting depth 1.

    The .object( is found by regex, not by searching for the literal
    "z.object(": upsertPromotionSchema is formatted as `z\\n  .object({` by
    Prettier, so a literal search skips it and silently lands on the next
    schema in the file. That is how this check first "found" three fields and
    reported every real field as unknown.
    """
    start = text.index(f"export const {name}")
    opener = re.search(r"\.object\(\s*\{", text[start:])

    if not opener:
        raise ValueError(f"no .object({{ found after {name}")

    brace = start + opener.end() - 1

    depth, i = 0, brace
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                break
        i += 1

    body = text[brace + 1 : i]

    # Keep only depth-1 lines: skip anything inside a nested brace/bracket/paren.
    keys, depth = [], 0
    for line in body.splitlines():
        stripped = line.strip()

        if depth == 0:
            match = re.match(r"^(\w+):", stripped)
            if match:
                keys.append(match.group(1))

        depth += stripped.count("(") + stripped.count("{") + stripped.count("[")
        depth -= stripped.count(")") + stripped.count("}") + stripped.count("]")

    return keys


schema_fields = fields_of("upsertPromotionSchema", schema_src)

# ------------------------------------------------- the payload the form sends

payload = re.search(r"const payloadFor = \(.*?\) => \(\{(.*?)\n  \}\);", form_src, re.S)

if not payload:
    failures.append("could not find payloadFor in offer-form.tsx")
    sent: set[str] = set()
else:
    body = payload.group(1)
    # `key: value` and shorthand `key,` — the latter is how `status` is sent.
    sent = set(re.findall(r"^\s*(\w+):", body, re.M))
    sent |= set(re.findall(r"^\s*(\w+),\s*$", body, re.M))
    # `...(form.id ? { id: form.id } : {})` contributes `id` conditionally.
    if "form.id ? { id:" in body:
        sent.add("id")

# ------------------------------------------------------- every field is sent

for field in schema_fields:
    # `id` is only present when editing, which is correct.
    if field == "id":
        continue

    if field not in sent:
        failures.append(f"{field}: in upsertPromotionSchema but never sent by the form")

# -------------------------------------------- nothing is sent that isn't real

for field in sorted(sent):
    if field not in schema_fields:
        failures.append(f"{field}: sent by the form but not in upsertPromotionSchema")

# ------------------------- every sent field traces back to something editable

# A field sent as a literal is fine (bannerUrl: "", status), but a field
# sent from form state must exist in OfferFormInitial, or it is always
# undefined.
initial = re.search(r"export interface OfferFormInitial \{(.*?)\n\}", form_src, re.S)

if initial:
    state_fields = set(re.findall(r"^\s*(\w+)\??:", initial.group(1), re.M))

    for match in re.finditer(r"^\s*(\w+):\s*form\.(\w+),", payload.group(1) if payload else "", re.M):
        key, source = match.group(1), match.group(2)
        if source not in state_fields:
            failures.append(f"{key}: reads form.{source}, which OfferFormInitial does not declare")
else:
    failures.append("could not find OfferFormInitial")

# ------------------------------- and every state field reaches the payload

# The real Sprint 7 bug: collected, never sent.
if initial and payload:
    body = payload.group(1)
    for field in sorted(state_fields):
        if field == "id":
            continue
        if f"form.{field}" not in body:
            failures.append(
                f"form.{field}: collected by the form but never reaches the payload "
                f"(this is the Sprint 7 trade-in bug)"
            )

# --------------------------------------------------------------- one builder

# Both buttons must go through payloadFor, or they can drift apart.
draft_calls = len(re.findall(r'submit\("draft"\)', form_src))
publish_calls = len(re.findall(r'submit\("active"\)', form_src))
builders = len(re.findall(r"const payloadFor", form_src))
literal_payloads = len(re.findall(r"upsertPromotionAction\(\{", form_src))

if builders != 1:
    failures.append(f"expected exactly one payload builder, found {builders}")

if literal_payloads > 0:
    failures.append(
        f"{literal_payloads} call(s) to upsertPromotionAction with an inline object — "
        f"both buttons must go through payloadFor"
    )

if draft_calls == 0 or publish_calls == 0:
    failures.append("expected both a draft and a publish submit path")

# ------------------------------------------------------------------- report

print(f"schema fields ({len(schema_fields)}): {', '.join(schema_fields)}")
print(f"payload sends ({len(sent)}):  {', '.join(sorted(sent))}")
print()

if failures:
    print(f"FAIL — {len(failures)} problem(s):")
    for problem in failures:
        print(f"  - {problem}")
    sys.exit(1)

print(f"PASS — all {len(schema_fields) - 1} schema fields are sent, and nothing is collected and dropped")
