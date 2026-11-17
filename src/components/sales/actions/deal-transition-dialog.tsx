"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { motion } from "motion/react";
import { toast } from "sonner";

import {
  CheckCircle2,
  Circle,
  TriangleAlert,
} from "lucide-react";

import { Modal } from "@/src/components/ui/modal";
import { Button } from "@/src/components/ui/button";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { Skeleton } from "@/src/components/ui/skeleton";

import { SalesStatusBadge } from "@/src/components/sales/sales-status-badge";

import {
  getCancellationReasonsAction,
  transitionDealAction,
} from "@/app/admin/sales/deal-actions";

import { useMotion } from "@/src/hooks/use-motion";

import { READINESS_TITLES } from "@/src/lib/utils/sales-readiness";

import {
  formatFils,
  toFils,
} from "@/src/lib/utils/sales-money";

import type {
  CancellationReason,
  DealTransitionKind,
} from "@/src/lib/types/sales-actions";

import type {
  ReadinessGroup,
  SalesDealDetail,
} from "@/src/lib/types/sales-detail";

import type {
  SalesDealStatus,
} from "@/src/lib/types/sales";

import { cn } from "@/src/lib/utils/cn";

/* =========================================================
   BIGINT CONSTANTS
========================================================= */

const ZERO_FILS =
  BigInt(0);

/* =========================================================
   TYPES
========================================================= */

interface DealTransitionDialogProps {
  kind:
    DealTransitionKind;

  deal:
    SalesDealDetail;

  readiness:
    ReadinessGroup[];

  /**
   * Set when another deal or
   * reservation holds the vehicle.
   */
  holdConflict:
    string | null;

  onClose:
    () => void;

  onDone:
    () => void;
}

/* =========================================================
   CONFIG
========================================================= */

const CONFIG: Record<
  DealTransitionKind,
  {
    title:
      string;

    to:
      | "Negotiation"
      | "Reserved"
      | "Confirmed"
      | "Cancelled";

    confirm:
      string;

    success:
      string;

    target:
      SalesDealStatus;
  }
> = {
  negotiation: {
    title:
      "Start negotiation",

    to:
      "Negotiation",

    confirm:
      "Start negotiation",

    success:
      "Negotiation started",

    target:
      "Negotiation",
  },

  reserve: {
    title:
      "Reserve vehicle",

    to:
      "Reserved",

    confirm:
      "Reserve vehicle",

    success:
      "Vehicle reserved",

    target:
      "Reserved",
  },

  confirm: {
    title:
      "Confirm deal",

    to:
      "Confirmed",

    confirm:
      "Confirm deal",

    success:
      "Deal confirmed",

    target:
      "Confirmed",
  },

  cancel: {
    title:
      "Cancel deal",

    to:
      "Cancelled",

    confirm:
      "Cancel deal",

    success:
      "Deal cancelled",

    target:
      "Cancelled",
  },
};

/* =========================================================
   CANCELLATION STATE
========================================================= */

type ReasonState =
  | {
      status:
        "loading";
    }
  | {
      status:
        "ok";

      reasons:
        CancellationReason[];
    }
  | {
      status:
        "failed";
    };

/* =========================================================
   CHECKLIST
========================================================= */

function Checklist({
  group,
}: {
  group:
    ReadinessGroup | undefined;
}) {
  const {
    fadeUp,
  } =
    useMotion();

  if (!group) {
    return null;
  }

  return (
    <ul
      className="flex flex-col gap-2"
      aria-label={
        group.title
      }
    >
      {group.items.map(
        (
          item,
          index
        ) => {
          const Icon =
            item.done
              ? CheckCircle2
              : Circle;

          return (
            <motion.li
              key={
                item.key
              }
              {...fadeUp(
                index
              )}
              className="border-border bg-card-hover/30 flex items-start gap-3 rounded-md border px-3 py-2.5"
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",

                  item.done
                    ? "text-success"
                    : "text-text-subtle"
                )}
                aria-hidden="true"
              />

              <div className="min-w-0">
                <p
                  className={cn(
                    "text-body-sm",

                    item.done
                      ? "text-text-primary"
                      : "text-text-muted"
                  )}
                >
                  {
                    item.label
                  }

                  <span className="sr-only">
                    {item.done
                      ? " (done)"
                      : " (still needed)"}
                  </span>
                </p>

                {item.detail && (
                  <p className="text-caption text-text-subtle">
                    {
                      item.detail
                    }
                  </p>
                )}
              </div>
            </motion.li>
          );
        }
      )}
    </ul>
  );
}

