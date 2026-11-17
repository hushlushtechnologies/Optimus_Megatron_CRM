"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  BadgeCheck,
  Pencil,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { DealPricingDialog } from "@/src/components/sales/pricing/deal-pricing-dialog";
import { DealApproveDialog } from "@/src/components/sales/pricing/deal-approve-dialog";

import { useMotion } from "@/src/hooks/use-motion";

import {
  formatBasisPoints,
} from "@/src/lib/utils/sales-deal-form";

import {
  describeFeeRule,
} from "@/src/lib/utils/sales-pricing";

import {
  formatFils,
  toFils,
} from "@/src/lib/utils/sales-money";

import {
  formatDateTimeFull,
} from "@/src/lib/utils/test-drive-format";

import type {
  PricingExtras,
} from "@/src/lib/types/sales-pricing";

import type {
  DealPriceChange,
  DealSettings,
  SalesDealDetail,
} from "@/src/lib/types/sales-detail";

import type {
  SalesPermissions,
} from "@/src/lib/utils/sales-permissions";

import { cn } from "@/src/lib/utils/cn";

/* =========================================================
   BIGINT CONSTANTS
========================================================= */

const ZERO_FILS = BigInt(0);

const BASIS_POINTS_SCALE =
  BigInt(10_000);

/* =========================================================
   CONSTANTS
========================================================= */

const OPEN_STATUSES = [
  "Draft",
  "Negotiation",
  "Reserved",
];

/* =========================================================
   TYPES
========================================================= */

interface DealPricingTabProps {
  deal: SalesDealDetail;
  settings: DealSettings;
  history: DealPriceChange[] | null;
  extras: PricingExtras;
  permissions: SalesPermissions;
}

/* =========================================================
   PRICE LINE
========================================================= */

function Line({
  label,
  hint,
  value,
  strong,
  muted,
  index,
}: {
  label: string;
  hint?: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  index: number;
}) {
  const { fadeUp } =
    useMotion();

  return (
    <motion.div
      {...fadeUp(index)}
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3",
        strong &&
          "bg-primary/5"
      )}
    >
      <dt
        className={cn(
          "text-body-sm",
          strong
            ? "text-text-primary font-medium"
            : "text-text-muted"
        )}
      >
        {label}

        {hint && (
          <span className="text-caption text-text-subtle block">
            {hint}
          </span>
        )}
      </dt>

      <dd
        className={cn(
          "tabular-nums",
          strong
            ? "text-text-primary text-base font-semibold"
            : "text-body-sm",
          muted
            ? "text-text-subtle"
            : "text-text-primary"
        )}
      >
        {value}
      </dd>
    </motion.div>
  );
}

/* =========================================================
   HISTORY SUMMARY
========================================================= */

function summarise(
  change: DealPriceChange,
  currency: string
): string {
  const money = (
    value: number | null
  ) => {
    if (value === null) {
      return "not set";
    }

    const fils =
      toFils(value);

    return fils === null
      ? "not set"
      : formatFils(
          fils,
          currency
        );
  };

  const discountFils =
    toFils(
      change.discount_amount
    ) ?? ZERO_FILS;

  const feesFils =
    toFils(
      change.fees_amount
    ) ?? ZERO_FILS;

  const fees =
    feesFils > ZERO_FILS
      ? ` · fees ${formatFils(
          feesFils,
          currency
        )}`
      : "";

  return `Proposed ${money(
    change.proposed_price
  )} · discount ${formatFils(
    discountFils,
    currency
  )}${fees} · agreed ${money(
    change.agreed_price
  )}`;
}

/* =========================================================
   COMPONENT
========================================================= */

