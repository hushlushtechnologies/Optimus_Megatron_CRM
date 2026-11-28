"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Crown, Pencil, Plus, Power, ShieldAlert, Users } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { StatusBadge } from "@/src/components/ui/status-badge";
import { Tooltip } from "@/src/components/ui/tooltip";
import { ErrorState } from "@/src/components/shared/error-state";

import { PermissionsMatrix } from "@/src/components/users/permissions-matrix";
import { RoleFormDialog } from "@/src/components/users/role-form-dialog";

import { setRoleActive } from "@/app/admin/users/roles/role-actions";
import type { PermissionDefinition, RoleHistoryEntry } from "@/src/lib/supabase/role-queries";
import {
  rankLabel,
  refusalForDeactivation,
  refusalForRoleCreate,
  refusalForRoleEdit,
  ROLE_REFUSAL_MESSAGES,
  type RoleAuthorityContext,
  type RoleSummary,
} from "@/src/lib/utils/role-authority";

/*
| Roles and permissions.
|
| Two things on one page, because they are one question. "What can a Manager
| do" is answered by the grid, and "who is a Manager" by the list above it;
| splitting them across two screens means scrolling between them to make one
| decision.
*/

interface RolesClientProps {
  roles: RoleSummary[];
  permissions: PermissionDefinition[];
  grants: string[];
  activeHolderCounts: Record<string, number>;
  context: RoleAuthorityContext;
  history: RoleHistoryEntry[];
  readFailed: boolean;
  setupMissing: boolean;
}

