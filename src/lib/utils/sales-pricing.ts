import { filsToDecimalString, toFils } from "@/src/lib/utils/sales-money";
import type { FeeType } from "@/src/lib/types/sales-pricing";

/* =========================================================
   BIGINT CONSTANTS
========================================================= */

const ZERO_FILS = BigInt(0);
const TWO = BigInt(2);
const BASIS_POINTS_SCALE = BigInt(10_000);

/* =========================================================
   PERCENTAGE HELPERS
========================================================= */

/**
 * 1.5 becomes 150.
 * Percentages have at most two decimals.
 */
export function percentToBps(percent: number): bigint {
  return BigInt(Math.round(percent * 100));
}

/**
 * Divides and rounds half up,
 * matching the database's round().
 *
 * Both numbers must be positive.
 */
export function divRoundHalfUp(
  numerator: bigint,
  denominator: bigint
): bigint {
  return (
    numerator * TWO + denominator
  ) / (
    denominator * TWO
  );
}

/* =========================================================
   FEE CALCULATION
========================================================= */

/**
 * Returns the fee in whole fils for a given net price.
 * Matches what the database saves.
 */
export function feeAmountFils(
  fee: Pick<FeeType, "calc_mode" | "value">,
  netFils: bigint
): bigint {
  if (fee.calc_mode === "fixed") {
    return toFils(fee.value) ?? ZERO_FILS;
  }

  return divRoundHalfUp(
    netFils * percentToBps(fee.value),
    BASIS_POINTS_SCALE
  );
}

export function describeFeeRule(
  fee: Pick<FeeType, "calc_mode" | "value">,
  currencyLabel: string
): string {
  if (fee.calc_mode === "fixed") {
    return `${currencyLabel} ${filsToDecimalString(
      toFils(fee.value) ?? ZERO_FILS
    )}`;
  }

  return `${fee.value.toFixed(2)}% of the net price`;
}

/**
 * "1234.50" for a form field,
 * or "" when there is no value.
 */
export function decimalText(
  value: number | null
): string {
  const fils = toFils(value);

  return fils === null
    ? ""
    : filsToDecimalString(fils);
}

/* =========================================================
   PRICING PREVIEW
========================================================= */

export interface PricingPreview {
  proposedFils: bigint | null;
  discountFils: bigint;
  netFils: bigint | null;

  feeLines: {
    id: string;
    name: string;
    rule: string;
    amountFils: bigint;
  }[];

  feesFils: bigint;
  estimatedTotalFils: bigint | null;

  discountBps: number | null;
  thresholdBps: bigint;

  /**
   * The same test the database applies
   * before a deal can be confirmed.
   */
  needsApproval: boolean;

  errors: {
    proposed?: string;
    discount?: string;
  };

  valid: boolean;
}

export function computePricingPreview(input: {
  proposed: string;
  discount: string;
  selectedFeeIds: ReadonlySet<string>;
  feeTypes: FeeType[];
  autoApprovePercent: number;
  currencyLabel: string;
}): PricingPreview {
  const errors: PricingPreview["errors"] = {};

  /* =======================================================
     PROPOSED PRICE
  ======================================================= */

  const proposedParsed =
    input.proposed === ""
      ? null
      : toFils(input.proposed);

  if (input.proposed === "") {
    errors.proposed =
      "Enter the proposed price.";
  } else if (
    proposedParsed === null ||
    proposedParsed <= ZERO_FILS
  ) {
    errors.proposed =
      "Enter a price above zero, with at most two decimals.";
  }

  /* =======================================================
     DISCOUNT
  ======================================================= */

  const discountParsed =
    input.discount === ""
      ? ZERO_FILS
      : toFils(input.discount);

  if (
    discountParsed === null ||
    discountParsed < ZERO_FILS
  ) {
    errors.discount =
      "Enter a discount of zero or more, with at most two decimals.";
  }

  const proposedFils =
    !errors.proposed
      ? proposedParsed
      : null;

  const discountFils =
    !errors.discount &&
    discountParsed !== null
      ? discountParsed
      : ZERO_FILS;

  if (
    proposedFils !== null &&
    !errors.discount &&
    discountFils >= proposedFils
  ) {
    errors.discount =
      "The discount can't take the price to zero or below.";
  }

  /* =======================================================
     NET PRICE
  ======================================================= */

  const valid =
    !errors.proposed &&
    !errors.discount;

  const netFils =
    valid &&
    proposedFils !== null
      ? proposedFils - discountFils
      : null;

  /* =======================================================
     FEES
  ======================================================= */

  const feeLines =
    netFils === null
      ? []
      : input.feeTypes
          .filter((fee) =>
            input.selectedFeeIds.has(fee.id)
          )
          .sort(
            (a, b) =>
              a.sort_order - b.sort_order ||
              a.name.localeCompare(b.name)
          )
          .map((fee) => ({
            id: fee.id,
            name: fee.name,
            rule: describeFeeRule(
              fee,
              input.currencyLabel
            ),
            amountFils: feeAmountFils(
              fee,
              netFils
            ),
          }));

  const feesFils =
    feeLines.reduce(
      (total, line) =>
        total + line.amountFils,
      ZERO_FILS
    );

  /* =======================================================
     APPROVAL THRESHOLD
  ======================================================= */

  const thresholdBps =
    percentToBps(
      input.autoApprovePercent
    );

  const discountBps =
    valid &&
    proposedFils !== null
      ? Number(
          (
            discountFils *
            BASIS_POINTS_SCALE
          ) /
            proposedFils
        )
      : null;

  const needsApproval =
    valid &&
    proposedFils !== null &&
    discountFils *
      BASIS_POINTS_SCALE >
      proposedFils *
        thresholdBps;

  /* =======================================================
     RESULT
  ======================================================= */

  return {
    proposedFils,
    discountFils,
    netFils,
    feeLines,
    feesFils,

    estimatedTotalFils:
      netFils !== null
        ? netFils + feesFils
        : null,

    discountBps,
    thresholdBps,
    needsApproval,

    errors,
    valid,
  };
}