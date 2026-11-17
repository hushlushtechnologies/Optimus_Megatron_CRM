import { FINAL_DEAL_STATUSES } from "@/src/lib/types/sales";

import type { ContextMessages } from "@/src/lib/utils/sales-deal-form";

import { formatBasisPoints } from "@/src/lib/utils/sales-deal-form";

import {
  formatFils,
  toFils,
} from "@/src/lib/utils/sales-money";

import {
  formatDay,
  formatDateTimeFull,
} from "@/src/lib/utils/test-drive-format";

import type { VehicleDealContext } from "@/src/lib/types/sales-deal-form";

import type {
  DealSettings,
  ReadinessGroup,
  ReadinessItem,
  SalesDealDetail,
} from "@/src/lib/types/sales-detail";

/* =========================================================
   BIGINT CONSTANTS
========================================================= */

const ZERO_FILS = BigInt(0);

const BASIS_POINTS_SCALE =
  BigInt(10_000);

const BASIS_POINTS_ROUND_UP_OFFSET =
  BigInt(9_999);

/* =========================================================
   READINESS TITLES
========================================================= */

export const READINESS_TITLES = {
  negotiation: "To start negotiation",
  reserve: "To reserve the vehicle",
  confirm: "To confirm the deal",
  complete: "To complete the deal",
} as const;

/* =========================================================
   HELPERS
========================================================= */

function group(
  title: string,
  optional: boolean,
  items: ReadinessItem[]
): ReadinessGroup {
  return {
    title,
    optional,
    items,
    ready: items.every(
      (item) => item.done
    ),
  };
}

/**
 * What is still missing for each next step.
 *
 * These are the same checks the database makes
 * when the status changes, so the page never
 * promises something the database would refuse.
 *
 * nowMs is 0 on the server, which is treated
 * as "not expired yet".
 */
export function computeReadiness(
  deal: SalesDealDetail,
  settings: DealSettings,
  nowMs: number
): ReadinessGroup[] {
  const currency =
    deal.currency;

  /* =======================================================
     MONEY VALUES
  ======================================================= */

  const proposed =
    toFils(
      deal.proposed_price
    );

  const discount =
    toFils(
      deal.discount_amount
    ) ?? ZERO_FILS;

  const fees =
    toFils(
      deal.fees_amount
    ) ?? ZERO_FILS;

  const tax =
    toFils(
      deal.tax_amount
    ) ?? ZERO_FILS;

  const thresholdBps =
    BigInt(
      Math.max(
        0,
        Math.round(
          settings.autoApprovePercent *
            100
        )
      )
    );

  const minDepositBps =
    BigInt(
      Math.max(
        0,
        Math.round(
          settings.minDepositPercent *
            100
        )
      )
    );

  const agreedFils =
    toFils(
      deal.agreed_price
    );

  const paid =
    toFils(
      deal.verified_paid
    ) ?? ZERO_FILS;

  /* =======================================================
     NET PRICE
  ======================================================= */

  // Confirming fixes the agreed price at
  // proposed price less discount.
  const net =
    proposed !== null &&
    proposed > ZERO_FILS &&
    discount <= proposed
      ? proposed - discount
      : null;

  const dueFils =
    toFils(
      deal.total_due
    ) ??
    (
      net !== null
        ? net + fees + tax
        : null
    );

  /* =======================================================
     OWNER
  ======================================================= */

  const owner: ReadinessItem = {
    key: "owner",

    label:
      "A sales executive is assigned",

    done:
      Boolean(
        deal.owner_id
      ),

    detail:
      deal.owner_name
        ? `Assigned to ${deal.owner_name}`
        : null,
  };

  /* =======================================================
     PRICE
  ======================================================= */

  const price: ReadinessItem = {
    key: "price",

    label:
      "A proposed price is set",

    done:
      proposed !== null &&
      proposed >
        ZERO_FILS,

    detail:
      proposed !== null &&
      proposed >
        ZERO_FILS
        ? formatFils(
            proposed,
            currency
          )
        : null,
  };

  /* =======================================================
     AGREED PRICE
  ======================================================= */

  const agreed: ReadinessItem = {
    key: "agreed",

    label:
      "The agreed price is ready",

    done:
      agreedFils !== null ||
      net !== null,

    detail:
      agreedFils !== null
        ? formatFils(
            agreedFils,
            currency
          )
        : net !== null
          ? `Will be set to ${formatFils(
              net,
              currency
            )} (proposed price less discount)`
          : "Set a proposed price first",
  };

  /* =======================================================
     DISCOUNT APPROVAL
  ======================================================= */

  const needsApproval =
    proposed !== null &&
    proposed >
      ZERO_FILS &&
    discount *
      BASIS_POINTS_SCALE >
      proposed *
        thresholdBps &&
    !deal.price_approved_at;

  const discountItem:
    ReadinessItem = {
      key:
        "discount",

      label:
        "The discount is within the limit or approved",

      done:
        !needsApproval,

      detail:
        needsApproval
          ? `Above the ${formatBasisPoints(
              Number(
                thresholdBps
              )
            )} limit, so a manager must approve it`
          : deal.price_approved_at
            ? `Approved${
                deal.price_approved_by_name
                  ? ` by ${deal.price_approved_by_name}`
                  : ""
              }`
            : discount >
                ZERO_FILS
              ? `Within the ${formatBasisPoints(
                  Number(
                    thresholdBps
                  )
                )} limit`
              : null,
    };

  const confirmItems:
    ReadinessItem[] = [
      owner,
      agreed,
      discountItem,
    ];

  /* =======================================================
     DEPOSIT REQUIREMENT
  ======================================================= */

  if (
    minDepositBps >
    ZERO_FILS
  ) {
    const required =
      dueFils !== null
        ? (
            dueFils *
              minDepositBps +
            BASIS_POINTS_ROUND_UP_OFFSET
          ) /
          BASIS_POINTS_SCALE
        : null;

    confirmItems.push({
      key:
        "deposit",

      label:
        `A deposit of ${formatBasisPoints(
          Number(
            minDepositBps
          )
        )} is verified`,

      done:
        dueFils !== null &&
        paid *
          BASIS_POINTS_SCALE >=
          dueFils *
            minDepositBps,

      detail:
        required !== null
          ? `${formatFils(
              paid,
              currency
            )} verified of ${formatFils(
              required,
              currency
            )} needed`
          : "Needs a price first",
    });
  }

  /* =======================================================
     RESERVATION
  ======================================================= */

  const reservationActive =
    Boolean(
      deal.reservation_id
    ) &&
    deal.reservation_status ===
      "Confirmed" &&
    (
      nowMs === 0 ||
      !deal.reservation_expires_at ||
      Date.parse(
        deal.reservation_expires_at
      ) >
        nowMs
    );

  /* =======================================================
     STATUS-SPECIFIC READINESS
  ======================================================= */

  switch (
    deal.status
  ) {
    case "Draft":
      return [
        group(
          READINESS_TITLES.negotiation,
          false,
          [
            owner,
            price,
          ]
        ),
      ];

    case "Negotiation":
      return [
        group(
          READINESS_TITLES.reserve,
          true,
          [
            {
              key:
                "reservation",

              label:
                "A confirmed reservation holds the vehicle",

              done:
                reservationActive,

              detail:
                reservationActive
                  ? "Linked to this deal"
                  : "No reservation is linked yet",
            },
          ]
        ),

        group(
          READINESS_TITLES.confirm,
          false,
          confirmItems
        ),
      ];

    case "Reserved":
      return [
        group(
          READINESS_TITLES.confirm,
          false,
          [
            {
              key:
                "reservation",

              label:
                "The reservation is still active",

              done:
                reservationActive,

              detail:
                deal.reservation_expires_at
                  ? `Holds the vehicle until ${formatDateTimeFull(
                      deal.reservation_expires_at
                    )}`
                  : null,
            },

            ...confirmItems,
          ]
        ),
      ];

    case "Confirmed":
      return [
        group(
          READINESS_TITLES.complete,
          false,
          [
            {
              key:
                "delivery",

              label:
                "The vehicle has been delivered",

              done:
                Boolean(
                  deal.delivered_at
                ),

              detail:
                deal.delivered_at
                  ? `Delivered ${formatDay(
                      deal.delivered_at
                    )}`
                  : "A confirmed sale is not yet a delivered vehicle",
            },
          ]
        ),
      ];

    default:
      return [];
  }
}

