"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import { assertCanDeleteCustomers, assertCanManageCustomers } from "@/src/lib/supabase/customer-permissions";

/*
|--------------------------------------------------------------------------
| SINGLE-CUSTOMER ADMIN ACTIONS
|--------------------------------------------------------------------------
|
| Sprint 3 Phase 16 — archive, restore and delete from Customer Detail.
|
| The list page already had bulk versions of these. These are the one-record
| equivalents the detail page needs, so they can revalidate that customer's
| own route and report a single, specific outcome instead of a bulk summary.
|
| Permission is checked here AND by the row-level policies on
| customer_profiles. The menu in the UI is only a courtesy.
*/

export interface CustomerAdminResult {
  error: string | null;
}

/** Who may see the archive / delete menu at all. Read-only, safe to call from a page. */
export async function getMyCustomerAdminRights(): Promise<{ canManage: boolean; canDelete: boolean }> {
  const [manage, remove] = await Promise.all([assertCanManageCustomers(), assertCanDeleteCustomers()]);

  return { canManage: manage.allowed, canDelete: remove.allowed };
}

/* =========================================================
   ARCHIVE
========================================================= */

export async function archiveCustomer(customerId: string): Promise<CustomerAdminResult> {
  const permission = await assertCanManageCustomers();
  if (!permission.allowed) return { error: permission.error };

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("customer_profiles")
    .select("archived_at")
    .eq("id", customerId)
    .maybeSingle();

  if (!current) return { error: "This customer could not be found." };
  if (current.archived_at) return { error: "This customer is already archived." };

  const { error } = await supabase
    .from("customer_profiles")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", customerId);

  if (error) {
    console.error("archiveCustomer error:", error);
    return { error: "Unable to archive this customer. Your change was not saved." };
  }

  await supabase.from("customer_activity").insert({
    customer_id: customerId,
    activity_type: "archived",
    old_value: "Active",
    new_value: "Archived",
    description: "Customer archived",
  });

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}`);
  return { error: null };
}

/* =========================================================
   RESTORE
========================================================= */

export async function restoreCustomer(customerId: string): Promise<CustomerAdminResult> {
  const permission = await assertCanManageCustomers();
  if (!permission.allowed) return { error: permission.error };

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("customer_profiles")
    .select("archived_at")
    .eq("id", customerId)
    .maybeSingle();

  if (!current) return { error: "This customer could not be found." };
  if (!current.archived_at) return { error: "This customer is not archived." };

  const { error } = await supabase
    .from("customer_profiles")
    .update({ archived_at: null })
    .eq("id", customerId);

  if (error) {
    console.error("restoreCustomer error:", error);
    return { error: "Unable to restore this customer. Your change was not saved." };
  }

  await supabase.from("customer_activity").insert({
    customer_id: customerId,
    activity_type: "restored",
    old_value: "Archived",
    new_value: "Active",
    description: "Customer restored",
  });

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}`);
  return { error: null };
}

/* =========================================================
   DELETE
========================================================= */

/**
 * Permanently removes one customer.
 *
 * Deliberately refuses while the customer still has deals, reservations or
 * test drives: those records carry financial and operational history, and a
 * cascade would silently destroy it. Archive is the right action there, and
 * the message says so.
 */
export async function deleteCustomer(customerId: string): Promise<CustomerAdminResult> {
  const permission = await assertCanDeleteCustomers();
  if (!permission.allowed) return { error: permission.error };

  const supabase = await createClient();

  const [deals, reservations, testDrives] = await Promise.all([
    supabase.from("sales_deals").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
    supabase
      .from("vehicle_reservations")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId),
    supabase.from("test_drives").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
  ]);

  const blocking = [
    { count: deals.count ?? 0, label: "deal" },
    { count: reservations.count ?? 0, label: "reservation" },
    { count: testDrives.count ?? 0, label: "test drive" },
  ].filter((entry) => entry.count > 0);

  if (blocking.length > 0) {
    const parts = blocking.map((entry) => `${entry.count} ${entry.label}${entry.count === 1 ? "" : "s"}`);

    return {
      error: `This customer has ${parts.join(", ")} on record and can't be deleted. Archive them instead to keep the history.`,
    };
  }

  const { error } = await supabase.from("customer_profiles").delete().eq("id", customerId);

  if (error) {
    console.error("deleteCustomer error:", error);
    return { error: "Unable to delete this customer. Please try again." };
  }

  revalidatePath("/admin/customers");
  return { error: null };
}
