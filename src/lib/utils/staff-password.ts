/*
| The password policy for a staff account, checked on the server.
|
| WHO CHOOSES THE PASSWORD
|
| The person being invited, and nobody else. No administrator sets a starting
| password, so there is no temporary password to leak, to reuse across new
| joiners, or to forget to change. "Do not create staff accounts using
| Password123 or any common shared password" is satisfied by there being no
| administrator-set password at all — and by the denylist below, for the case
| where somebody chooses one themselves.
|
| WHY THIS IS A PURE FUNCTION
|
| So it can be tested exhaustively without a database or a browser, and so the
| same rules can be shown live in the form and enforced in the action from one
| definition. The form is a courtesy; the action is the gate.
|
| This file never logs, stores, or returns the password it is given.
*/

export const MIN_PASSWORD_LENGTH = 12;

/** bcrypt truncates past 72 bytes; refusing well before that avoids a silent surprise. */
export const MAX_PASSWORD_LENGTH = 72;

/*
| Passwords that must never protect a staff account, whoever typed them.
|
| Short on purpose. This is not a breach corpus — it is the set that turns up
| when somebody is setting up accounts in a hurry and wants one they can read
| down the phone. The length rule does most of the work; this catches the
| specific failure the sprint brief names.
*/
const DENIED = [
  "password",
  "password1",
  "password123",
  "password1234",
  "passw0rd",
  "p@ssword",
  "p@ssw0rd",
  "welcome1",
  "welcome123",
  "qwerty123",
  "qwertyuiop",
  "123456789",
  "1234567890",
  "letmein123",
  "admin123",
  "administrator",
  "changeme",
  "changeme123",
  "iloveyou",
  "optimus123",
  "megatron123",
  "optimusmegatron",
];

export interface PasswordAssessment {
  ok: boolean;
  problems: string[];
}

export interface PasswordContext {
  email?: string | null;
  fullName?: string | null;
}

/*
| Two normalisations, because one is not enough.
|
| `squash` keeps digits and drops only punctuation, so "Welcome123456" still
| contains "welcome123". `letters` applies the usual digit-for-letter
| substitutions and then keeps letters only, so "P@ssw0rd" still contains
| "password".
|
| Both are applied to the DENYLIST ENTRIES as well as to the password. The
| first version of this file folded only the password and compared it against
| raw entries — which meant every entry containing a digit, "welcome123" and
| "optimus123" among them, could never match anything. It passed its own tests
| until the tests named those two passwords specifically.
*/
function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function letters(value: string): string {
  return value
    .toLowerCase()
    .replace(/[@]/g, "a")
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "l")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z]/g, "");
}

/** Shortest denied entry worth looking for *inside* a longer password. */
const SUBSTRING_MIN = 8;

function matchesDenylist(password: string): boolean {
  const squashed = squash(password);
  const lettered = letters(password);

  for (const denied of DENIED) {
    const deniedSquashed = squash(denied);
    const deniedLettered = letters(denied);

    if (squashed === deniedSquashed || lettered === deniedLettered) return true;

    if (deniedSquashed.length >= SUBSTRING_MIN && squashed.includes(deniedSquashed)) return true;
    if (deniedLettered.length >= SUBSTRING_MIN && lettered.includes(deniedLettered)) return true;
  }

  return false;
}

/** Words from a name or email worth refusing inside a password. */
function personalTokens(context: PasswordContext): string[] {
  const tokens: string[] = [];

  const local = context.email?.split("@")[0] ?? "";
  for (const part of local.split(/[^a-zA-Z]+/)) {
    if (part.length >= 4) tokens.push(part.toLowerCase());
  }

  for (const part of (context.fullName ?? "").split(/\s+/)) {
    const cleaned = part.replace(/[^a-zA-Z]/g, "");
    if (cleaned.length >= 4) tokens.push(cleaned.toLowerCase());
  }

  return [...new Set(tokens)];
}

export function assessPassword(password: string, context: PasswordContext = {}): PasswordAssessment {
  const problems: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    problems.push(`Use no more than ${MAX_PASSWORD_LENGTH} characters.`);
  }

  if (password.trim() !== password) {
    problems.push("Remove the space at the start or end — it is easy to lose when typing.");
  }

  if (/^(.)\1*$/.test(password) && password.length > 0) {
    problems.push("Use more than one repeated character.");
  }

  if (matchesDenylist(password)) {
    problems.push("That is based on a commonly used password. Choose something only you would pick.");
  }

  const lowered = password.toLowerCase();
  for (const token of personalTokens(context)) {
    if (lowered.includes(token)) {
      problems.push("Leave your own name and email address out of your password.");
      break;
    }
  }

  // Variety rather than a character-class checklist: a long passphrase of plain
  // words is strong and a short "P@ss1!" is not, so the rule counts distinct
  // characters instead of demanding a symbol.
  if (password.length >= MIN_PASSWORD_LENGTH && new Set(password).size < 6) {
    problems.push("Use a wider mix of characters.");
  }

  return { ok: problems.length === 0, problems };
}