/* =========================================================
   VEHICLE CONTEXT
========================================================= */

/**
 * Conflicts on the vehicle that matter
 * while this deal is still open.
 */
export function describeDealVehicleContext(
  deal: SalesDealDetail,
  ctx: VehicleDealContext | null
): ContextMessages {
  const warnings:
    string[] = [];

  const notes:
    string[] = [];

  if (
    !ctx ||
    FINAL_DEAL_STATUSES.includes(
      deal.status
    )
  ) {
    return {
      blockers: [],
      warnings,
      notes,
    };
  }

  if (
    ctx.holderDealNumber &&
    ctx.holderDealNumber !==
      deal.deal_number
  ) {
    warnings.push(
      `This vehicle is ${
        ctx.holderStatus ===
        "Reserved"
          ? "reserved by"
          : "committed to"
      } deal ${ctx.holderDealNumber}. This deal can't be reserved or confirmed until that hold ends.`
    );
  }

  if (
    ctx.reservationNumber &&
    ctx.reservationNumber !==
      deal.reservation_number &&
    ctx.reservationExpiresAt
  ) {
    warnings.push(
      `Reservation ${ctx.reservationNumber} holds this vehicle until ${formatDateTimeFull(
        ctx.reservationExpiresAt
      )}.`
    );
  }

  const ownOpen =
    deal.status ===
      "Draft" ||
    deal.status ===
      "Negotiation"
      ? 1
      : 0;

  const others =
    Math.max(
      0,
      ctx.openDeals -
        ownOpen
    );

  if (
    others > 0
  ) {
    notes.push(
      `${others} other ${
        others === 1
          ? "deal is"
          : "deals are"
      } in progress on this vehicle. Only one can hold it.`
    );
  }

  return {
    blockers: [],
    warnings,
    notes,
  };
}

/* =========================================================
   HOLD CONFLICT
========================================================= */

/**
 * Why this deal can't be confirmed because
 * of the vehicle itself.
 *
 * null when nothing is in the way.
 */
export function holdConflictFor(
  deal: SalesDealDetail,
  ctx: VehicleDealContext | null
): string | null {
  if (!ctx) {
    return null;
  }

  if (
    ctx.holderDealNumber &&
    ctx.holderDealNumber !==
      deal.deal_number
  ) {
    return `This vehicle is held by deal ${ctx.holderDealNumber}, so this deal can't be confirmed until that hold ends.`;
  }

  if (
    ctx.reservationNumber &&
    ctx.reservationNumber !==
      deal.reservation_number
  ) {
    return `Reservation ${ctx.reservationNumber} holds this vehicle, so this deal can't be confirmed until it ends.`;
  }

  return null;
}