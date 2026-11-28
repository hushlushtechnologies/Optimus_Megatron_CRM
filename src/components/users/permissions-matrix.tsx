"use client";

import { Fragment, useMemo, useOptimistic, useState, useTransition } from "react";

import { AlertTriangle, Crown, Lock, ShieldAlert } from "lucide-react";

import { Tooltip } from "@/src/components/ui/tooltip";
import { toggleRolePermission } from "@/app/admin/users/roles/role-actions";
import type { PermissionDefinition } from "@/src/lib/supabase/role-queries";
import {
  GRANT_REFUSAL_MESSAGES,
  groupByModule,
  rankLabel,
  refusalForGrantToggle,
  type RoleAuthorityContext,
  type RoleSummary,
} from "@/src/lib/utils/role-authority";

/*
| Roles across the top, permissions down the side.
|
| WHY EVERY REFUSED BOX IS DISABLED-WITH-A-REASON RATHER THAN HIDDEN
|
| A matrix is a wall of several hundred checkboxes. Hiding the ones somebody
| cannot use leaves holes in a grid, which reads as a rendering fault; and it
| leaves them hunting for a permission they were told exists. A disabled box
| that says "you can't grant a permission you don't hold yourself" teaches the
| actual rule in one hover.
|
| The reasons come from refusalForGrantToggle(), which is the same function the
| 162-case cross product checked against the real SQL. So the sentence on the
| tooltip is the sentence the database would have raised.
|
| OPTIMISTIC, BUT HONEST ABOUT FAILING
|
| A grid where each click waits for a round trip is miserable to use, so the
| box flips immediately. If the action comes back with an error the box flips
| back and the error appears above the grid — never a tick that is not really
| there.
|
| THE CHECKBOX IS A NATIVE INPUT
|
| There is no Checkbox in src/components/ui, and a matrix is the wrong place to
| introduce one: Switch is far too large at this density. A native input keeps
| the keyboard and screen-reader behaviour for free, styled with accent-color
| so it still follows the theme.
*/

interface PermissionsMatrixProps {
  roles: RoleSummary[];
  permissions: PermissionDefinition[];
  grants: string[];
  activeHolderCounts: Record<string, number>;
  context: RoleAuthorityContext;
}

