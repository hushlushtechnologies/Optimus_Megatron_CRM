import { notFound } from "next/navigation";

import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { StaffDetailClient } from "@/src/components/users/staff-detail-client";

import { getStaffDetail } from "@/src/lib/supabase/staff-detail-queries";
import { currentStaffAccess } from "@/src/lib/supabase/staff-permissions";
import { getStaffList } from "@/src/lib/supabase/staff-queries";

/*
| Phase 6: one staff account.
|
| The full staff list is read as well as the one account, because the
| last-active-Super-Admin rule cannot be answered from a single row — deciding
| whether this person is the last one requires knowing about the others. The
| database answers it authoritatively in a trigger; this is so the page can
| disable the button and say why before anybody clicks it.
*/

interface StaffDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function StaffDetailPage({ params }: StaffDetailPageProps) {
  const { id } = await params;

  const access = await currentStaffAccess();

  if (!access.permissions.canView) {
    return <UnauthorizedState />;
  }

  const [detail, list] = await Promise.all([getStaffDetail(id), getStaffList()]);

  if (detail.notFound) notFound();

  if (!detail.staff) {
    return (
      <div className="border-danger/30 bg-danger/[0.04] rounded-2xl border px-4 py-3">
        <p className="text-text-primary text-[13px] font-semibold">This account couldn&apos;t be read</p>
        <p className="text-text-muted mt-0.5 text-[12px]">
          Nothing has been changed. Reload to try again.
        </p>
      </div>
    );
  }

  return (
    <StaffDetailClient
      staff={detail.staff}
      allStaff={list.staff}
      roles={list.roles}
      permissions={access.permissions}
      history={detail.history}
      historyReadFailed={detail.historyReadFailed}
    />
  );
}
