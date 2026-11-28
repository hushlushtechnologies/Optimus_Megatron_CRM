#!/usr/bin/env python3
"""
Nothing logs a password, an invitation token, or a session secret.

Sprint 11 introduced the first two into this codebase. An invitation token is
a bearer credential — whoever holds it can take over a staff account — and a
password typed into the accept form passes through a server action. Both are
one console.error away from sitting in a log aggregator forever, and the usual
way that happens is not carelessness but debugging: somebody adds the whole
object to a log line while chasing a bug, and it survives the commit.

WHAT THIS LOOKS FOR

Any console.* or logger.* call whose arguments mention an identifier that
looks like a secret. Also any attempt to put one into a template literal
inside such a call, which is the form that slips past a reviewer reading for
`console.log(token)`.

WHAT IT DELIBERATELY ALLOWS

  - the WORD "token" in a message string: "[permissions] token is not valid"
    says nothing secret
  - `tokenHash` and `token_hash`: a digest is what we store on purpose
  - `error.message` from a provider, which is about shape, not content

So the rule is about identifiers being interpolated or passed, not about the
topic being mentioned. A check that flagged the word would be turned off
within a week.

Exit 1 on any finding.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

SCANNED = [ROOT / "app", ROOT / "src"]

# Identifiers that must never reach a log sink.
SECRET_IDENT = re.compile(
    r"""\b(
        password
      | passwords
      | newPassword
      | confirmPassword
      | plainPassword
      | token
      | accessToken
      | refreshToken
      | sessionSecret
      | serviceRoleKey
      | apiKey
      | anonKey
      | secret
      | credentials
      | invitationLink
      | actionLink
    )\b""",
    re.X,
)

# Names that only ever hold a digest or a public label, so they are fine.
ALLOWED_IDENT = re.compile(
    r"""\b(
        tokenHash
      | token_hash
      | hashInvitationToken
      | tokenHashes
      | passwordPolicy
      | assessPassword
      | MIN_PASSWORD_LENGTH
      | MAX_PASSWORD_LENGTH
      | PASSWORD_LENGTH
    )\b""",
    re.X,
)

LOG_CALL = re.compile(r"\b(?:console\.(?:log|info|warn|error|debug|trace)|logger\.\w+)\s*\(")

problems: list[str] = []


def argument_text(text: str, open_paren: int) -> str:
    """The source between a call's parentheses, brace-balanced."""
    depth = 0
    for index in range(open_paren, len(text)):
        char = text[index]
        if char in "([{":
            depth += 1
        elif char in ")]}":
            depth -= 1
            if depth == 0:
                return text[open_paren + 1 : index]
    return text[open_paren + 1 : open_paren + 400]


def strip_plain_strings(source: str) -> str:
    """
    Remove ordinary quoted strings, keeping template literals.

    A message is allowed to talk about tokens. A template literal is not, since
    `${token}` interpolates the value.
    """
    source = re.sub(r"'(?:[^'\\]|\\.)*'", "''", source)
    source = re.sub(r'"(?:[^"\\]|\\.)*"', '""', source)
    return source


def main() -> int:
    scanned = 0

    for directory in SCANNED:
        if not directory.exists():
            continue

        for path in sorted(directory.rglob("*.ts")) + sorted(directory.rglob("*.tsx")):
            if "node_modules" in str(path):
                continue

            text = path.read_text(encoding="utf-8", errors="replace")
            if "console." not in text and "logger." not in text:
                continue

            scanned += 1
            relative = path.relative_to(ROOT)

            for match in LOG_CALL.finditer(text):
                args = argument_text(text, match.end() - 1)
                bare = strip_plain_strings(args)

                # Allowed names first, so tokenHash does not match `token`.
                bare = ALLOWED_IDENT.sub("__allowed__", bare)

                hit = SECRET_IDENT.search(bare)
                if not hit:
                    continue

                line = text[: match.start()].count("\n") + 1
                problems.append(
                    f"{relative}:{line}  logs `{hit.group(1)}`. A log sink keeps this forever — "
                    f"log an id instead, or the fact that something failed."
                )

    if problems:
        print("check-no-secret-logging: FAIL")
        for problem in problems:
            print(f"  - {problem}")
        print()
        print("Passwords and invitation tokens are bearer credentials. Nothing")
        print("about them belongs in a log, including inside a template literal.")
        return 1

    print(f"check-no-secret-logging: ok ({scanned} file(s) with log calls, none logs a credential)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
