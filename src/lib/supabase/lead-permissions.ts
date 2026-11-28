import "server-only";

import { requireModulePermission } from "@/src/lib/supabase/module-permissions";

/*
| Sprint 11: leads.manage, leads.delete and leads.notes_manage replace the
| role-name arrays. The arrays survive only as the transition fallback
| described in module-permissions.ts.
|
| leads.manage is granted to exactly the roles that CUSTOMER_MANAGER_ROLES
| held, because until now every lead action was guarded by the customer array.
*/
const LEAD_MANAGER_ROLES = ["Super Admin", "Admin", "Manager", "Sales Executive"] as const;
const ELEVATED_LEAD_ROLES = ["Super Admin", "Admin", "Manager"] as const;

export async function assertCanManageLeads(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission(
    "leads.manage",
    LEAD_MANAGER_ROLES,
    "You don't have permission to perform this action.",
  );
}

export async function assertCanDeleteLeads(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission(
    "leads.delete",
    ELEVATED_LEAD_ROLES,
    "You don't have permission to permanently delete a lead.",
  );
}

/** Edit and delete notes written by other members of staff. */
export async function assertCanManageAllLeadNotes(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission(
    "leads.notes_manage",
    ELEVATED_LEAD_ROLES,
    "You can only edit your own notes.",
  );
}
