import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/*
| Invitation tokens.
|
| WHAT IS STORED, AND WHAT IS NOT
|
| The token exists in exactly two places: the link handed to the person being
| invited, and nowhere else. What the database holds is its SHA-256 digest.
|
| That is the whole point. A database reader — a backup, a support session, an
| administrator browsing the table in Supabase — cannot accept an invitation on
| somebody else's behalf, because the digest cannot be turned back into a link.
| It also means an invitation link cannot be re-displayed after the page that
| created it: there is nothing left to display. Resending issues a NEW token and
| the old one stops matching, which is the correct behaviour for a resend
| anyway.
|
| SHA-256 and not bcrypt, deliberately: this is a 256-bit random value, not a
| password. There is no dictionary to attack and no user-chosen weakness to
| stretch away from, so a slow hash would buy nothing and cost a round trip on
| every acceptance.
|
| NOTHING HERE IS EVER LOGGED. Not the token, not the digest, not a prefix of
| either. If you need to trace an invitation, trace its id.
*/

/** Seven days. Long enough for a weekend and a day off, short enough to matter. */
export const INVITATION_TTL_DAYS = 7;

const TOKEN_BYTES = 32;

export interface IssuedToken {
  /** Goes in the link. Show once, store never. */
  token: string;
  /** Goes in the database. */
  tokenHash: string;
  expiresAt: Date;
}

export function issueInvitationToken(now: Date = new Date()): IssuedToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  return { token, tokenHash: hashInvitationToken(token), expiresAt };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Compare two digests without leaking where they first differ.
 *
 * The lookup is by digest, so an attacker is guessing a 256-bit value rather
 * than probing a comparison — but a timing-safe compare costs nothing and
 * means the guarantee does not depend on how the query is written today.
 */
export function digestsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export function isInvitationExpired(expiresAt: string | Date, now: Date = new Date()): boolean {
  const expiry = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  if (Number.isNaN(expiry.getTime())) return true; // unreadable expiry is an expired one
  return expiry.getTime() <= now.getTime();
}

/**
 * The link to hand to the person being invited.
 *
 * Built from an explicit origin rather than guessed, so a link mailed out can
 * never point at localhost.
 */
export function invitationLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}
