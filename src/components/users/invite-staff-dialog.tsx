"use client";

import { useState, useTransition } from "react";

import { Check, Copy, Link2, Mail, MailWarning } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { Select } from "@/src/components/ui/select";
import { inviteStaff, type InviteStaffResult } from "@/app/admin/users/invitation-actions";
import type { StaffRoleOption } from "@/src/lib/types/staff";

/*
| Inviting a member of staff.
|
| TWO STEPS, AND THE SECOND ONE MATTERS
|
| The form creates the invitation; then the dialog shows the link. It has to,
| because this build cannot send email — see src/lib/mail/provider.ts. The link
| is shown ONCE and there is no way to get it back: only its digest is stored.
| So the second step says so plainly and makes the link easy to copy, rather
| than burying it or implying something was sent.
|
| ROLE CHOICES ARE FILTERED TO WHAT THIS PERSON MAY GRANT
|
| A role at or above the inviter's own authority is not offered. The action
| checks this again server-side — the filtering here is so the form does not
| present a choice that will be refused, not a security measure.
*/

interface InviteStaffDialogProps {
  open: boolean;
  onClose: () => void;
  roles: StaffRoleOption[];
  myRank: number | null;
  isProtected: boolean;
}

export function InviteStaffDialog({ open, onClose, roles, myRank, isProtected }: InviteStaffDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<InviteStaffResult["invitation"] | null>(null);
  const [copied, setCopied] = useState(false);

  /*
  | A holder of the protected role may grant anything. Everybody else may grant
  | only strictly below themselves, which is staff_assign_role()'s rule and
  | the invite action's rule.
  */
  const grantable = isProtected ? roles : roles.filter((role) => myRank !== null && role.rank > myRank);

  function reset() {
    setError(null);
    setFieldErrors({});
    setIssued(null);
    setCopied(false);
  }

  function close() {
    reset();
    onClose();
  }

  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await inviteStaff(formData);

      if (result.error) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      setIssued(result.invitation ?? null);
    });
  }

  async function copyLink() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused. The link is selectable in the box
      // below either way, so there is nothing to recover from.
      setCopied(false);
    }
  }

  /* =======================================================
     STEP 2 — the link
  ======================================================= */

  if (issued) {
    const sent = issued.deliveryState === "sent";

    return (
      <Modal
        isOpen={open}
        onClose={close}
        size="md"
        title={`${issued.fullName} has been invited`}
        description={issued.email}
        footer={<Button onClick={close}>Done</Button>}
      >
        <div className="space-y-4">
          {sent ? (
            <div className="border-success/30 bg-success/[0.04] flex items-start gap-3 rounded-xl border px-3 py-2.5">
              <Mail className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p className="text-text-muted text-[12px]">
                An invitation email was sent to <span className="text-text-primary">{issued.email}</span>.
              </p>
            </div>
          ) : (
            <div className="border-warning/30 bg-warning/[0.04] flex items-start gap-3 rounded-xl border px-3 py-2.5">
              <MailWarning className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-text-primary text-[12px] font-semibold">
                  {issued.deliveryState === "not_configured"
                    ? "No email was sent — this build has no mail provider"
                    : "The email could not be sent"}
                </p>
                <p className="text-text-muted mt-0.5 text-[12px]">
                  {issued.deliveryError ??
                    "Send this link to them yourself. It is the only way into the account."}
                </p>
              </div>
            </div>
          )}

          <div>
            <p className="text-label mb-1.5 flex items-center gap-1.5">
              <Link2 className="size-3.5" aria-hidden="true" />
              Invitation link
            </p>
            <div className="border-border bg-card-hover/40 flex items-start gap-2 rounded-xl border p-2.5">
              <code className="text-text-primary min-w-0 flex-1 text-[11px] break-all">
                {issued.link}
              </code>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                onClick={copyLink}
                className="shrink-0"
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-text-muted mt-1.5 text-[12px]">
              Shown once — only a one-way digest of it is stored, so it cannot be looked up again. It expires{" "}
              {new Date(issued.expiresAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              . If it is lost, reissue it from the staff list.
            </p>
          </div>

          <p className="text-text-muted text-[12px]">
            They choose their own password when they open it. Nobody here sets one, and nobody can see it.
          </p>
        </div>
      </Modal>
    );
  }

  /* =======================================================
     STEP 1 — the form
  ======================================================= */

  return (
    <Modal
      isOpen={open}
      onClose={close}
      size="md"
      title="Invite a member of staff"
      description="They will choose their own password when they accept."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="invite-staff-form" isLoading={isPending}>
            Create invitation
          </Button>
        </>
      }
    >
      <form id="invite-staff-form" action={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            name="fullName"
            required
            autoComplete="off"
            placeholder="Fatima Al Marzooqi"
            error={fieldErrors.fullName}
          />
          <Input
            label="Work email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="fatima@optimusmegatron.ae"
            error={fieldErrors.email}
          />
        </div>

        <Select
          label="Role"
          name="roleId"
          required
          error={fieldErrors.roleId}
          options={
            grantable.length > 0
              ? [
                  { value: "", label: "Choose a role" },
                  ...grantable.map((role) => ({ value: role.id, label: role.name })),
                ]
              : [{ value: "", label: "No roles you can assign" }]
          }
        />

        {grantable.length < roles.length && (
          <p className="text-text-muted text-[12px]">
            Roles at or above your own authority are not listed. A Super Admin can invite into those.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Department" name="department" autoComplete="off" placeholder="Sales" error={fieldErrors.department} />
          <Input label="Job title" name="jobTitle" autoComplete="off" placeholder="Sales Executive" error={fieldErrors.jobTitle} />
        </div>

        <Input label="Phone" name="phone" autoComplete="off" placeholder="+971 50 000 0000" error={fieldErrors.phone} />

        {error && (
          <p role="alert" className="border-danger/30 bg-danger/[0.04] text-danger rounded-xl border px-3 py-2 text-[12px]">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
