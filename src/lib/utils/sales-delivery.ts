import type { DeliveryItem, DeliveryRecord, DeliveryRule } from "@/src/lib/types/sales-delivery";

export const DELIVERY_RULE_NOTE: Record<DeliveryRule, string> = {
  balance_paid: "Checked automatically: verified payments cover the total due.",
  invoice_issued: "Checked automatically: a sales invoice is issued for this deal.",
};

export interface ChecklistProgress {
  requiredTotal: number;
  requiredReady: number;
  allReady: boolean;
  notReady: DeliveryItem[];
}

/** How far the required checks have got. Optional checks never hold up the handover. */
export function checklistProgress(items: readonly DeliveryItem[]): ChecklistProgress {
  const required = items.filter((item) => item.is_required);
  const ready = required.filter((item) => item.is_ready);
  return {
    requiredTotal: required.length,
    requiredReady: ready.length,
    allReady: ready.length === required.length,
    notReady: required.filter((item) => !item.is_ready),
  };
}

export function deliveryPlace(
  delivery: Pick<DeliveryRecord, "delivery_mode" | "location_name" | "address">,
): string | null {
  if (delivery.delivery_mode === "showroom")
    return delivery.location_name ? `At ${delivery.location_name} showroom` : null;
  if (delivery.delivery_mode === "address")
    return delivery.address ? `Delivered to ${delivery.address}` : null;
  return null;
}
