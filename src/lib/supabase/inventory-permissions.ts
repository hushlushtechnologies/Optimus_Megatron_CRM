import "server-only";

import { requireModulePermission } from "@/src/lib/supabase/module-permissions";

/*
| Sprint 11: this module now authorises on inventory.manage rather than on a
| list of role names. The array below is kept only as the transition fallback
| described in module-permissions.ts, and is removed once sql/17 is verified.
*/
const INVENTORY_MANAGER_ROLES = ["Super Admin", "Admin", "Manager", "Inventory Manager"] as const;

export async function assertCanManageInventory(): Promise<{ allowed: boolean; error: string | null }> {
  return requireModulePermission(
    "inventory.manage",
    INVENTORY_MANAGER_ROLES,
    "You don't have permission to perform this action.",
  );
}
