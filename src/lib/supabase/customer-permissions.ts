import "server-only";

import { requireModulePermission } from "@/src/lib/supabase/module-permissions";

/*
| Sprint 11: customers.manage and customers.delete replace two role-name
| arrays. The arrays survive only as the transition fallback described in
| module-permissions.ts.
|
| Worth knowing while reading the call sites: assertCanManageCustomers() also
| guards every LEAD action — nineteen call sites, and the leads half of them
| has nothing to do with customers. Those now call assertCanManageLeads()
| instead, which holds leads.manage. The two keys are granted to the same four
| roles, so nothing changes today; they are separable from now on.
*/
const CUSTOMER_MANAGER_ROLES = ["Super Admin", "Admin", "Manager", "Sales Executive"] as const;
const ELEVATED_CUSTOMER_ROLES = ["Super Admin", "Admin", "Manager"] as const;

export async function assertCanManageCustomers(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission(
    "customers.manage",
    CUSTOMER_MANAGER_ROLES,
    "You don't have permission to perform this action.",
  );
}

export async function assertCanDeleteCustomers(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission(
    "customers.delete",
    ELEVATED_CUSTOMER_ROLES,
    "You don't have permission to permanently delete a customer.",
  );
}

/** Edit and delete notes written by other members of staff. */
export async function assertCanManageAllCustomerNotes(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission(
    "customers.notes_manage",
    ELEVATED_CUSTOMER_ROLES,
    "You can only edit your own notes.",
  );
}