export function RolesClient({
  roles,
  permissions,
  grants,
  activeHolderCounts,
  context,
  history,
  readFailed,
  setupMissing,
}: RolesClientProps) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<RoleSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleActive(role: RoleSummary) {
    setError(null);

    const formData = new FormData();
    formData.set("roleId", role.id);
    formData.set("active", String(!role.isActive));

    startTransition(async () => {
      const result = await setRoleActive(formData);
      if (result.error) setError(result.error);
    });
  }

  /* =======================================================
     SETUP AND FAILURE
  ======================================================= */

  if (setupMissing) {
    return (
      <div className="space-y-4">
        <Header canCreate={false} onCreate={() => undefined} />
        <div className="border-warning/30 bg-warning/[0.04] flex items-start gap-3 rounded-2xl border px-4 py-3">
          <ShieldAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-text-primary text-[13px] font-semibold">This screen needs its migration</p>
            <p className="text-text-muted mt-0.5 text-[12px]">
              Run <code className="text-text-primary">sql/19-sprint-11-role-management.sql</code> and reload. Until
              then the authority rules and the critical-permission guards do not exist, and a matrix without them
              would let you lock yourself out.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (readFailed) {
    return (
      <div className="space-y-4">
        <Header canCreate={false} onCreate={() => undefined} />
        <ErrorState
          title="Roles and permissions couldn't be read"
          description="Nothing has been changed. This is a read failure, not an empty permission set — nobody has lost any access."
        />
      </div>
    );
  }

  const createRefusal = refusalForRoleCreate(context, 30);

  return (
    <div className="space-y-5">
      <Header
        canCreate={createRefusal === null}
        createHint={createRefusal ? ROLE_REFUSAL_MESSAGES[createRefusal] : undefined}
        onCreate={() => setCreating(true)}
      />

      {error && (
        <p
          role="alert"
          className="border-danger/30 bg-danger/[0.04] text-danger rounded-xl border px-3 py-2 text-[12px]"
        >
          {error}
        </p>
      )}

      {/* =================================================
          THE ROLES
      ================================================= */}

      <section className="border-border bg-card rounded-2xl border">
        <header className="border-border border-b px-4 py-3">
          <h2 className="text-text-primary text-[14px] font-semibold">
            Roles <span className="text-text-muted font-normal">({roles.length})</span>
          </h2>
        </header>

        <ul className="divide-border divide-y">
          {roles.map((role) => {
            const editRefusal = refusalForRoleEdit(context, role);
            const activeRefusal = refusalForDeactivation(context, role);

            return (
              <li key={role.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {role.protected && (
                      <Tooltip content="Protected: can't be deactivated, can't lose a critical permission, and its authority can't change.">
                        <Crown className="text-primary size-3.5" aria-label="Protected role" />
                      </Tooltip>
                    )}
                    <span
                      className={
                        role.isActive
                          ? "text-text-primary text-[13px] font-medium"
                          : "text-text-subtle text-[13px] font-medium line-through"
                      }
                    >
                      {role.name}
                    </span>
                    <StatusBadge label={rankLabel(role.rank)} colorHex="#60a5fa" />
                    {!role.isActive && <StatusBadge label="Out of use" colorHex="#94a3b8" />}
                  </div>

                  {role.description && <p className="text-text-muted mt-0.5 text-[12px]">{role.description}</p>}

                  <p className="text-text-muted mt-1 inline-flex items-center gap-1.5 text-[12px]">
                    <Users className="size-3.5" aria-hidden="true" />
                    {role.memberCount === 0
                      ? "Nobody in this role"
                      : role.memberCount === 1
                        ? "1 staff member"
                        : `${role.memberCount} staff members`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Pencil aria-hidden="true" />}
                    onClick={() => setEditing(role)}
                    disabled={editRefusal !== null || isPending}
                    title={editRefusal ? ROLE_REFUSAL_MESSAGES[editRefusal] : undefined}
                  >
                    Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<Power aria-hidden="true" />}
                    onClick={() => toggleActive(role)}
                    disabled={(role.isActive ? activeRefusal !== null : editRefusal !== null) || isPending}
                    title={
                      role.isActive && activeRefusal
                        ? ROLE_REFUSAL_MESSAGES[activeRefusal]
                        : !role.isActive && editRefusal
                          ? ROLE_REFUSAL_MESSAGES[editRefusal]
                          : undefined
                    }
                  >
                    {role.isActive ? "Take out of use" : "Bring back"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* =================================================
          THE MATRIX
      ================================================= */}

      <section className="border-border bg-card rounded-2xl border p-4">
        <h2 className="text-text-primary mb-3 text-[14px] font-semibold">What each role can do</h2>
        <PermissionsMatrix
          roles={roles}
          permissions={permissions}
          grants={grants}
          activeHolderCounts={activeHolderCounts}
          context={context}
        />
      </section>

      {/* =================================================
          HISTORY
      ================================================= */}

      {history.length > 0 && (
        <section className="border-border bg-card rounded-2xl border p-4">
          <h2 className="text-text-primary mb-3 text-[14px] font-semibold">Recent changes to roles</h2>
          <ul className="space-y-2">
            {history.slice(0, 12).map((entry) => (
              <li key={entry.id} className="text-[12px]">
                <span className="text-text-primary">{describeRoleChange(entry)}</span>
                <span className="text-text-muted">
                  {" · "}
                  {new Date(entry.at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Dubai",
                  })}
                  {entry.actorName && ` · by ${entry.actorName}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* =================================================
          DIALOGS
      ================================================= */}

      <RoleFormDialog open={creating} onClose={() => setCreating(false)} role={null} context={context} />

      {editing && (
        <RoleFormDialog open onClose={() => setEditing(null)} role={editing} context={context} />
      )}
    </div>
  );
}

function Header({
  canCreate,
  createHint,
  onCreate,
}: {
  canCreate: boolean;
  createHint?: string;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Link
          href="/admin/users"
          className="text-text-muted hover:text-text-primary text-[13px] transition-colors"
        >
          Staff &amp; Users
        </Link>
        <h1 className="text-text-primary mt-1 text-[19px] leading-6 font-semibold tracking-[-0.02em]">
          Roles &amp; permissions
        </h1>
        <p className="text-text-muted mt-1 text-[13px]">
          What each role can do, and who can change it.
        </p>
      </div>

      <Button
        size="sm"
        leftIcon={<Plus aria-hidden="true" />}
        onClick={onCreate}
        disabled={!canCreate}
        title={createHint}
      >
        New role
      </Button>
    </div>
  );
}

function describeRoleChange(entry: RoleHistoryEntry): string {
  const name = entry.roleName ?? "A role";

  switch (entry.field) {
    case "created":
      return `${name} was created`;
    case "name":
      return `${entry.fromValue} was renamed to ${entry.toValue}`;
    case "rank":
      return `${name}'s authority changed from ${rankLabel(Number(entry.fromValue))} to ${rankLabel(Number(entry.toValue))}`;
    case "is_active":
      return entry.toValue === "true" ? `${name} was brought back into use` : `${name} was taken out of use`;
    case "description":
      return `${name}'s description was updated`;
    default:
      return `${name} was changed`;
  }
}
