"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import { assertCanManageInventory } from "@/src/lib/supabase/inventory-permissions";

export async function updateCarAvailabilityStatus(carId: string, statusId: string) {
  const permission = await assertCanManageInventory();
  if (!permission.allowed) return { error: permission.error ?? "You don't have permission to change inventory." };

  const supabase = await createClient();
  const { error } = await supabase.from("cars").update({ availability_status_id: statusId }).eq("id", carId);

  if (error) {
    console.error("updateCarAvailabilityStatus error:", error);
    return { error: "Unable to update status. Please try again." };
  }

  revalidatePath(`/admin/inventory/${carId}`);
  revalidatePath("/admin/inventory");
  return { error: null };
}
