import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { UsersClient } from "@/src/components/users/users-client";

import { currentStaffAccess } from "@/src/lib/supabase/staff-permissions";
import { getPendingInvitations } from "@/src/lib/supabase/staff-invitation-queries";
import { getStaffList } from "@/src/lib/supabase/staff-queries";
import { parseStaffFilters, parseStaffPage, parseStaffSort } from "@/src/lib/utils/staff-filters";

/*
| Phase 3 and 4: the staff dashboard and the staff table.
|
| A Server Component that reads and hands plain data down. No icon, no
| function and no class instance crosses into UsersClient — only arrays,
| strings, numbers and booleans. The components below import their own icons.
|
| The permission gate is deliberately not the admin layout's gate. The layout
| asks "is this a member of staff at all"; this page asks "may this member of
| staff see everybody's account", which is a much narrower question.
*/

interface UsersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const params = await searchParams;

  const access = await currentStaffAccess();

  if (!access.permissions.canView) {
    return <UnauthorizedState />;
  }

  const [{ staff, roles, departments, readFailed }, invitationResult] = await Promise.all([
    getStaffList(),
    getPendingInvitations(),
  ]);

  return (
    <UsersClient
      staff={staff}
      roles={roles}
      departments={departments}
      permissions={access.permissions}
      initialFilters={parseStaffFilters(params)}
      initialSort={parseStaffSort(params)}
      initialPage={parseStaffPage(params)}
      readFailed={readFailed}
      usingProtectedRoleFallback={access.usingProtectedRoleFallback}
      setupMissing={access.setup.missing}
      invitations={invitationResult.invitations}
      invitationsReadFailed={invitationResult.readFailed}
    />
  );
}
