import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { RolesClient } from "@/src/components/users/roles-client";

import { getRoleHistory, getRoleMatrix, myPermissionKeys } from "@/src/lib/supabase/role-queries";
import { currentStaffAccess } from "@/src/lib/supabase/staff-permissions";

/*
| Phases 8 and 9: role management and the permissions matrix.
|
| The page is gated on users.view, not roles.manage — somebody who can see the
| staff list should be able to see what the roles mean, because "why can't
| Fatima do X" is answered here. Changing anything needs roles.manage, which
| the grid enforces cell by cell and sql/19 enforces underneath.
|
| myPermissionKeys() is read because of the grant-what-you-hold rule: the grid
| has to know what the signed-in person holds to decide which boxes they may
| tick. Without it every box would look available and half of them would fail.
*/

export default async function RolesPage() {
  const access = await currentStaffAccess();

  if (!access.permissions.canView) {
    return <UnauthorizedState />;
  }

  const [matrix, heldKeys, historyResult] = await Promise.all([
    getRoleMatrix(),
    myPermissionKeys(),
    getRoleHistory(),
  ]);

  return (
    <RolesClient
      roles={matrix.roles}
      permissions={matrix.permissions}
      grants={[...matrix.grants]}
      activeHolderCounts={matrix.activeHolderCounts}
      context={{
        myRank: access.permissions.myRank,
        isProtected: access.permissions.isProtected,
        canManageRoles: access.permissions.canManageRoles,
        heldKeys,
      }}
      history={historyResult.history}
      readFailed={matrix.readFailed}
      setupMissing={matrix.setupMissing}
    />
  );
}
