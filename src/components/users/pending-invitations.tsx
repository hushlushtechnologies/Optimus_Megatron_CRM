"use client";

import { useState, useTransition } from "react";

import { Check, Copy, Clock, MailWarning, RefreshCw, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { StatusBadge } from "@/src/components/ui/status-badge";
import { resendInvitation, revokeInvitation } from "@/app/admin/users/invitation-actions";
import type { PendingInvitation } from "@/src/lib/supabase/staff-invitation-queries";

/*
| Invitations that have been sent and not yet accepted.
|
| WHY THIS PANEL EXISTS AT ALL
|
| Because this build does not send email, an invitation that nobody passed on
| is invisible otherwise: the person is in the staff list as "Invited" and
| nothing says whether they were ever told. This panel is where that is
| visible, and where the link can be reissued.
|
| DELIVERY STATE IS SHOWN VERBATIM
|
| Four states, four different sentences, and "not configured" is never dressed
| up as "sent". An administrator looking at this should be able to tell, without
| asking anybody, whether a new joiner is waiting on them.
|
| REISSUING SHOWS A NEW LINK
|
| It does not re-send the old one — the old token is retired by the action. That
| is the correct behaviour for a resend and it is also the only possible one,
| since the original link was never stored.
*/

interface PendingInvitationsProps {
  invitations: PendingInvitation[];
  readFailed: boolean;
  canInvite: boolean;
}

const DELIVERY_DISPLAY: Record<string, { label: string; colorHex: string; note: string }> = {
  sent: { label: "Emailed", colorHex: "#22c55e", note: "An invitation email was sent." },
  unsent: { label: "Not sent", colorHex: "#94a3b8", note: "Nothing has gone out yet." },
  not_configured: {
    label: "Send it yourself",
    colorHex: "#f59e0b",
    note: "This build has no mail provider, so no email was sent. Reissue to get a link to pass on.",
  },
  failed: { label: "Failed", colorHex: "#ef4444", note: "Sending failed. Reissue to get a link to pass on." },
};

export function PendingInvitations({ invitations, readFailed, canInvite }: PendingInvitationsProps) {
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freshLink, setFreshLink] = useState<{ id: string; link: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (readFailed) {
    return (
      <section className="border-danger/30 bg-danger/[0.04] flex items-start gap-3 rounded-2xl border px-4 py-3">
        <MailWarning className="text-danger mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-text-primary text-[13px] font-semibold">Pending invitations couldn&apos;t be read</p>
          <p className="text-text-muted mt-0.5 text-[12px]">
            There may be invitations outstanding. This is a read failure, not an empty list.
          </p>
        </div>
      </section>
    );
  }

  if (invitations.length === 0) return null;

  function reissue(id: string) {
    setError(null);
    setBusyId(id);

    startTransition(async () => {
      const result = await resendInvitation(id);
      setBusyId(null);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.invitation) setFreshLink({ id, link: result.invitation.link });
    });
  }

  function revoke(id: string) {
    setError(null);
    setBusyId(id);

    startTransition(async () => {
      const result = await revokeInvitation(id);
      setBusyId(null);
      if (result.error) setError(result.error);
      else if (freshLink?.id === id) setFreshLink(null);
    });
  }

  async function copy(id: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  }

  return (
    <section className="border-border bg-card rounded-2xl border">
      <header className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="text-text-muted size-4" aria-hidden="true" />
          <h2 className="text-text-primary text-[14px] font-semibold">
            Waiting to accept
            <span className="text-text-muted ml-1.5 font-normal">({invitations.length})</span>
          </h2>
        </div>
      </header>

      {error && (
        <p role="alert" className="border-danger/30 bg-danger/[0.04] text-danger mx-4 mt-3 rounded-xl border px-3 py-2 text-[12px]">
          {error}
        </p>
      )}

      <ul className="divide-border divide-y">
        {invitations.map((invitation) => {
          const delivery = DELIVERY_DISPLAY[invitation.deliveryState] ?? DELIVERY_DISPLAY.unsent;
          const showingLink = freshLink?.id === invitation.id;

          return (
            <li key={invitation.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-text-primary truncate text-[13px] font-medium">
                      {invitation.fullName}
                    </span>
                    {invitation.roleName && (
                      <span className="text-text-muted text-[12px]">{invitation.roleName}</span>
                    )}
                    <StatusBadge label={delivery.label} colorHex={delivery.colorHex} />
                    {invitation.expired && <StatusBadge label="Expired" colorHex="#94a3b8" />}
                  </div>

                  <p className="text-text-muted mt-0.5 truncate text-[12px]">{invitation.email}</p>

                  <p className="text-text-muted mt-1 text-[12px]">
                    {invitation.expired
                      ? "This invitation has expired. Reissue it to give them a fresh link."
                      : delivery.note}
                  </p>
                </div>

                {canInvite && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<RefreshCw />}
                      onClick={() => reissue(invitation.id)}
                      isLoading={isPending && busyId === invitation.id}
                      disabled={isPending}
                    >
                      Reissue
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<X />}
                      onClick={() => revoke(invitation.id)}
                      disabled={isPending}
                    >
                      Withdraw
                    </Button>
                  </div>
                )}
              </div>

              {showingLink && (
                <div className="border-border bg-card-hover/40 mt-3 rounded-xl border p-2.5">
                  <p className="text-text-muted mb-1.5 text-[12px]">
                    New link — the previous one no longer works. Shown once.
                  </p>
                  <div className="flex items-start gap-2">
                    <code className="text-text-primary min-w-0 flex-1 text-[11px] break-all">
                      {freshLink.link}
                    </code>
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={copiedId === invitation.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                      onClick={() => copy(invitation.id, freshLink.link)}
                      className="shrink-0"
                    >
                      {copiedId === invitation.id ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
