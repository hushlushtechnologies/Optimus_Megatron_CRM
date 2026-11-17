"use client";

import { motion } from "motion/react";

import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { FormSection } from "@/src/components/test-drives/form/form-section";
import { MoneyInput } from "@/src/components/sales/form/money-input";

import { useMotion } from "@/src/hooks/use-motion";

import {
  formatBasisPoints,
} from "@/src/lib/utils/sales-deal-form";

import {
  filsToDecimalString,
  formatFils,
} from "@/src/lib/utils/sales-money";

import type {
  DealPricing,
} from "@/src/lib/types/sales-deal-form";

import { cn } from "@/src/lib/utils/cn";

/* =========================================================
   BIGINT CONSTANTS
========================================================= */

const ZERO_FILS =
  BigInt(0);

/* =========================================================
   TYPES
========================================================= */

interface DealPricingSectionProps {
  currency: string;

  pricing:
    DealPricing;

  proposed:
    string;

  discount:
    string;

  notes:
    string;

  onProposedChange:
    (
      value:
        string
    ) => void;

  onDiscountChange:
    (
      value:
        string
    ) => void;

  onNotesChange:
    (
      value:
        string
    ) => void;

  errors: {
    proposedPrice?:
      string;

    discountAmount?:
      string;

    notes?:
      string;
  };
}

/* =========================================================
   DISCOUNT METER
========================================================= */

function DiscountMeter({
  pricing,
}: {
  pricing:
    DealPricing;
}) {
  const {
    transition,
    reduce,
  } =
    useMotion();

  if (
    pricing.discountBps ===
      null ||
    pricing.discountFils ===
      ZERO_FILS
  ) {
    return null;
  }

  const scale =
    Math.max(
      pricing.thresholdBps *
        2,
      500
    );

  const fill =
    Math.min(
      100,
      (
        pricing.discountBps /
        scale
      ) *
        100
    );

  const tick =
    pricing.thresholdBps >
    0
      ? Math.min(
          100,
          (
            pricing.thresholdBps /
            scale
          ) *
            100
        )
      : null;

  return (
    <div className="border-border flex flex-col gap-2 rounded-md border p-3">
      <div
        aria-hidden="true"
        className="bg-border/70 relative h-1.5 rounded-full"
      >
        <motion.div
          initial={
            reduce
              ? false
              : {
                  width:
                    0,
                }
          }
          animate={{
            width:
              `${fill}%`,
          }}
          transition={
            transition(
              0.35
            )
          }
          className={cn(
            "h-full rounded-full",

            pricing.needsApproval
              ? "bg-amber-500"
              : "bg-success"
          )}
        />

        {tick !==
          null && (
          <span
            className="bg-text-subtle absolute top-1/2 h-3 w-px -translate-y-1/2"
            style={{
              left:
                `${tick}%`,
            }}
          />
        )}
      </div>

      <p className="text-body-sm text-text-primary">
        Discount is{" "}
        {formatBasisPoints(
          pricing.discountBps
        )}{" "}
        of the proposed
        price.{" "}

        {pricing.needsApproval ? (
          <span className="text-amber-500">
            Above the{" "}
            {formatBasisPoints(
              pricing.thresholdBps
            )}{" "}
            limit, so a
            manager must
            approve it before
            the deal can be
            confirmed.
          </span>
        ) : (
          <span className="text-text-muted">
            Within the{" "}
            {formatBasisPoints(
              pricing.thresholdBps
            )}{" "}
            limit that needs
            no approval.
          </span>
        )}
      </p>
    </div>
  );
}

/* =========================================================
   COMPONENT
========================================================= */

export function DealPricingSection({
  currency,
  pricing,
  proposed,
  discount,
  notes,
  onProposedChange,
  onDiscountChange,
  onNotesChange,
  errors,
}: DealPricingSectionProps) {
  /*
   * Capture nullable bigint values once.
   *
   * This lets TypeScript safely preserve
   * narrowing inside callbacks.
   */
  const listedFils =
    pricing.listedFils;

  const vsListedFils =
    pricing.vsListedFils;

  const listedText =
    listedFils !==
    null
      ? formatFils(
          listedFils,
          currency
        )
      : null;

  return (
    <FormSection
      step={5}
      title="Pricing & notes"
      description="Fees and tax are added later. Today you set the price you are offering and any discount."
    >
      {/* ===================================================
          LISTED PRICE
      =================================================== */}

      <div className="border-border bg-card-hover/40 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5">
        <div>
          <p className="text-caption text-text-subtle">
            Listed price
          </p>

          <p className="text-body text-text-primary font-medium tabular-nums">
            {listedText ??
              "Not set on the vehicle"}
          </p>
        </div>

        {listedFils !==
          null && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              onProposedChange(
                filsToDecimalString(
                  listedFils
                )
              )
            }
          >
            Use listed price
          </Button>
        )}
      </div>

      {/* ===================================================
          MONEY INPUTS
      =================================================== */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MoneyInput
          label="Proposed selling price"
          currency={
            currency
          }
          value={
            proposed
          }
          onChange={
            onProposedChange
          }
          error={
            errors.proposedPrice
          }
          helper="The price you are offering the customer."
        />

        <MoneyInput
          label="Discount"
          currency={
            currency
          }
          value={
            discount
          }
          onChange={
            onDiscountChange
          }
          error={
            errors.discountAmount
          }
          helper="Taken off the proposed price."
        />
      </div>

      {/* ===================================================
          DIFFERENCE VS LISTED PRICE
      =================================================== */}

      {vsListedFils !==
        null &&
        vsListedFils !==
          ZERO_FILS && (
          <p
            className="text-caption text-text-subtle"
            role="status"
          >
            The proposed price
            is{" "}

            <span
              className={
                vsListedFils <
                ZERO_FILS
                  ? "text-amber-500"
                  : "text-text-primary"
              }
            >
              {formatFils(
                vsListedFils <
                  ZERO_FILS
                  ? -vsListedFils
                  : vsListedFils,
                currency
              )}{" "}

              {vsListedFils <
              ZERO_FILS
                ? "below"
                : "above"}
            </span>{" "}

            the listed price.
          </p>
        )}

      {/* ===================================================
          DISCOUNT METER
      =================================================== */}

      <DiscountMeter
        pricing={
          pricing
        }
      />

      {/* ===================================================
          NOTES
      =================================================== */}

      <Textarea
        label="Notes"
        placeholder="Anything the team should know about this deal."
        rows={3}
        maxLength={2000}
        value={
          notes
        }
        onChange={(
          event
        ) =>
          onNotesChange(
            event.target
              .value
          )
        }
      />

      {errors.notes && (
        <p
          role="alert"
          className="text-body-sm text-red-500"
        >
          {
            errors.notes
          }
        </p>
      )}
    </FormSection>
  );
}