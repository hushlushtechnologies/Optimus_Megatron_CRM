import { toFils } from "@/src/lib/utils/sales-money";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type { ContextMessages } from "@/src/lib/utils/sales-deal-form";
import type { VehicleDealContext } from "@/src/lib/types/sales-deal-form";
import type { ReservationSettings } from "@/src/lib/types/reservations";

/**
 * The deposit your settings require to hold a vehicle, in whole fils. null when no deposit is required
 * or it can't be worked out. A percentage is taken of the listed price and rounded up.
 */
export function requiredReservationDeposit(
  settings: ReservationSettings,
  listedPrice: number | null,
): bigint | null {
  if (settings.depositMode === "none") return null;
  const ZERO_FILS = BigInt(0);
  const BASIS_POINTS_SCALE = BigInt(10_000);
  const BASIS_POINTS_ROUND_UP_OFFSET = BigInt(9_999);

  if (settings.depositMode === "fixed") {
    const fixed = toFils(settings.depositValue);

    return fixed !== null && fixed > ZERO_FILS ? fixed : null;
  }

  const price = toFils(listedPrice);

  const basisPoints = BigInt(Math.max(0, Math.round(settings.depositValue * 100)));

  if (price === null || price <= ZERO_FILS || basisPoints === ZERO_FILS) {
    return null;
  }

  return (price * basisPoints + BASIS_POINTS_ROUND_UP_OFFSET) / BASIS_POINTS_SCALE;
}

/**
 * Turns what the database knows about a vehicle into messages for a reservation.
 * Blockers stop the reservation from being created. The database still refuses conflicts.
 */
export function describeReservationContext(
  context: VehicleDealContext | null,
  vehicle: { is_sold: boolean; status_name: string | null } | null,
  confirmNow: boolean,
): ContextMessages {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  if (vehicle?.is_sold) {
    blockers.push(`This vehicle is marked ${vehicle.status_name?.toLowerCase() ?? "sold"} in inventory.`);
  }

  if (!context) return { blockers, warnings, notes };

  if (context.holderStatus === "Completed" || context.holderStatus === "Confirmed") {
    blockers.push(
      context.holderStatus === "Completed"
        ? `This vehicle has already been sold (deal ${context.holderDealNumber}).`
        : `This vehicle is committed to a confirmed deal (${context.holderDealNumber}).`,
    );
  }

  const heldBy: string[] = [];
  if (context.holderStatus === "Reserved") heldBy.push(`deal ${context.holderDealNumber}`);
  if (context.reservationNumber && context.reservationExpiresAt) {
    heldBy.push(
      `reservation ${context.reservationNumber} until ${formatDateTimeFull(context.reservationExpiresAt)}`,
    );
  }

  if (heldBy.length > 0) {
    const text = `This vehicle is already held by ${heldBy.join(" and ")}.`;
    if (confirmNow) blockers.push(`${text} It can't be held again until then.`);
    else warnings.push(`${text} A request can be made, but it can't be confirmed until that hold ends.`);
  }

  if (context.customerOpenDealNumber) {
    notes.push(
      `This customer already has an open deal on this vehicle (${context.customerOpenDealNumber}). Turning the reservation into a deal will link it to that deal.`,
    );
  }

  if (context.openDeals > 0) {
    notes.push(
      `${context.openDeals} ${context.openDeals === 1 ? "deal is" : "deals are"} in progress on this vehicle. Only one can hold it.`,
    );
  }

  return { blockers, warnings, notes };
}
