"use client";

import { useState, useTransition } from "react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";

import { saveRole } from "@/app/admin/users/roles/role-actions";
import {
  assignableRanks,
  RANK_BANDS,
  type RoleAuthorityContext,
  type RoleSummary,
} from "@/src/lib/utils/role-authority";

/*
| Creating or editing a role.
|
| AUTHORITY IS A PICKER, NOT A NUMBER
|
| Rank is what every safeguard in sql/19 compares, but "20" means nothing on a
| screen, and a free-text number invites somebody to type 15 and wonder why it
| sits between two things. So the five bands are offered by name, and only the
| ones below the person's own authority are listed — the same filter
| assignableRanks() applies and role_update() enforces.
|
| Rank 0 is never offered. It belongs to the protected role, and sql/19 refuses
| to let anything else claim it.
*/

interface RoleFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Null when creating. */
  role: RoleSummary | null;
  context: RoleAuthorityContext;
}

export function RoleFormDialog({ open, onClose, role, context }: RoleFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const allowed = assignableRanks(
    context,
    RANK_BANDS.map((band) => band.rank),
  );

  // When editing, the role's current band stays in the list even if it is not
  // otherwise assignable, so saving a description does not silently move it.
  const options = RANK_BANDS.filter(
    (band) => allowed.includes(band.rank) || (role !== null && band.rank === role.rank),
  );

  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await saveRole(formData);

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
      title={role ? `Edit the ${role.name} role` : "New role"}
      description={
        role
          ? "Renaming is safe — nothing in the application matches on role names any more."
          : "A role is a set of permissions. You choose what it can do on the grid below."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="role-form" isLoading={isPending} disabled={options.length === 0}>
            {role ? "Save changes" : "Create role"}
          </Button>
        </>
      }
    >
      <form id="role-form" action={submit} className="space-y-4">
        <input type="hidden" name="roleId" value={role?.id ?? ""} />

        <Input
          label="Name"
          name="name"
          required
          defaultValue={role?.name ?? ""}
          placeholder="Showroom Manager"
          error={fieldErrors.name}
        />

        <Select
          label="Authority"
          name="rank"
          required
          defaultValue={role ? String(role.rank) : ""}
          error={fieldErrors.rank}
          options={
            options.length > 0
              ? [
                  { value: "", label: "Choose an authority level" },
                  ...options.map((band) => ({
                    value: String(band.rank),
                    label: `${band.label} — ${band.hint}`,
                  })),
                ]
              : [{ value: "", label: "No authority level you can assign" }]
          }
        />

        {options.length === 0 && (
          <p className="text-text-muted text-[12px]">
            Every level is at or above your own authority. A Super Admin can create roles there.
          </p>
        )}

        <p className="text-text-muted text-[12px]">
          Authority decides who can edit whom. A role can only be managed by someone above it, and nobody can
          create a role at or above their own level.
        </p>

        <Textarea
          label="What is this role for? (optional)"
          name="description"
          rows={2}
          maxLength={240}
          showCharacterCount
          defaultValue={role?.description ?? ""}
          placeholder="Runs the Al Quoz showroom day to day"
        />

        {error && (
          <p
            role="alert"
            className="border-danger/30 bg-danger/[0.04] text-danger rounded-xl border px-3 py-2 text-[12px]"
          >
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