/* =========================================================
   ALERT
========================================================= */

function Alert({
  tone,
  children,
}: {
  tone:
    "error" | "warning";

  children:
    ReactNode;
}) {
  return (
    <p
      role={
        tone ===
        "error"
          ? "alert"
          : "status"
      }
      className={cn(
        "text-body-sm text-text-primary flex items-start gap-2 rounded-md border px-3 py-2.5",

        tone ===
          "error"
          ? "border-red-500/40 bg-red-500/10"
          : "border-amber-500/30 bg-amber-500/10"
      )}
    >
      <TriangleAlert
        className={cn(
          "mt-0.5 size-4 shrink-0",

          tone ===
            "error"
            ? "text-red-400"
            : "text-amber-400"
        )}
        aria-hidden="true"
      />

      <span>
        {children}
      </span>
    </p>
  );
}

/* =========================================================
   COMPONENT
========================================================= */

/**
 * The parent mounts this only while it is open,
 * so every opening starts clean and reads
 * fresh figures.
 */
export function DealTransitionDialog({
  kind,
  deal,
  readiness,
  holdConflict,
  onClose,
  onDone,
}: DealTransitionDialogProps) {
  const cfg =
    CONFIG[kind];

  const currency =
    deal.currency;

  /* =======================================================
     STATE
  ======================================================= */

  const [
    reasonId,
    setReasonId,
  ] =
    useState("");

  const [
    detail,
    setDetail,
  ] =
    useState("");

  const [
    refundNote,
    setRefundNote,
  ] =
    useState("");

  const [
    reasonState,
    setReasonState,
  ] =
    useState<ReasonState>({
      status:
        "loading",
    });

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  /* =======================================================
     LOAD CANCELLATION REASONS
  ======================================================= */

  useEffect(() => {
    if (
      kind !==
      "cancel"
    ) {
      return;
    }

    let cancelled =
      false;

    getCancellationReasonsAction()
      .then(
        (
          reasons
        ) => {
          if (
            cancelled
          ) {
            return;
          }

          setReasonState(
            reasons
              ? {
                  status:
                    "ok",

                  reasons,
                }
              : {
                  status:
                    "failed",
                }
          );
        }
      )
      .catch(() => {
        if (
          !cancelled
        ) {
          setReasonState({
            status:
              "failed",
          });
        }
      });

    return () => {
      cancelled =
        true;
    };
  }, [kind]);

  /* =======================================================
     VERIFIED PAYMENT
  ======================================================= */

  const verifiedPaid =
    toFils(
      deal.verified_paid
    ) ?? ZERO_FILS;

  const hasMoney =
    verifiedPaid >
    ZERO_FILS;

  /* =======================================================
     REQUIRED READINESS GROUP
  ======================================================= */

  const GROUP_TITLE = {
    negotiation:
      READINESS_TITLES.negotiation,

    reserve:
      READINESS_TITLES.reserve,

    confirm:
      READINESS_TITLES.confirm,

    cancel:
      READINESS_TITLES.confirm,
  } as const;

  const group =
    readiness.find(
      (item) =>
        item.title ===
        GROUP_TITLE[kind]
    );

  /* =======================================================
     CANCELLATION REASON
  ======================================================= */

  const chosenReason =
    reasonState.status ===
    "ok"
      ? reasonState.reasons.find(
          (reason) =>
            reason.id ===
            reasonId
        )
      : undefined;

  /* =======================================================
     SUBMISSION READINESS
  ======================================================= */

  let canSubmit =
    false;

  if (
    kind ===
    "negotiation"
  ) {
    canSubmit =
      Boolean(
        group?.ready
      );
  }

  if (
    kind ===
    "reserve"
  ) {
    canSubmit =
      Boolean(
        group?.ready
      ) &&
      !holdConflict;
  }

  if (
    kind ===
    "confirm"
  ) {
    canSubmit =
      Boolean(
        group?.ready
      ) &&
      !holdConflict;
  }

  if (
    kind ===
    "cancel"
  ) {
    canSubmit =
      reasonState.status ===
        "ok" &&
      Boolean(
        chosenReason
      ) &&
      (
        !chosenReason?.requires_detail ||
        detail.trim()
          .length >=
          3
      ) &&
      (
        !hasMoney ||
        refundNote
          .trim()
          .length >=
          3
      );
  }

  /* =======================================================
     SUBMIT
  ======================================================= */

  const submit =
    async () => {
      setError(
        null
      );

      setSaving(
        true
      );

      try {
        const result =
          await transitionDealAction({
            id:
              deal.id,

            to:
              cfg.to,

            /**
             * Sent back exactly as it was read,
             * so the database can tell if the
             * deal changed meanwhile.
             */
            expectedUpdatedAt:
              deal.updated_at,

            reasonId:
              kind ===
              "cancel"
                ? reasonId ||
                  null
                : null,

            reason:
              kind ===
              "cancel"
                ? detail.trim()
                : "",

            refundNote:
              kind ===
              "cancel"
                ? refundNote.trim()
                : "",
          });

        if (
          result.error
        ) {
          setError(
            result.error
          );

          toast.error(
            result.error
          );

          return;
        }

        toast.success(
          cfg.success
        );

        onDone();
      } catch {
        const message =
          "Something went wrong. Refresh the page to see the deal's current state.";

        setError(
          message
        );

        toast.error(
          message
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  /* =======================================================
     CONFIRMATION FIGURES
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

  const net =
    toFils(
      deal.agreed_price
    ) ??
    (
      proposed !== null &&
      proposed >
        ZERO_FILS &&
      discount <=
        proposed
        ? proposed -
          discount
        : null
    );

  const total =
    net !== null
      ? net +
        fees +
        tax
      : null;

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <Modal
      isOpen
      onClose={() => {
        if (
          !saving
        ) {
          onClose();
        }
      }}
      size="md"
      title={
        cfg.title
      }
      footer={
        <>
          <Button
            variant="outline"
            onClick={
              onClose
            }
            disabled={
              saving
            }
          >
            {kind ===
            "cancel"
              ? "Keep deal"
              : "Go back"}
          </Button>

          <Button
            variant={
              kind ===
              "cancel"
                ? "destructiveSolid"
                : "primary"
            }
            onClick={
              submit
            }
            isLoading={
              saving
            }
            disabled={
              !canSubmit
            }
          >
            {
              cfg.confirm
            }
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* =================================================
            DEAL HEADER
        ================================================= */}

        <div className="border-border bg-card-hover/40 flex flex-col gap-1 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-caption text-text-subtle">
              {
                deal.deal_number
              }
            </p>

            <SalesStatusBadge
              status={
                deal.status
              }
              size="sm"
            />
          </div>

          <p className="text-text-primary font-medium">
            {
              deal.customer_name
            }
          </p>

          <p className="text-body-sm text-text-muted">
            {
              deal.vehicle_title
            }
          </p>
        </div>

        {/* =================================================
            NEGOTIATION
        ================================================= */}

        {kind ===
          "negotiation" && (
          <>
            <p className="text-body-sm text-text-muted">
              Negotiation is where price and terms get agreed.
              It doesn&apos;t hold the vehicle for this customer.
            </p>

            <Checklist
              group={
                group
              }
            />
          </>
        )}

        {/* =================================================
            CONFIRM
        ================================================= */}

        {kind ===
          "confirm" && (
          <>
            <p className="text-body-sm text-text-muted">
              Confirming agrees the sale. The price below is
              fixed and the vehicle is held for this customer,
              so no other deal can confirm it. A confirmed sale
              is not yet a delivered vehicle, and it is not
              necessarily fully paid.
            </p>

            <dl className="border-border divide-border divide-y rounded-md border">
              {[
                [
                  "Proposed price",
                  proposed !==
                  null
                    ? formatFils(
                        proposed,
                        currency
                      )
                    : "—",
                ],

                [
                  "Discount",
                  discount >
                  ZERO_FILS
                    ? `− ${formatFils(
                        discount,
                        currency
                      )}`
                    : "None",
                ],

                [
                  "Agreed price",
                  net !== null
                    ? formatFils(
                        net,
                        currency
                      )
                    : "—",
                ],

                [
                  "Fees and tax",
                  fees +
                    tax >
                  ZERO_FILS
                    ? formatFils(
                        fees +
                          tax,
                        currency
                      )
                    : "None",
                ],
              ].map(
                ([
                  label,
                  value,
                ]) => (
                  <div
                    key={
                      label
                    }
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <dt className="text-caption text-text-subtle">
                      {
                        label
                      }
                    </dt>

                    <dd className="text-body-sm text-text-primary tabular-nums">
                      {
                        value
                      }
                    </dd>
                  </div>
                )
              )}

              <div className="bg-primary/5 flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-body-sm text-text-primary font-medium">
                  Total due
                </dt>

                <dd className="text-text-primary font-semibold tabular-nums">
                  {total !==
                  null
                    ? formatFils(
                        total,
                        currency
                      )
                    : "—"}
                </dd>
              </div>
            </dl>

            <Checklist
              group={
                group
              }
            />

            {holdConflict && (
              <Alert tone="warning">
                {
                  holdConflict
                }
              </Alert>
            )}
          </>
        )}

        {/* =================================================
            RESERVE
        ================================================= */}

        {kind ===
          "reserve" && (
          <>
            <p className="text-body-sm text-text-muted">
              Reserving ties this deal to its confirmed reservation,
              so the vehicle stays held for this customer while the
              deal moves forward. If the reservation is released or
              runs out, the deal goes back to negotiation.
            </p>

            <Checklist
              group={
                group
              }
            />

            {holdConflict && (
              <Alert tone="warning">
                {
                  holdConflict
                }
              </Alert>
            )}
          </>
        )}

        {/* =================================================
            CANCEL
        ================================================= */}

        {kind ===
          "cancel" && (
          <>
            <p className="text-body-sm text-text-muted">
              {deal.status ===
              "Confirmed"
                ? "The vehicle will be released for other deals. "
                : deal.status ===
                    "Reserved"
                  ? "The reservation will be released. "
                  : "Nothing is held, so no vehicle is released. "}

              A cancelled deal can&apos;t be reopened. Start a new
              deal if the customer comes back.
            </p>

            {reasonState.status ===
              "loading" && (
              <div
                className="flex flex-col gap-2"
                aria-busy="true"
                aria-label="Loading reasons"
              >
                <Skeleton className="h-10 w-full" />

                <Skeleton className="h-20 w-full" />
              </div>
            )}

            {reasonState.status ===
              "failed" && (
              <Alert tone="error">
                The cancellation reasons couldn&apos;t be loaded,
                so cancelling is paused. Close this and try again.
              </Alert>
            )}

            {reasonState.status ===
              "ok" && (
              <>
                <Select
                  label="Reason"
                  required
                  placeholder="Choose a reason"
                  options={
                    reasonState.reasons.map(
                      (
                        reason
                      ) => ({
                        value:
                          reason.id,

                        label:
                          reason.name,
                      })
                    )
                  }
                  value={
                    reasonId
                  }
                  onChange={(
                    event
                  ) => {
                    setReasonId(
                      event.target
                        .value
                    );

                    setError(
                      null
                    );
                  }}
                />

                <Textarea
                  label={
                    chosenReason?.requires_detail
                      ? "Details"
                      : "Details (optional)"
                  }
                  required={
                    chosenReason?.requires_detail
                  }
                  placeholder="Tell the team what happened."
                  rows={3}
                  maxLength={
                    500
                  }
                  showCharacterCount
                  value={
                    detail
                  }
                  onChange={(
                    event
                  ) =>
                    setDetail(
                      event.target
                        .value
                    )
                  }
                />
              </>
            )}

            {hasMoney && (
              <>
                <Alert tone="warning">
                  {formatFils(
                    verifiedPaid,
                    currency
                  )}{" "}
                  has been paid on this deal. Payments stay on
                  record. Explain what will happen to the money.
                </Alert>

                <Textarea
                  label="Refund or payment note"
                  required
                  placeholder="For example: deposit to be refunded by bank transfer."
                  rows={2}
                  maxLength={
                    500
                  }
                  showCharacterCount
                  value={
                    refundNote
                  }
                  onChange={(
                    event
                  ) =>
                    setRefundNote(
                      event.target
                        .value
                    )
                  }
                />
              </>
            )}
          </>
        )}

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <Alert tone="error">
            {
              error
            }
          </Alert>
        )}
      </div>
    </Modal>
  );
}