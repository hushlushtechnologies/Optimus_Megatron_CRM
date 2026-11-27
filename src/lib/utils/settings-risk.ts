import type { SettingsChangePreview } from "@/src/lib/types/settings-ui";

/*
|------------------------------------------------------------------------------
| Which way a safeguard moved
|------------------------------------------------------------------------------
|
| Each function returns what to show in the confirmation dialog, or null when
| the value did not change.
|
| The direction is the whole point and it is NOT the same arithmetic for every
| field, which is exactly why this is here as plain functions with a test file
| rather than inline in three clients:
|
|   discount threshold   HIGHER is looser — more discount escapes review
|   deposit to confirm   HIGHER is stricter — more money must be verified
|   separate verifier    ON is stricter — two people instead of one
|
| Two of those three move opposite ways on the same comparison, and both are
| percentages shown in the same kind of field. Getting one backwards would
| paint a tightening red and wave a loosening through with a quiet tick, which
| is worse than having no dialog, because the colour is the part people read.
|
| settings-risk-test.mts checks every direction explicitly, including the ends
| of each range where the meaning inverts (0% discount means everything needs
| approval; 0% deposit means nothing does).
|
|------------------------------------------------------------------------------
*/

const percent = (value: number) => `${value}%`;

/**
 * `discount_auto_approve_percent`: a discount up to this share of the proposed
 * price needs no approval. 0 means every discount needs approval, so 0 is the
 * strictest setting this field has and raising it always relaxes review.
 */
export function discountThresholdChange(before: number, after: number): SettingsChangePreview | null {
  if (before === after) return null;

  const loosens = after > before;

  return {
    label: "Discount that needs no approval",
    before: percent(before),
    after: percent(after),
    direction: loosens ? "loosens" : "tightens",
    effect: loosens
      ? after >= 100
        ? "Every discount will be approved automatically. Nobody will review a discount again."
        : `Discounts up to ${percent(after)} of the proposed price will go through with nobody reviewing them. Today anything above ${percent(before)} needs approval.`
      : after === 0
        ? "Every discount will need approval before a deal can be confirmed, however small."
        : `Discounts above ${percent(after)} will need approval. Today they only need it above ${percent(before)}.`,
  };
}

/**
 * `confirm_min_deposit_percent`: the share of the total that must be VERIFIED
 * as paid before a deal can be confirmed. 0 means a deal can be confirmed with
 * nothing verified, so 0 is the weakest setting and raising it tightens.
 */
export function minDepositChange(before: number, after: number): SettingsChangePreview | null {
  if (before === after) return null;

  const loosens = after < before;

  return {
    label: "Verified deposit needed to confirm a deal",
    before: percent(before),
    after: percent(after),
    direction: loosens ? "loosens" : "tightens",
    effect: loosens
      ? after === 0
        ? "Deals will be confirmable with no payment verified at all."
        : `Deals will be confirmable once ${percent(after)} of the total is verified, down from ${percent(before)}.`
      : `Deals will need ${percent(after)} of the total verified as paid before they can be confirmed, up from ${percent(before)}.`,
  };
}

/**
 * `payments_require_separate_verifier`: on means the person who records a
 * payment cannot be the person who verifies it. Turning it off lets one person
 * do both, which is the safeguard this flag exists for.
 */
export function separateVerifierChange(before: boolean, after: boolean): SettingsChangePreview | null {
  if (before === after) return null;

  return {
    label: "A different person must verify each payment",
    before: before ? "On" : "Off",
    after: after ? "On" : "Off",
    direction: after ? "tightens" : "loosens",
    effect: after
      ? "The person who records a payment will no longer be able to verify it themselves."
      : "One person will be able to both record a payment and verify it. Nobody else has to look at it.",
  };
}

/**
 * `fees_enabled`: off means no fees are offered or charged on any new deal.
 * Fees already saved on a confirmed deal are untouched either way, so this is
 * a change rather than a safeguard moving — it gets a confirmation because it
 * changes what every new deal can charge, not because it is a risk.
 */
export function feesEnabledChange(before: boolean, after: boolean): SettingsChangePreview | null {
  if (before === after) return null;

  return {
    label: "Charge fees on deals",
    before: before ? "On" : "Off",
    after: after ? "On" : "Off",
    direction: "changes",
    effect: after
      ? "Fees can be added to new deals again. Fees on confirmed deals are unchanged."
      : "No fees will be offered or charged on any new deal. Fees already on a confirmed deal stay as they are.",
  };
}
