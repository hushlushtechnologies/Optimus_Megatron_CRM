"use client";

import type { ReactNode } from "react";

import { motion } from "motion/react";

import { CheckCircle2, Circle } from "lucide-react";

import { useMotion } from "@/src/hooks/use-motion";

import { formatFils } from "@/src/lib/utils/sales-money";

import type { DealPricing } from "@/src/lib/types/sales-deal-form";

import type { TestDriveCustomerOption, TestDriveVehicleOption } from "@/src/lib/types/test-drive";

/* =========================================================
   BIGINT CONSTANTS
========================================================= */

const ZERO_FILS = BigInt(0);

/* =========================================================
   TYPES
========================================================= */

interface DealSummaryCardProps {
  customer: TestDriveCustomerOption | null;

  vehicle: TestDriveVehicleOption | null;

  showroomName: string | null;

  ownerName: string | null;

  leadLabel: string;

  pricing: DealPricing;

  currency: string;
}

/* =========================================================
   ROW
========================================================= */

function Row({
  label,
  children,
}: {
  label: string;

  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-caption text-text-subtle shrink-0">{label}</dt>

      <dd className="text-body-sm text-text-primary min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

/* =========================================================
   ANIMATED AMOUNT
========================================================= */

/**
 * A formatted amount that fades in
 * when its displayed value changes.
 *
 * Display only — the supplied text
 * has already been calculated exactly.
 */
function Amount({ text }: { text: string }) {
  const { reduce, transition } = useMotion();

  return (
    <motion.span
      key={text}
      initial={
        reduce
          ? false
          : {
              opacity: 0,

              y: 4,
            }
      }
      animate={{
        opacity: 1,

        y: 0,
      }}
      transition={transition(0.18)}
      className="inline-block tabular-nums"
    >
      {text}
    </motion.span>
  );
}

/* =========================================================
   CHECKLIST STEP
========================================================= */

function Step({
  done,
  children,
}: {
  done: boolean;

  children: ReactNode;
}) {
  const Icon = done ? CheckCircle2 : Circle;

  return (
    <li className="text-body-sm flex items-center gap-2">
      <Icon
        className={done ? "text-success size-4 shrink-0" : "text-text-subtle size-4 shrink-0"}
        aria-hidden="true"
      />

      <span className={done ? "text-text-primary" : "text-text-muted"}>
        {children}

        <span className="sr-only">{done ? " (done)" : " (still needed)"}</span>
      </span>
    </li>
  );
}

/* =========================================================
   COMPONENT
========================================================= */

export function DealSummaryCard({
  customer,
  vehicle,
  showroomName,
  ownerName,
  leadLabel,
  pricing,
  currency,
}: DealSummaryCardProps) {
  const none = <span className="text-text-subtle">Not chosen</span>;

  return (
    <aside aria-label="Deal summary" className="surface-card flex flex-col gap-4 p-5">
      {/* ===================================================
          HEADER
      =================================================== */}

      <div>
        <p className="text-label">Deal summary</p>

        <p className="text-body-sm text-text-muted mt-1">
          Saved as a draft. Nothing is held for the customer yet.
        </p>
      </div>

      {/* ===================================================
          DEAL DETAILS
      =================================================== */}

      <dl className="divide-border divide-y">
        <Row label="Customer">
          {customer ? (
            <>
              {customer.full_name}

              <span className="text-caption text-text-subtle block">{customer.customer_number}</span>
            </>
          ) : (
            none
          )}
        </Row>

        <Row label="Vehicle">
          {vehicle ? (
            <>
              {vehicle.display_title}

              <span className="text-caption text-text-subtle block">{vehicle.stock_id}</span>
            </>
          ) : (
            none
          )}
        </Row>

        <Row label="Showroom">{showroomName ?? none}</Row>

        <Row label="Sales executive">
          {ownerName ?? <span className="text-text-subtle">No owner yet</span>}
        </Row>

        <Row label="Lead">{leadLabel}</Row>
      </dl>

      {/* ===================================================
          PRICING
      =================================================== */}

      <dl className="border-border flex flex-col rounded-md border">
        {/* ===============================================
            PROPOSED PRICE
        =============================================== */}

        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <dt className="text-caption text-text-subtle">Proposed price</dt>

          <dd className="text-body-sm text-text-primary">
            <Amount text={pricing.proposedFils !== null ? formatFils(pricing.proposedFils, currency) : "—"} />
          </dd>
        </div>

        {/* ===============================================
            DISCOUNT
        =============================================== */}

        <div className="border-border flex items-center justify-between gap-3 border-t px-3 py-2">
          <dt className="text-caption text-text-subtle">Discount</dt>

          <dd className="text-body-sm text-text-primary">
            <Amount
              text={
                pricing.discountFils > ZERO_FILS ? `− ${formatFils(pricing.discountFils, currency)}` : "—"
              }
            />
          </dd>
        </div>

        {/* ===============================================
            NET PRICE
        =============================================== */}

        <div className="border-border bg-primary/5 flex items-center justify-between gap-3 border-t px-3 py-3">
          <dt className="text-body-sm text-text-primary font-medium">Net price</dt>

          <dd className="text-text-primary text-base font-semibold">
            <Amount text={pricing.netFils !== null ? formatFils(pricing.netFils, currency) : "—"} />
          </dd>
        </div>
      </dl>

      {/* ===================================================
          READINESS CHECKLIST
      =================================================== */}

      <div>
        <p className="text-caption text-text-subtle mb-2">To start negotiation you&apos;ll need</p>

        <ul className="flex flex-col gap-1.5">
          <Step done={Boolean(customer) && Boolean(vehicle)}>A customer and a vehicle</Step>

          <Step done={Boolean(ownerName)}>A sales executive</Step>

          <Step done={pricing.proposedFils !== null}>A proposed price</Step>
        </ul>
      </div>
    </aside>
  );
}
