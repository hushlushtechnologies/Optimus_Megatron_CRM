import { createClient } from "@/src/lib/supabase/server";
import type {
  DealDeliveryResult,
  DeliveryItem,
  DeliveryLookups,
  DeliveryRecord,
  DeliveryTemplate,
} from "@/src/lib/types/sales-delivery";

const DELIVERY_COLUMNS =
  "id, deal_id, status, planned_at, delivery_mode, location_id, location_name, address, handover_staff_id, handover_staff_name, prep_notes, delivered_at, handed_over_by_name, handover_notes, created_at, created_by_name, updated_at";

const ITEM_COLUMNS =
  "id, label, rule, is_required, sort_order, state, note, actioned_at, actioned_by_name, rule_met, is_ready";

/**
 * A deal's delivery and its checks. "No delivery yet" is a normal answer (delivery: null).
 * A failure to load is an "error", never a fake "no delivery".
 */
export async function getDealDelivery(dealId: string): Promise<DealDeliveryResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_delivery_list")
    .select(DELIVERY_COLUMNS)
    .eq("deal_id", dealId)
    .maybeSingle();

  if (error) {
    console.error("getDealDelivery error:", error);
    return { status: "error" };
  }
  if (!data) return { status: "ok", delivery: null, items: [] };

  const delivery = data as unknown as DeliveryRecord;

  const itemsResult = await supabase
    .from("sales_delivery_item_list")
    .select(ITEM_COLUMNS)
    .eq("delivery_id", delivery.id)
    .order("sort_order")
    .order("label");

  if (itemsResult.error) {
    console.error("getDealDelivery items error:", itemsResult.error);
    return { status: "error" };
  }

  return { status: "ok", delivery, items: (itemsResult.data ?? []) as unknown as DeliveryItem[] };
}

/** The people who can hand a vehicle over, and the showrooms to hand it over at. null when they couldn't be loaded. */
export async function getDeliveryLookups(): Promise<DeliveryLookups | null> {
  const supabase = await createClient();

  const [staff, showrooms] = await Promise.all([
    supabase.rpc("list_delivery_staff"),
    supabase.from("locations").select("id, name").eq("is_active", true).order("sort_order"),
  ]);

  [staff.error, showrooms.error].forEach((error) => {
    if (error) console.error("getDeliveryLookups error:", error);
  });
  if (staff.error || showrooms.error) return null;

  return {
    staff: ((staff.data ?? []) as unknown as { id: string; full_name: string | null }[]).map((person) => ({
      id: person.id,
      name: person.full_name?.trim() || "Unnamed staff",
    })),
    showrooms: showrooms.data ?? [],
  };
}

/** Every checklist template, switched on or off, for the settings page. null when it couldn't be loaded. */
export async function getDeliveryTemplates(): Promise<DeliveryTemplate[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_delivery_checklist_templates")
    .select("id, label, rule, is_required, is_active, sort_order")
    .order("sort_order")
    .order("label");

  if (error) {
    console.error("getDeliveryTemplates error:", error);
    return null;
  }
  return (data ?? []) as unknown as DeliveryTemplate[];
}