export function DealPricingTab({
  deal,
  settings,
  history,
  extras,
  permissions,
}: DealPricingTabProps) {
  const { fadeUp } =
    useMotion();

  const router =
    useRouter();

  const [
    open,
    setOpen,
  ] = useState<
    "edit" | "approve" | null
  >(null);

  const currency =
    deal.currency;

  const isOpen =
    OPEN_STATUSES.includes(
      deal.status
    );

  /*
   * DealFee and FeeType are intentionally different.
   *
   * extras.fees:
   *   saved fee rows for this deal
   *
   * extras.feeTypes:
   *   fee definitions containing calc_mode + value
   *
   * describeFeeRule() must receive a FeeType.
   */
  const feeTypes =
    extras.feeTypes ?? [];

  /* =======================================================
     MONEY VALUES
  ======================================================= */

  const listed =
    toFils(
      deal.listed_price
    );

  const proposed =
    toFils(
      deal.proposed_price
    );

  const discount =
    toFils(
      deal.discount_amount
    ) ?? ZERO_FILS;

  const feesTotal =
    toFils(
      deal.fees_amount
    ) ?? ZERO_FILS;

  const tax =
    toFils(
      deal.tax_amount
    ) ?? ZERO_FILS;

  const agreed =
    toFils(
      deal.agreed_price
    );

  const total =
    toFils(
      deal.total_due
    );

  /* =======================================================
     NET / ESTIMATED TOTAL
  ======================================================= */

  const net =
    proposed !== null &&
    discount <= proposed
      ? proposed -
        discount
      : null;

  const estimated =
    agreed === null &&
    net !== null
      ? net +
        feesTotal +
        tax
      : null;

  /* =======================================================
     DISCOUNT APPROVAL
  ======================================================= */

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

  const discountBps =
    proposed !== null &&
    proposed > ZERO_FILS &&
    discount <= proposed
      ? Number(
          (
            discount *
            BASIS_POINTS_SCALE
          ) /
            proposed
        )
      : null;

  const needsApproval =
    proposed !== null &&
    proposed > ZERO_FILS &&
    discount *
      BASIS_POINTS_SCALE >
      proposed *
        thresholdBps &&
    !deal.price_approved_at;

  /* =======================================================
     PERMISSIONS
  ======================================================= */

  const canEdit =
    permissions.edit &&
    isOpen;

  const canApprove =
    permissions.approveDiscount &&
    isOpen &&
    needsApproval;

  /* =======================================================
     FORMATTERS
  ======================================================= */

  const money = (
    value: bigint | null
  ) =>
    value === null
      ? "Not set yet"
      : formatFils(
          value,
          currency
        );

  /* =======================================================
     PRICE COMPARISON
  ======================================================= */

  let compare:
    string | null =
    null;

  if (
    proposed !== null &&
    listed !== null &&
    proposed !== listed
  ) {
    const gap =
      proposed > listed
        ? proposed - listed
        : listed - proposed;

    compare =
      `The proposed price is ${formatFils(
        gap,
        currency
      )} ${
        proposed < listed
          ? "below"
          : "above"
      } the price when the deal started.`;
  }

  /* =======================================================
     DIALOG COMPLETE
  ======================================================= */

  const done = () => {
    setOpen(null);
    router.refresh();
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_360px]">
      {/* ===================================================
          PRICE BREAKDOWN
      =================================================== */}

      <section
        aria-label="Price breakdown"
        className="surface-card flex flex-col gap-4 p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-label">
            Price breakdown
          </p>

          <div className="flex flex-wrap gap-2">
            {canApprove && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={
                  <BadgeCheck
                    className="size-4"
                    aria-hidden="true"
                  />
                }
                onClick={() =>
                  setOpen(
                    "approve"
                  )
                }
              >
                Approve discount
              </Button>
            )}

            {canEdit && (
              <Button
                size="sm"
                variant="gradient"
                leftIcon={
                  <Pencil
                    className="size-4"
                    aria-hidden="true"
                  />
                }
                onClick={() =>
                  setOpen(
                    "edit"
                  )
                }
              >
                Edit pricing
              </Button>
            )}
          </div>
        </div>

        {/* =================================================
            PRICE LINES
        ================================================= */}

        <dl className="divide-border border-border divide-y overflow-hidden rounded-md border">
          <Line
            index={0}
            label="Price when the deal started"
            value={
              money(
                listed
              )
            }
            muted={
              listed ===
              null
            }
          />

          <Line
            index={1}
            label="Proposed selling price"
            value={
              money(
                proposed
              )
            }
            muted={
              proposed ===
              null
            }
          />

          <Line
            index={2}
            label="Discount"
            value={
              discount >
              ZERO_FILS
                ? `− ${formatFils(
                    discount,
                    currency
                  )}`
                : "None"
            }
            muted={
              discount ===
              ZERO_FILS
            }
          />

          <Line
            index={3}
            label="Net price"
            value={
              money(
                net
              )
            }
            muted={
              net ===
              null
            }
          />

          {/* ===============================================
              FEES
          =============================================== */}

          {extras.fees ===
          null ? (
            <Line
              index={4}
              label="Fees"
              hint="The fee details couldn't be loaded"
              value={
                feesTotal >
                ZERO_FILS
                  ? formatFils(
                      feesTotal,
                      currency
                    )
                  : "None"
              }
              muted={
                feesTotal ===
                ZERO_FILS
              }
            />
          ) : extras.fees
              .length ===
            0 ? (
            <Line
              index={4}
              label="Fees"
              value="None"
              muted
            />
          ) : (
            extras.fees.map(
              (
                fee,
                index
              ) => {
                const feeFils =
                  toFils(
                    fee.amount
                  ) ??
                  ZERO_FILS;

                /*
                 * DealFee doesn't contain `value`.
                 *
                 * Find the original FeeType definition
                 * before calling describeFeeRule().
                 */
                const feeType =
                  feeTypes.find(
                    (
                      candidate
                    ) =>
                      candidate.name ===
                      fee.name
                  );

                const feeHint =
                  feeType
                    ? describeFeeRule(
                        feeType,
                        currency
                      )
                    : "Saved fee amount";

                return (
                  <Line
                    key={
                      fee.id
                    }
                    index={
                      4 +
                      index
                    }
                    label={
                      fee.name
                    }
                    hint={
                      feeHint
                    }
                    value={
                      formatFils(
                        feeFils,
                        currency
                      )
                    }
                  />
                );
              }
            )
          )}

          {/* ===============================================
              TAX
          =============================================== */}

          <Line
            index={8}
            label="Tax"
            hint="Not applied yet. It is added once the tax rules are confirmed"
            value={
              tax >
              ZERO_FILS
                ? formatFils(
                    tax,
                    currency
                  )
                : "Not applied"
            }
            muted={
              tax ===
              ZERO_FILS
            }
          />

          {/* ===============================================
              AGREED PRICE
          =============================================== */}

          <Line
            index={9}
            label="Agreed price"
            value={
              money(
                agreed
              )
            }
            muted={
              agreed ===
              null
            }
          />

          {estimated !==
            null && (
            <Line
              index={10}
              label="Estimated total"
              hint="Becomes final when the deal is confirmed"
              value={
                money(
                  estimated
                )
              }
            />
          )}

          <Line
            index={11}
            strong
            label="Total due"
            value={
              money(
                total
              )
            }
            muted={
              total ===
              null
            }
          />
        </dl>

        {/* =================================================
            COMPARISON
        ================================================= */}

        {compare && (
          <p
            className="text-caption text-text-subtle"
            role="status"
          >
            {compare}
          </p>
        )}

        <p className="text-caption text-text-subtle">
          The price is kept as it was when the deal started,
          so later inventory price changes never alter it.
          Fees are saved as they were when you saved the pricing.
        </p>

        {/* =================================================
            APPROVAL STATUS
        ================================================= */}

        {discount >
          ZERO_FILS && (
          <div
            className={cn(
              "text-body-sm text-text-primary flex items-start gap-2 rounded-md border px-3 py-2.5",

              needsApproval
                ? "border-amber-500/30 bg-amber-500/10"
                : "border-success/30 bg-success/10"
            )}
          >
            {needsApproval ? (
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-amber-400"
                aria-hidden="true"
              />
            ) : (
              <BadgeCheck
                className="text-success mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
            )}

            <span>
              {needsApproval
                ? `The discount is ${
                    discountBps !==
                    null
                      ? formatBasisPoints(
                          discountBps
                        )
                      : "high"
                  } of the proposed price, above the ${formatBasisPoints(
                    Number(
                      thresholdBps
                    )
                  )} limit. A manager or admin must approve it before the deal can be confirmed.${
                    permissions.approveDiscount
                      ? ""
                      : " You can't approve it yourself."
                  }`
                : deal.price_approved_at
                  ? `Discount approved${
                      deal.price_approved_by_name
                        ? ` by ${deal.price_approved_by_name}`
                        : ""
                    } on ${formatDateTimeFull(
                      deal.price_approved_at
                    )}.`
                  : `The discount is within the ${formatBasisPoints(
                      Number(
                        thresholdBps
                      )
                    )} limit that needs no approval.`}
            </span>
          </div>
        )}
      </section>

      {/* ===================================================
          PRICE HISTORY
      =================================================== */}

      <motion.section
        {...fadeUp(2)}
        aria-label="Price history"
        className="surface-card flex flex-col gap-4 p-5"
      >
        <p className="text-label">
          Price history
        </p>

        {history ===
        null ? (
          <p
            role="alert"
            className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
          >
            The price history couldn&apos;t be loaded.
            Refresh the page to try again.
          </p>
        ) : history.length ===
          0 ? (
          <p className="text-body-sm text-text-subtle">
            No price changes recorded.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {history.map(
              (
                change,
                index
              ) => (
                <motion.li
                  key={
                    change.id
                  }
                  {...fadeUp(
                    index
                  )}
                  className="border-border border-l-2 pl-3"
                >
                  <p className="text-body-sm text-text-primary">
                    {summarise(
                      change,
                      currency
                    )}
                  </p>

                  <p className="text-caption text-text-subtle">
                    {formatDateTimeFull(
                      change.changed_at
                    )}{" "}
                    ·{" "}
                    {
                      change.changed_by_name
                    }

                    {change.approved_by_name
                      ? ` · approved by ${change.approved_by_name}`
                      : ""}
                  </p>

                  {change.note && (
                    <p className="text-caption text-text-muted mt-0.5">
                      Note:{" "}
                      {
                        change.note
                      }
                    </p>
                  )}
                </motion.li>
              )
            )}
          </ol>
        )}
      </motion.section>

      {/* ===================================================
          EDIT PRICING
      =================================================== */}

      {open ===
        "edit" && (
        <DealPricingDialog
          deal={
            deal
          }
          settings={
            settings
          }
          fees={
            extras.fees
          }
          feeTypes={
            feeTypes
          }
          feesEnabled={
            extras.feesEnabled ===
            true
          }
          canApprove={
            permissions.approveDiscount
          }
          onClose={() =>
            setOpen(
              null
            )
          }
          onDone={
            done
          }
        />
      )}

      {/* ===================================================
          APPROVE DISCOUNT
      =================================================== */}

      {open ===
        "approve" && (
        <DealApproveDialog
          deal={
            deal
          }
          settings={
            settings
          }
          onClose={() =>
            setOpen(
              null
            )
          }
          onDone={
            done
          }
        />
      )}
    </div>
  );
}