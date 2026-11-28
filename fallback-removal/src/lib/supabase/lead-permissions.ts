import "server-only";

import { requireModulePermission } from "@/src/lib/supabase/module-permissions";

/*
| Leads authorise on keys. The role-name arrays were removed in Batch 5.
*/

export async function assertCanManageLeads(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission("leads.manage", "You don't have permission to perform this action.");
}

export async function assertCanDeleteLeads(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission("leads.delete", "You don't have permission to permanently delete a lead.");
}

/** Edit and delete notes written by other members of staff. */
export async function assertCanManageAllLeadNotes(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission("leads.notes_manage", "You can only edit your own notes.");
}
