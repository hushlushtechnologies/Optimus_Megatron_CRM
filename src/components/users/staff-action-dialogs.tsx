"use client";

import { useState, useTransition } from "react";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";

import { changeStaffRole, changeStaffStatus, updateStaffDetails } from "@/app/admin/users/staff-actions";
import type { StaffMember, StaffRoleOption, StaffStatus } from "@/src/lib/types/staff";

/*
| The three things you can do to a staff account, and the confirmation each one
| deserves.
|
| EDITING DETAILS is reversible and low-stakes, so it is a plain form.
|
| CHANGING A ROLE changes what somebody can do, so it names the old role and the
| new one and asks why.
|
| TAKING ACCESS AWAY — suspending or offboarding — requires a reason, because
| the question six months from now is "why is this person suspended" and the
| history is the only thing that can answer it. Restoring access does not: "they
| are back" explains itself.
|
| NONE OF THESE DIALOGS IS A SECURITY BOUNDARY. The action re-checks, and the
| database functions in sql/16 decide. What these do is avoid offering a button
| that is going to be refused, and make the refusal readable when it happens
| anyway — which it can, if somebody else changed something while this page was
| open.
*/

/* ==========================================================================
   EDIT DETAILS
========================================================================== */

export function StaffEditDialog({
  open,
  onClose,
  staff,
}: {
  open: boolean;
  onClose: () => void;
  staff: StaffMember;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await updateStaffDetails(formData);

      if (result.error) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      onClose();
    });
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="md"
      title="Edit details"
      description="Role and access are changed separately."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="staff-edit-form" isLoading={isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="staff-edit-form" action={submit} className="space-y-4">
        <input type="hidden" name="profileId" value={staff.id} />

        <Input
          label="Full name"
          name="fullName"
          required
          defaultValue={staff.fullName}
          error={fieldErrors.fullName}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Department"
            name="department"
            defaultValue={staff.department ?? ""}
            error={fieldErrors.department}
          />
          <Input
            label="Job title"
            name="jobTitle"
            defaultValue={staff.jobTitle ?? ""}
            error={fieldErrors.jobTitle}
          />
        </div>

        <Input label="Phone" name="phone" defaultValue={staff.phone ?? ""} error={fieldErrors.phone} />

        <p className="text-text-muted text-[12px]">
          The email address is the account&apos;s sign-in and can&apos;t be changed from here.
        </p>

        {error && (
          <p role="alert" className="border-danger/30 bg-danger/[0.04] text-danger rounded-xl border px-3 py-2 text-[12px]">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

/* ==========================================================================
   CHANGE ROLE
========================================================================== */

export function StaffRoleDialog({
  open,
  onClose,
  staff,
  roles,
  myRank,
  isProtected,
}: {
  open: boolean;
  onClose: () => void;
  staff: StaffMember;
  roles: StaffRoleOption[];
  myRank: number | null;
  isProtected: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Same rule as staff_assign_role(): a protected-role holder may assign
  // anything, everybody else only strictly below themselves.
  const assignable = isProtected ? roles : roles.filter((role) => myRank !== null && role.rank > myRank);

  function submit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const result = await changeStaffRole(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      onClose();
    });
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="md"
      title="Change role"
      description={`${staff.fullName} is currently ${staff.roleName ?? "without a role"}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="staff-role-form" isLoading={isPending} disabled={assignable.length === 0}>
            Change role
          </Button>
        </>
      }
    >
      <form id="staff-role-form" action={submit} className="space-y-4">
        <input type="hidden" name="profileId" value={staff.id} />

        <Select
          label="New role"
          name="roleId"
          required
          defaultValue=""
          options={
            assignable.length > 0
              ? [
                  { value: "", label: "Choose a role" },
                  ...assignable.map((role) => ({
                    value: role.id,
                    label: role.id === staff.roleId ? `${role.name} (current)` : role.name,
                  })),
                ]
              : [{ value: "", label: "No roles you can assign" }]
          }
        />

        {assignable.length === 0 && (
          <p className="text-text-muted text-[12px]">
            Every role is at or above your own authority. A Super Admin can make this change.
          </p>
        )}

        <Textarea
          label="Why (optional)"
          name="reason"
          rows={2}
          maxLength={400}
          showCharacterCount
          placeholder="Promoted to run the Al Quoz showroom"
          hint="Goes into the account's history."
        />

        {staff.roleProtected && (
          <div className="border-warning/30 bg-warning/[0.04] flex items-start gap-2.5 rounded-xl border px-3 py-2.5">
            <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="text-text-muted text-[12px]">
              This account holds the protected role. If it is the last active one, the change will be refused —
              promote someone else first.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="border-danger/30 bg-danger/[0.04] text-danger rounded-xl border px-3 py-2 text-[12px]">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

/* ==========================================================================
   SUSPEND / REACTIVATE / OFFBOARD
========================================================================== */

const STATUS_COPY: Record<
  Exclude<StaffStatus, "invited">,
  { title: string; description: string; confirm: string; needsReason: boolean; destructive: boolean }
> = {
  suspended: {
    title: "Suspend access",
    description: "They stay on the staff list and keep all their records, but cannot sign in.",
    confirm: "Suspend access",
    needsReason: true,
    destructive: true,
  },
  deactivated: {
    title: "Offboard",
    description:
      "For someone who has left. Nothing is deleted — their sales, test drives, payments and approvals all stay exactly as they are.",
    confirm: "Offboard",
    needsReason: true,
    destructive: true,
  },
  active: {
    title: "Restore access",
    description: "They will be able to sign in again with the password they already have.",
    confirm: "Restore access",
    needsReason: false,
    destructive: false,
  },
};

export function StaffStatusDialog({
  open,
  onClose,
  staff,
  nextStatus,
  blockedReason,
}: {
  open: boolean;
  onClose: () => void;
  staff: StaffMember;
  nextStatus: Exclude<StaffStatus, "invited">;
  /** Set when the interface already knows this will be refused. */
  blockedReason: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const copy = STATUS_COPY[nextStatus];

  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await changeStaffStatus(formData);

      if (result.error) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      onClose();
    });
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="md"
      title={copy.title}
      description={`${staff.fullName}${staff.roleName ? ` · ${staff.roleName}` : ""}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="staff-status-form"
            variant={copy.destructive ? "destructive" : "primary"}
            isLoading={isPending}
            disabled={blockedReason !== null}
          >
            {copy.confirm}
          </Button>
        </>
      }
    >
      <form id="staff-status-form" action={submit} className="space-y-4">
        <input type="hidden" name="profileId" value={staff.id} />
        <input type="hidden" name="status" value={nextStatus} />

        <p className="text-text-muted text-[13px]">{copy.description}</p>

        {blockedReason ? (
          <div className="border-danger/30 bg-danger/[0.04] flex items-start gap-2.5 rounded-xl border px-3 py-2.5">
            <AlertTriangle className="text-danger mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="text-text-muted text-[12px]">{blockedReason}</p>
          </div>
        ) : (
          <Textarea
            label={copy.needsReason ? "Why" : "Note (optional)"}
            name="reason"
            required={copy.needsReason}
            rows={3}
            maxLength={400}
            showCharacterCount
            placeholder={
              nextStatus === "suspended"
                ? "On leave pending a review"
                : nextStatus === "deactivated"
                  ? "Left the company on 30 November"
                  : "Back from leave"
            }
            error={fieldErrors.reason}
            hint="Goes into the account's history, where it stays."
          />
        )}

        {error && (
          <p role="alert" className="border-danger/30 bg-danger/[0.04] text-danger rounded-xl border px-3 py-2 text-[12px]">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
