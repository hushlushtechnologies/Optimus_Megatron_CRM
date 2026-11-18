import type { ReservationActionKind, ReservationListRow } from "@/src/lib/types/reservations";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";

export const RESERVATION_ACTION_META: Record<ReservationActionKind, { label: string; destructive: boolean }> =
  {
    convert: { label: "Create deal", destructive: false },
    confirm: { label: "Confirm and hold", destructive: false },
    extend: { label: "Extend hold", destructive: false },
    reject: { label: "Reject request", destructive: true },
    cancel: { label: "Cancel request", destructive: true },
    release: { label: "Release vehicle", destructive: true },
  };

/**
 * Which steps make sense for a reservation right now AND are allowed for this person.
 * This only decides what to SHOW. The server and the database still enforce what is allowed.
 */
export function availableReservationActions(
  row: Pick<ReservationListRow, "status" | "is_live" | "deal_id" | "requested_by">,
  permissions: SalesPermissions,
  userId: string,
): ReservationActionKind[] {
  const actions: ReservationActionKind[] = [];

  if (row.status === "Requested") {
    if (permissions.reservationsConfirm) actions.push("confirm", "reject");
    // A person can always withdraw their own request.
    if (permissions.reservationsCancel || row.requested_by === userId) actions.push("cancel");
  }

  if (row.status === "Confirmed" && row.is_live) {
    if (permissions.create && !row.deal_id) actions.push("convert");
    if (permissions.reservationsConfirm) actions.push("extend");
    if (permissions.reservationsCancel) actions.push("release");
  }

  return actions;
}
