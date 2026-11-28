import "server-only";

/*
| Whether this deployment can send email.
|
| THIS BUILD DOES NOT SEND EMAIL, AND SAYS SO
|
| There is no mail provider wired into this project — no SMTP credentials, no
| transactional-email SDK, nothing. So the invitation flow does not pretend to
| send anything. It generates a link, records delivery_state = 'not_configured',
| and shows the administrator the link to pass on themselves.
|
| That is deliberately the honest shape rather than the convenient one. An
| invitation screen that says "invitation sent" when nothing sent it produces a
| new member of staff waiting for an email that will never arrive, and an
| administrator with no way to tell the difference.
|
| WIRING A PROVIDER LATER
|
| When you add one, this is the only file that needs to know about it: set the
| environment variables, implement sendInvitationEmail(), and the flow starts
| recording 'sent' or 'failed' instead. The database column already has all four
| states and the interface already renders them.
*/

export type MailProviderState = "configured" | "not_configured";

/**
 * Environment variables that would indicate a provider. None of these are set
 * in this project today; they are the names a provider would use.
 */
const PROVIDER_KEYS = ["RESEND_API_KEY", "SENDGRID_API_KEY", "SMTP_HOST", "POSTMARK_SERVER_TOKEN"] as const;

export function mailProviderState(): MailProviderState {
  const present = PROVIDER_KEYS.some((key) => {
    const value = process.env[key];
    return typeof value === "string" && value.trim().length > 0;
  });

  return present ? "configured" : "not_configured";
}

export interface MailResult {
  state: "sent" | "failed" | "not_configured";
  error: string | null;
}

/**
 * Send an invitation.
 *
 * Returns 'not_configured' rather than throwing or quietly succeeding. The
 * caller records whatever comes back verbatim — it must not upgrade this to
 * "sent" under any circumstances.
 *
 * The `link` parameter is a secret: it carries the invitation token. It is
 * passed to a provider and never logged, never stored, and never included in
 * an error message.
 */
// The parameter is part of the contract a provider integration will implement;
// naming it here keeps the signature honest about what a sender needs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function sendInvitationEmail(_params: {
  to: string;
  fullName: string;
  link: string;
}): Promise<MailResult> {
  if (mailProviderState() === "not_configured") {
    return { state: "not_configured", error: null };
  }

  // A provider is configured but no integration has been written for it yet.
  // Reporting 'failed' with a readable reason is the honest answer; reporting
  // 'sent' would be a lie and reporting 'not_configured' would hide that the
  // credentials are present and unused.
  return {
    state: "failed",
    error: "Mail credentials are set but no provider integration is implemented yet.",
  };
}
