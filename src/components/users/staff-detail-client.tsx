"use client";

import { useState } from "react";
import Link from "next/link";

import {
  ArrowLeft,
  Building2,
  Briefcase,
  Crown,
  Mail,
  Pencil,
  Phone,
  RotateCcw,
  ShieldAlert,
  UserCog,
  UserMinus,
  UserX,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  StaffEditDialog,
  StaffRoleDialog,
  StaffStatusDialog,
} from "@/src/components/users/staff-action-dialogs";
import { StaffHistoryTimeline } from "@/src/components/users/staff-history-timeline";
import { StaffStatusBadge } from "@/src/components/users/staff-status-badge";

import type { StaffHistoryEntry } from "@/src/lib/supabase/staff-detail-queries";
import type { StaffMember, StaffPermissions, StaffRoleOption, StaffStatus } from "@/src/lib/types/staff";
import {
  refusalForStatusChange,
  STAFF_REFUSAL_MESSAGES,
  type StaffActionRefusal,
} from "@/src/lib/utils/staff-filters";

/*
| One staff account: who they are, what they can do, and what has been done to
| the account.
|
| WHICH BUTTONS APPEAR
|
| Decided by refusalForStatusChange(), the same function the staff list uses and
| the same rules staff_set_status() enforces in the database. A button that
| would be refused is shown DISABLED with the reason, rather than hidden.
|
| That is deliberate. A hidden button leaves somebody hunting for a feature they
| were told exists; a disabled one that says "this is the last active Super
| Admin" tells them what to do instead. The only thing hidden outright is the
| whole action group, when the viewer has no users.manage at all — there is no
| useful reason to show somebody a wall of greyed-out buttons.
*/

interface StaffDetailClientProps {
  staff: StaffMember;
  allStaff: StaffMember[];
  roles: StaffRoleOption[];
  permissions: StaffPermissions;
  history: StaffHistoryEntry[];
  historyReadFailed: boolean;
}

export function StaffDetailClient({
  staff,
  allStaff,
  roles,
  permissions,
  history,
  historyReadFailed,
}: StaffDetailClientProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Exclude<StaffStatus, "invited"> | null>(null);

  function refusal(next: StaffStatus): StaffActionRefusal {
    return refusalForStatusChange(permissions, staff, next, allStaff);
  }

  function reasonFor(next: StaffStatus): string | null {
    const result = refusal(next);
    return result === null ? null : STAFF_REFUSAL_MESSAGES[result];
  }

  const isSelf = permissions.selfId === staff.id;

  return (
    <div className="space-y-5">
      {/* =================================================
          BACK
      ================================================= */}

      <Link
        href="/admin/users"
        className="text-text-muted hover:text-text-primary inline-flex items-center gap-1.5 text-[13px] transition-colors"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        All staff
      </Link>

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="border-border bg-card rounded-2xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-text-primary text-[19px] leading-6 font-semibold tracking-[-0.02em]">
                {staff.fullName}
              </h1>
              {staff.roleProtected && <Crown className="text-primary size-4" aria-label="Protected role" />}
              <StaffStatusBadge status={staff.status} />
              {isSelf && <span className="text-text-muted text-[12px]">(you)</span>}
            </div>

            <div className="text-text-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
              {staff.staffCode && <span className="tabular-nums">{staff.staffCode}</span>}

              {staff.roleName ? (
                <span className="inline-flex items-center gap-1.5">
                  <UserCog className="size-3.5" aria-hidden="true" />
                  {staff.roleName}
                </span>
              ) : (
                <span className="text-danger inline-flex items-center gap-1.5 font-medium">
                  <ShieldAlert className="size-3.5" aria-hidden="true" />
                  No role — cannot reach the admin area
                </span>
              )}

              {staff.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" aria-hidden="true" />
                  {staff.email}
                </span>
              )}

              {staff.phone && (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Phone className="size-3.5" aria-hidden="true" />
                  {staff.phone}
                </span>
              )}

              {staff.department && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="size-3.5" aria-hidden="true" />
                  {staff.department}
                </span>
              )}

              {staff.jobTitle && (
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="size-3.5" aria-hidden="true" />
                  {staff.jobTitle}
                </span>
              )}
            </div>
          </div>

          {permissions.canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" leftIcon={<Pencil />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>

              <Button size="sm" variant="secondary" leftIcon={<UserCog />} onClick={() => setRoleOpen(true)}>
                Change role
              </Button>

              {staff.status === "active" && (
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<UserX />}
                  onClick={() => setStatusTarget("suspended")}
                  disabled={refusal("suspended") !== null}
                  title={reasonFor("suspended") ?? undefined}
                >
                  Suspend
                </Button>
              )}

              {(staff.status === "suspended" || staff.status === "deactivated") && (
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<RotateCcw />}
                  onClick={() => setStatusTarget("active")}
                  disabled={refusal("active") !== null}
                  title={reasonFor("active") ?? undefined}
                >
                  Restore access
                </Button>
              )}

              {staff.status !== "deactivated" && (
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<UserMinus />}
                  onClick={() => setStatusTarget("deactivated")}
                  disabled={refusal("deactivated") !== null}
                  title={reasonFor("deactivated") ?? undefined}
                >
                  Offboard
                </Button>
              )}
            </div>
          )}
        </div>

        {/* A disabled button's reason is in its title, which a touch device
            never shows. The important ones are spelled out here instead. */}
        {permissions.canManage && staff.status === "active" && refusal("suspended") !== null && (
          <p className="border-border text-text-muted mt-4 border-t pt-3 text-[12px]">
            {reasonFor("suspended")}
          </p>
        )}
      </div>

      {/* =================================================
          WHAT OFFBOARDING MEANS

          Stated on the page rather than only inside the confirmation, because
          the fear that stops people offboarding properly is that it deletes
          something — so they leave accounts active instead, which is worse.
      ================================================= */}

      {staff.status === "deactivated" && (
        <div className="border-border bg-card-hover/40 rounded-2xl border px-4 py-3">
          <p className="text-text-primary text-[13px] font-semibold">This person has been offboarded</p>
          <p className="text-text-muted mt-0.5 text-[12px]">
            They cannot sign in. Everything they did is untouched — their sales, test drives, payments,
            approvals and assignments all still name them, which is why last year&apos;s figures still add up.
            Restore access if they come back.
          </p>
        </div>
      )}

      {/* =================================================
          HISTORY
      ================================================= */}

      <section className="border-border bg-card rounded-2xl border p-5">
        <h2 className="text-text-primary mb-4 text-[14px] font-semibold">Account history</h2>
        <StaffHistoryTimeline history={history} readFailed={historyReadFailed} />
      </section>

      {/* =================================================
          DIALOGS
      ================================================= */}

      <StaffEditDialog open={editOpen} onClose={() => setEditOpen(false)} staff={staff} />

      <StaffRoleDialog
        open={roleOpen}
        onClose={() => setRoleOpen(false)}
        staff={staff}
        roles={roles}
        myRank={permissions.myRank}
        isProtected={permissions.isProtected}
      />

      {statusTarget && (
        <StaffStatusDialog
          open
          onClose={() => setStatusTarget(null)}
          staff={staff}
          nextStatus={statusTarget}
          blockedReason={reasonFor(statusTarget)}
        />
      )}
    </div>
  );
}
