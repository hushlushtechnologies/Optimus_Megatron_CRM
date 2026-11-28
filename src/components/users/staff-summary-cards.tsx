"use client";

import { ShieldAlert, ShieldCheck, UserMinus, UserPlus, Users, UserX } from "lucide-react";

import { MetricCard } from "@/src/components/shared/metric-card";
import type { StaffSummary } from "@/src/lib/types/staff";

/*
| The six figures above the staff table.
|
| Icons are imported here, inside a Client Component, and never passed in as
| props from the page. A Lucide icon is a function component and a function
| cannot cross the server/client boundary — it compiles, it type-checks, it
| passes every test, and it throws when the page renders. That is exactly how
| the settings module broke in Sprint 10.
|
| readFailed is not cosmetic. Six zeros is a claim about the company: that
| nobody works here. When the read failed, the cards say so instead.
*/

export function StaffSummaryCards({ summary }: { summary: StaffSummary }) {
  if (summary.readFailed) {
    return (
      <div className="border-danger/30 bg-danger/[0.04] flex items-start gap-3 rounded-2xl border px-4 py-3">
        <ShieldAlert className="text-danger mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-text-primary text-[13px] font-semibold">Staff figures couldn&apos;t be read</p>
          <p className="text-text-muted mt-0.5 text-[12px]">
            The counts below are not available. This is a read failure, not an empty company — nothing has been
            changed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <MetricCard label="Total Staff" value={summary.total} icon={<Users />} accent="primary" caption="All accounts" />
      <MetricCard
        label="Active"
        value={summary.active}
        icon={<ShieldCheck />}
        accent="success"
        caption="Can sign in"
      />
      <MetricCard
        label="Invited"
        value={summary.invited}
        icon={<UserPlus />}
        accent="info"
        caption="Not signed in yet"
      />
      <MetricCard
        label="Suspended"
        value={summary.suspended}
        icon={<UserX />}
        accent="warning"
        caption="Access blocked"
      />
      <MetricCard
        label="Deactivated"
        value={summary.deactivated}
        icon={<UserMinus />}
        accent="muted"
        caption="No longer here"
      />
      <MetricCard
        label="No Role"
        value={summary.withoutRole}
        icon={<ShieldAlert />}
        accent={summary.withoutRole > 0 ? "danger" : "muted"}
        caption={summary.withoutRole > 0 ? "Cannot reach admin" : "All assigned"}
      />
    </div>
  );
}