export function PermissionsMatrix({
  roles,
  permissions,
  grants,
  activeHolderCounts,
  context,
}: PermissionsMatrixProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [optimisticGrants, applyOptimistic] = useOptimistic(
    new Set(grants),
    (current: Set<string>, change: { cell: string; granted: boolean }) => {
      const next = new Set(current);
      if (change.granted) next.add(change.cell);
      else next.delete(change.cell);
      return next;
    },
  );

  const groups = useMemo(() => groupByModule(permissions), [permissions]);

  function toggle(role: RoleSummary, permission: PermissionDefinition, currentlyGranted: boolean) {
    const cell = `${role.id}:${permission.key}`;
    setError(null);

    const formData = new FormData();
    formData.set("roleId", role.id);
    formData.set("permission", permission.key);
    formData.set("granted", String(!currentlyGranted));

    startTransition(async () => {
      applyOptimistic({ cell, granted: !currentlyGranted });

      const result = await toggleRolePermission(formData);

      if (result.error) {
        // The optimistic value is discarded when the transition ends, so the
        // box returns to the server's truth on its own. All that is needed
        // here is to say why.
        setError(`${role.name} · ${permission.label} — ${result.error}`);
      }
    });
  }

  if (roles.length === 0 || permissions.length === 0) {
    return (
      <p className="text-text-muted py-8 text-center text-[13px]">
        There are no roles or permissions to show yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p
          role="alert"
          className="border-danger/30 bg-danger/[0.04] text-danger rounded-xl border px-3 py-2 text-[12px]"
        >
          {error}
        </p>
      )}

      <p className="text-text-muted text-[12px]">
        A box you can&apos;t tick has a reason — hover it. Changes save as you click and are recorded in the
        role&apos;s history.
      </p>

      {/*
        Horizontally scrollable, with the project's hidden scrollbar. Hiding
        the bar removes the mouse route, so the cells themselves are the
        keyboard route: every checkbox is focusable and tabbing across a row
        scrolls the container to follow focus.
      */}
      <div
        className="scrollbar-hidden border-border overflow-x-auto rounded-2xl border"
        tabIndex={0}
        role="region"
        aria-label="Permissions by role. Scroll sideways, or tab through the boxes."
      >
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-card-hover/60">
              <th
                scope="col"
                className="border-border bg-card sticky left-0 z-10 min-w-[220px] border-r border-b px-3 py-2.5 text-left font-semibold"
              >
                Permission
              </th>

              {roles.map((role) => (
                <th
                  key={role.id}
                  scope="col"
                  className="border-border min-w-[104px] border-b px-2 py-2.5 text-center font-semibold"
                >
                  <span className="inline-flex flex-col items-center gap-0.5">
                    <span className="inline-flex items-center gap-1">
                      {role.protected && <Crown className="text-primary size-3" aria-label="Protected" />}
                      <span className={role.isActive ? "text-text-primary" : "text-text-subtle line-through"}>
                        {role.name}
                      </span>
                    </span>
                    <span className="text-text-subtle text-[11px] font-normal">{rankLabel(role.rank)}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {groups.map((group) => (
              // A keyed Fragment, not <>: the list key has to sit on the
              // element the map returns, and a bare fragment cannot take one.
              <Fragment key={group.module}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={roles.length + 1}
                    className="border-border bg-card-hover/40 text-text-muted border-b px-3 py-1.5 text-left text-[11px] font-semibold tracking-wide uppercase"
                  >
                    {group.module}
                  </th>
                </tr>

                {group.items.map((permission) => (
                  <tr key={permission.key} className="hover:bg-card-hover/30">
                    <th
                      scope="row"
                      className="border-border bg-card sticky left-0 z-10 border-r border-b px-3 py-2 text-left font-normal"
                    >
                      <span className="flex items-start gap-1.5">
                        <span className="min-w-0">
                          <span className="text-text-primary block">{permission.label}</span>
                          <code className="text-text-subtle text-[11px]">{permission.key}</code>
                        </span>

                        {permission.isCritical && (
                          <Tooltip content="Critical: the last active role holding this can't lose it, and the protected role always keeps it.">
                            <ShieldAlert className="text-warning mt-0.5 size-3.5 shrink-0" aria-label="Critical permission" />
                          </Tooltip>
                        )}
                      </span>
                    </th>

                    {roles.map((role) => {
                      const cell = `${role.id}:${permission.key}`;
                      const granted = optimisticGrants.has(cell);

                      const refusal = refusalForGrantToggle(context, {
                        role,
                        permissionKey: permission.key,
                        isCritical: permission.isCritical,
                        granted,
                        activeHolderCount: activeHolderCounts[permission.key] ?? 0,
                      });

                      const label = `${granted ? "Remove" : "Give"} ${permission.label} ${granted ? "from" : "to"} ${role.name}`;

                      const box = (
                        <input
                          type="checkbox"
                          checked={granted}
                          disabled={refusal !== null || isPending}
                          onChange={() => toggle(role, permission, granted)}
                          aria-label={label}
                          className="accent-primary size-4 cursor-pointer rounded disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      );

                      return (
                        <td key={cell} className="border-border border-b px-2 py-2 text-center">
                          {refusal === null ? (
                            box
                          ) : (
                            <Tooltip content={GRANT_REFUSAL_MESSAGES[refusal]}>
                              <span className="inline-flex items-center justify-center gap-1">
                                {box}
                                {refusal === "protected-keeps-critical" || refusal === "last-critical-holder" ? (
                                  <Lock className="text-text-subtle size-3" aria-hidden="true" />
                                ) : null}
                              </span>
                            </Tooltip>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {!context.canManageRoles && !context.isProtected && (
        <div className="border-border bg-card-hover/40 flex items-start gap-2.5 rounded-xl border px-3 py-2.5">
          <AlertTriangle className="text-text-muted mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="text-text-muted text-[12px]">
            You can see this grid but not change it — that needs{" "}
            <code className="text-text-primary">roles.manage</code>.
          </p>
        </div>
      )}
    </div>
  );
}
