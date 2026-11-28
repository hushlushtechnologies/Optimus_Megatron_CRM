import Link from "next/link";

import { AlertCircle, Clock, ShieldX } from "lucide-react";

import { AcceptInvitationForm } from "@/src/components/users/accept-invitation-form";
import { findInvitationByToken } from "@/src/lib/supabase/staff-invitation-queries";

/*
| The page an invited member of staff lands on.
|
| Public: this is the one route in the staff module reachable without signing
| in, because the person has no account to sign in with yet. The proxy only
| guards /admin and /login, so nothing here is behind the session gate.
|
| NOT INDEXED, NOT CACHED
|
| The URL contains the invitation token. force-dynamic because the invitation's
| state changes and a cached page would keep offering a revoked one, and
| noindex so a link pasted anywhere public does not end up in a search result.
|
| WHAT IT TELLS A STRANGER
|
| A wrong or made-up token gets "this link isn't valid" and nothing else — no
| hint about whether the token was close, no email address, no names. A token
| that IS valid shows the name, email and role, because whoever holds the link
| was sent it; that is the whole premise of an invitation.
*/

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Accept your invitation",
  robots: { index: false, follow: false },
};

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const lookup = await findInvitationByToken(token);

  return (
    <main className="bg-base flex min-h-screen items-center justify-center px-4 py-10">
      <div className="border-border bg-card w-full max-w-md rounded-2xl border p-6 shadow-sm">
        <header className="mb-5">
          <p className="text-text-muted text-[12px] tracking-wide uppercase">Optimus Megatron Cars</p>
          <h1 className="text-text-primary mt-1 text-[19px] leading-6 font-semibold tracking-[-0.02em]">
            {lookup.state === "valid" ? "Set up your account" : "Invitation"}
          </h1>
        </header>

        {lookup.state === "valid" && lookup.invitation ? (
          <AcceptInvitationForm
            token={token}
            email={lookup.invitation.email}
            fullName={lookup.invitation.fullName}
            roleName={lookup.invitation.roleName}
          />
        ) : (
          <InvitationProblem state={lookup.state} />
        )}
      </div>
    </main>
  );
}

function InvitationProblem({ state }: { state: string }) {
  const content = {
    expired: {
      icon: <Clock className="text-warning size-7" aria-hidden="true" />,
      title: "This invitation has expired",
      body: "Invitations last seven days. Ask whoever invited you to send a new one — it only takes them a moment.",
    },
    revoked: {
      icon: <ShieldX className="text-danger size-7" aria-hidden="true" />,
      title: "This invitation was withdrawn",
      body: "Speak to whoever invited you if you think that was a mistake.",
    },
    accepted: {
      icon: <AlertCircle className="text-text-muted size-7" aria-hidden="true" />,
      title: "This invitation has already been used",
      body: "Your account is set up. Sign in with the password you chose.",
    },
    not_found: {
      icon: <AlertCircle className="text-text-muted size-7" aria-hidden="true" />,
      title: "This link isn't valid",
      body: "Check you copied the whole link — they are long and easy to cut short. If it still doesn't work, ask for a new one.",
    },
  }[state] ?? {
    icon: <AlertCircle className="text-text-muted size-7" aria-hidden="true" />,
    title: "This link isn't valid",
    body: "Ask whoever invited you to send a new one.",
  };

  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      {content.icon}
      <p className="text-text-primary text-[15px] font-semibold">{content.title}</p>
      <p className="text-text-muted text-[13px]">{content.body}</p>
      <Link
        href="/login"
        className="text-primary mt-2 text-[13px] font-medium underline-offset-4 hover:underline"
      >
        Go to sign in
      </Link>
    </div>
  );
}
