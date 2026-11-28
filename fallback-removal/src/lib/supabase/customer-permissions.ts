import "server-only";

import { requireModulePermission } from "@/src/lib/supabase/module-permissions";

/*
| Customers authorise on keys. The role-name arrays were removed in Batch 5.
|
| Note that leads have their own keys now — assertCanManageCustomers() used to
| guard every lead action as well, which is why leads.manage exists and is
| granted to the same four roles.
*/

export async function assertCanManageCustomers(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission("customers.manage", "You don't have permission to perform this action.");
}

export async function assertCanDeleteCustomers(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission(
    "customers.delete",
    "You don't have permission to permanently delete a customer.",
  );
}

/** Edit and delete notes written by other members of staff. */
export async function assertCanManageAllCustomerNotes(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission("customers.notes_manage", "You can only edit your own notes.");
}
