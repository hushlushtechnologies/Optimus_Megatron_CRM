import "server-only";

import { requireModulePermission } from "@/src/lib/supabase/module-permissions";

/*
| Inventory authorises on inventory.manage. The role-name array that used to
| back this up was removed in Batch 5, after sql/21's preflight confirmed the
| key is granted to Super Admin, Admin, Manager and Inventory Manager.
*/

export async function assertCanManageInventory(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission("inventory.manage", "You don't have permission to perform this action.");
}
