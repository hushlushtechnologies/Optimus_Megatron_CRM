import {
  formatDateTimeFull,
} from "@/src/lib/utils/test-drive-format";

import {
  toFils,
} from "@/src/lib/utils/sales-money";

import type {
  DealPricing,
  VehicleDealContext,
} from "@/src/lib/types/sales-deal-form";

/* =========================================================
   BIGINT CONSTANTS
========================================================= */

const ZERO_FILS =
  BigInt(0);

const BASIS_POINTS_SCALE =
  BigInt(10_000);

/* =========================================================
   TYPES
========================================================= */

export interface ContextMessages {
  blockers:
    string[];

  warnings:
    string[];

  notes:
    string[];
}

/* =========================================================
   VEHICLE CONTEXT
========================================================= */

/**
 * Turns what the database knows about a vehicle
 * into contextual messages.
 *
 * Blockers stop the deal from being created.
 *
 * The database remains the final authority and
 * will still refuse to reserve or confirm a
 * vehicle that another deal currently holds.
 */
export function describeVehicleContext(
  context:
    VehicleDealContext | null,

  vehicle: {
    is_sold:
      boolean;

    status_name:
      string | null;
  } | null
): ContextMessages {
  const blockers:
    string[] = [];

  const warnings:
    string[] = [];

  const notes:
    string[] = [];

  /* =========================================================
     INVENTORY SOLD STATE
  ========================================================= */

  if (
    vehicle?.is_sold
  ) {
    blockers.push(
      `This vehicle is marked ${
        vehicle.status_name
          ?.toLowerCase() ??
        "sold"
      } in inventory.`
    );
  }

  if (!context) {
    return {
      blockers,
      warnings,
      notes,
    };
  }

  /* =========================================================
     EXISTING CONFIRMED / COMPLETED DEAL
  ========================================================= */

  if (
    context.holderStatus ===
      "Completed" ||
    context.holderStatus ===
      "Confirmed"
  ) {
    blockers.push(
      context.holderStatus ===
        "Completed"
        ? `This vehicle has already been sold (deal ${context.holderDealNumber}).`
        : `This vehicle is committed to a confirmed deal (${context.holderDealNumber}).`
    );
  }

  /* =========================================================
     SAME CUSTOMER OPEN DEAL
  ========================================================= */

  if (
    context.customerOpenDealNumber
  ) {
    blockers.push(
      `This customer already has an open deal for this vehicle (${context.customerOpenDealNumber}). Continue that deal instead of starting a second one.`
    );
  }

  /* =========================================================
     RESERVED / HELD
  ========================================================= */

  if (
    context.holderStatus ===
    "Reserved"
  ) {
    warnings.push(
      `This vehicle is reserved by another deal (${context.holderDealNumber}). You can prepare a draft, but it can't be reserved or confirmed until that hold ends.`
    );
  } else if (
    context.reservationNumber &&
    context.reservationExpiresAt
  ) {
    warnings.push(
      `This vehicle is held by reservation ${context.reservationNumber} until ${formatDateTimeFull(
        context.reservationExpiresAt
      )}.`
    );
  }

  /* =========================================================
     LEAD ALREADY HAS DEAL
  ========================================================= */

  if (
    context.leadDealNumber
  ) {
    warnings.push(
      `This lead already has a deal (${context.leadDealNumber}). Check it isn't a duplicate.`
    );
  }

  /* =========================================================
     OTHER OPEN DEALS
  ========================================================= */

  if (
    context.openDeals >
    0
  ) {
    notes.push(
      `${context.openDeals} other ${
        context.openDeals ===
        1
          ? "deal is"
          : "deals are"
      } in progress on this vehicle. Only one can hold it.`
    );
  }

  return {
    blockers,
    warnings,
    notes,
  };
}

/* =========================================================
   DEAL PRICING
========================================================= */

export function computeDealPricing(
  input: {
    proposed:
      string;

    discount:
      string;

    listedPrice:
      number | null;

    autoApprovePercent:
      number;
  }
): DealPricing {
  /* =========================================================
     PROPOSED PRICE
  ========================================================= */

  const proposedParsed =
    input.proposed ===
    ""
      ? null
      : toFils(
          input.proposed
        );

  const proposedFils =
    proposedParsed !==
      null &&
    proposedParsed >
      ZERO_FILS
      ? proposedParsed
      : null;

  /* =========================================================
     DISCOUNT
  ========================================================= */

  const discountParsed =
    input.discount ===
    ""
      ? ZERO_FILS
      : toFils(
          input.discount
        );

  const discountFils =
    discountParsed !==
      null &&
    discountParsed >=
      ZERO_FILS
      ? discountParsed
      : ZERO_FILS;

  /* =========================================================
     LISTED PRICE
  ========================================================= */

  const listedFils =
    toFils(
      input.listedPrice
    );

  /* =========================================================
     APPROVAL THRESHOLD
  ========================================================= */

  const thresholdBps =
    Math.max(
      0,
      Math.round(
        input.autoApprovePercent *
          100
      )
    );

  /* =========================================================
     VALID PRICING STATE
  ========================================================= */

  const usable =
    proposedFils !==
      null &&
    discountFils <=
      proposedFils;

  /* =========================================================
     NET PRICE
  ========================================================= */

  const netFils =
    usable &&
    proposedFils !==
      null
      ? proposedFils -
        discountFils
      : null;

  /* =========================================================
     DISCOUNT BASIS POINTS
  ========================================================= */

  const discountBps =
    proposedFils !==
      null &&
    usable
      ? Number(
          (
            discountFils *
            BASIS_POINTS_SCALE
          ) /
            proposedFils
        )
      : null;

  /* =========================================================
     APPROVAL REQUIRED
  ========================================================= */

  /*
   * This intentionally uses integer arithmetic.
   *
   * Example:
   *
   * discount / price > threshold
   *
   * becomes:
   *
   * discount * 10000 >
   * price * thresholdBps
   *
   * avoiding floating-point money calculations.
   */
  const needsApproval =
    usable &&
    proposedFils !==
      null &&
    discountFils *
      BASIS_POINTS_SCALE >
      proposedFils *
        BigInt(
          thresholdBps
        );

  /* =========================================================
     DIFFERENCE VS LISTED PRICE
  ========================================================= */

  const vsListedFils =
    proposedFils !==
      null &&
    listedFils !==
      null
      ? proposedFils -
        listedFils
      : null;

  /* =========================================================
     RESULT
  ========================================================= */

  return {
    proposedFils,

    discountFils,

    netFils,

    listedFils,

    discountBps,

    thresholdBps,

    needsApproval,

    vsListedFils,
  };
}

/* =========================================================
   FORMAT BASIS POINTS
========================================================= */

/**
 * Example:
 *
 * 250 -> "2.50%"
 *
 * Display only.
 */
export function formatBasisPoints(
  bps:
    number
): string {
  return `${(
    bps /
    100
  ).toFixed(2)}%`;
}