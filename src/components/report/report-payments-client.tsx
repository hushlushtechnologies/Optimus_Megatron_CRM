"use client";

import { motion } from "motion/react";
import { AlertTriangle, Info } from "lucide-react";

import { ReportBreakdownTable } from "@/src/components/report/report-breakdown-table";
import { ReportCountBreakdown } from "@/src/components/report/report-count-breakdown";
import { ReportFigureCard } from "@/src/components/report/report-figure-card";
import { ReportPeriodPicker } from "@/src/components/report/report-period-picker";
import { useMotion } from "@/src/hooks/use-motion";
import type { ReportFigure } from "@/src/lib/supabase/report-aggregate";
import {
  AWAITING_NOTE,
  PAYMENTS_METRICS,
  RECONCILIATION_NOTE,
  type AgedPaymentRow,
  type DailyTotalRow,
  type MethodTotalRow,
  type PaymentsReportData,
  type RefundRow,
} from "@/src/lib/types/report-payments";
import type { Money } from "@/src/lib/utils/report-money";
import type { ReportRangeId } from "@/src/lib/utils/report-time";

/*
|--------------------------------------------------------------------------
| PAYMENTS AND COLLECTIONS
|--------------------------------------------------------------------------
|
| Three sections, in the order somebody actually asks about them: what came
| in, what has not been confirmed yet, and what did not stick.
|
| The awaiting section is deliberately its own block with its own note
| rather than three more cards in the collection grid. Put "Collected: AED
| 1.2M" and "Value awaiting: AED 300k" side by side in one row of cards and
| somebody will add them, every time. They are different kinds of claim and
| the layout says so.
*/

interface ReportPaymentsClientProps {
  data: PaymentsReportData;
  range: ReportRangeId;
  canSeeFinancial: boolean;
}

function Note({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning";
}) {
  const Icon = tone === "warning" ? AlertTriangle : Info;

  return (
    <div
      role="note"
      className={
        tone === "warning"
          ? "border-warning/30 bg-warning/5 flex items-start gap-2.5 rounded-lg border px-4 py-3"
          : "border-border bg-card-hover flex items-start gap-2.5 rounded-lg border px-4 py-3"
      }
    >
      <Icon
        className={
          tone === "warning"
            ? "text-warning mt-0.5 size-4 shrink-0"
            : "text-text-subtle mt-0.5 size-4 shrink-0"
        }
        aria-hidden="true"
      />
      <p className="text-body-sm text-text-muted">{children}</p>
    </div>
  );
}

export function ReportPaymentsClient({
  data,
  range,
  canSeeFinancial,
}: ReportPaymentsClientProps) {
  const { fadeUp } = useMotion();

  const figures: Record<string, ReportFigure<number | Money>> = {
    collected: data.collected,
    collectedCount: data.collectedCount,
    refunded: data.refunded,
    refundCount: data.refundCount,
    net: data.net,
    /* averagePayment is ReportFigure<Money | null>: null inside a success
       means no payments to average, not a failed lookup. */
    averagePayment: {
      ...data.averagePayment,
      value: data.averagePayment.value ?? null,
    } as ReportFigure<Money>,
    awaitingCount: data.awaitingCount,
    awaitingAmount: data.awaitingAmount,
    oldestAwaitingDays: data.oldestAwaitingDays as ReportFigure<number>,
    rejectedCount: data.rejectedCount,
    reversedCount: data.reversedCount,
    reversedAmount: data.reversedAmount,
  };

  const visible = PAYMENTS_METRICS.filter((metric) => canSeeFinancial || !metric.financial);

  const renderCards = (group: "collection" | "awaiting" | "failed") => (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {visible
        .filter((metric) => metric.group === group)
        .map((metric, index) => (
          <motion.div key={metric.id} {...fadeUp(index)} className="min-w-0">
            <ReportFigureCard
              label={metric.label}
              definition={metric.definition}
              basis={metric.basis}
              figure={figures[metric.id]}
              suffix={metric.id === "oldestAwaitingDays" ? " days" : undefined}
            />
          </motion.div>
        ))}
    </div>
  );

  const moneyColumns = canSeeFinancial;

  return (
    <div className="flex flex-col gap-6">
      <ReportPeriodPicker active={range} label={data.rangeLabel} />

      {/* =====================================================
          WHAT CAME IN
      ===================================================== */}

      <section className="flex flex-col gap-4">
        <h2 className="text-h4">Collections</h2>

        {renderCards("collection")}

        <ReportBreakdownTable<MethodTotalRow>
          title="By payment method"
          description="Verified payments only. Collected and refunded are kept apart."
          rows={data.byMethod.value}
          columns={[
            { id: "method", label: "Method", value: (row) => row.method },
            {
              id: "count",
              label: "Received",
              align: "right",
              value: (row) => row.count,
              render: (row) => row.count.toLocaleString("en-US"),
            },
            {
              id: "collected",
              label: "Collected",
              align: "right",
              value: (row) => row.collected.chart,
              render: (row) => row.collected.display,
            },
            {
              id: "refundCount",
              label: "Refunds",
              align: "right",
              value: (row) => row.refundCount,
              render: (row) => row.refundCount.toLocaleString("en-US"),
            },
            {
              id: "refunded",
              label: "Refunded",
              align: "right",
              value: (row) => row.refunded.chart,
              render: (row) => row.refunded.display,
            },
            {
              id: "net",
              label: "Net",
              align: "right",
              value: (row) => row.net.chart,
              render: (row) => row.net.display,
            },
          ]}
          getRowId={(row) => row.id}
          initialSortId="collected"
          hiddenColumnIds={moneyColumns ? undefined : ["collected", "refunded", "net"]}
          emptyMessage="No verified payments in this period."
          failedLabel="The method breakdown could not be loaded."
        />

        <ReportCountBreakdown
          title="Payments by type"
          description="Verified incoming payments only."
          figure={data.byKind}
          nameLabel="Payment type"
          unit="payments"
          emptyMessage="No verified payments in this period."
        />
      </section>

      {/* =====================================================
          RECONCILIATION WORKSHEET
      ===================================================== */}

      <section className="flex flex-col gap-4">
        <h2 className="text-h4">Reconciliation worksheet</h2>

        <Note>{RECONCILIATION_NOTE}</Note>

        <ReportBreakdownTable<DailyTotalRow>
          title="Day by day"
          description="Verified payments grouped by the date they were taken, newest first."
          rows={data.byDay.value}
          columns={[
            { id: "date", label: "Date", value: (row) => row.date },
            {
              id: "count",
              label: "Payments",
              align: "right",
              value: (row) => row.count,
              render: (row) => row.count.toLocaleString("en-US"),
            },
            {
              id: "collected",
              label: "In",
              align: "right",
              value: (row) => row.collected.chart,
              render: (row) => row.collected.display,
            },
            {
              id: "refunded",
              label: "Out",
              align: "right",
              value: (row) => row.refunded.chart,
              render: (row) => row.refunded.display,
            },
            {
              id: "net",
              label: "Net",
              align: "right",
              value: (row) => row.net.chart,
              render: (row) => row.net.display,
            },
          ]}
          getRowId={(row) => row.id}
          initialSortId="date"
          hiddenColumnIds={moneyColumns ? undefined : ["collected", "refunded", "net"]}
          emptyMessage="No verified payments in this period."
          failedLabel="The daily worksheet could not be loaded."
        />

        <ReportBreakdownTable<RefundRow>
          title="Refunds"
          description="Every outgoing payment in the period, so the refund total has a list behind it."
          rows={data.refunds.value}
          columns={[
            { id: "paidOn", label: "Date", value: (row) => row.paidOn },
            {
              id: "deal",
              label: "Deal",
              value: (row) => row.dealNumber ?? "",
              render: (row) => row.dealNumber ?? "—",
            },
            {
              id: "customer",
              label: "Customer",
              value: (row) => row.customerName ?? "",
              render: (row) => row.customerName ?? "—",
            },
            { id: "method", label: "Method", value: (row) => row.method },
            {
              id: "amount",
              label: "Amount",
              align: "right",
              value: (row) => row.amount.chart,
              render: (row) => row.amount.display,
            },
            { id: "status", label: "Status", value: (row) => row.status },
            {
              id: "reason",
              label: "Reason",
              value: (row) => row.reason ?? "",
              render: (row) => row.reason ?? "—",
            },
          ]}
          getRowId={(row) => row.id}
          initialSortId="paidOn"
          hiddenColumnIds={moneyColumns ? undefined : ["amount"]}
          emptyMessage="No refunds in this period."
          failedLabel="The refund list could not be loaded."
        />
      </section>

      {/* =====================================================
          NOT YET MONEY
      ===================================================== */}

      <section className="flex flex-col gap-4">
        <h2 className="text-h4">Awaiting verification</h2>

        <Note tone="warning">{AWAITING_NOTE}</Note>

        {renderCards("awaiting")}

        <ReportBreakdownTable<AgedPaymentRow>
          title="Oldest first"
          description="Incoming payments recorded but not yet confirmed by a second person."
          rows={data.aged.value}
          columns={[
            {
              id: "daysWaiting",
              label: "Days waiting",
              align: "right",
              value: (row) => row.daysWaiting,
              render: (row) => row.daysWaiting.toLocaleString("en-US"),
            },
            { id: "paidOn", label: "Taken on", value: (row) => row.paidOn },
            {
              id: "deal",
              label: "Deal",
              value: (row) => row.dealNumber ?? "",
              render: (row) => row.dealNumber ?? "—",
            },
            {
              id: "customer",
              label: "Customer",
              value: (row) => row.customerName ?? "",
              render: (row) => row.customerName ?? "—",
            },
            { id: "method", label: "Method", value: (row) => row.method },
            {
              id: "amount",
              label: "Claimed",
              align: "right",
              value: (row) => row.amount.chart,
              render: (row) => row.amount.display,
            },
            { id: "recordedBy", label: "Recorded by", value: (row) => row.recordedByName },
          ]}
          getRowId={(row) => row.id}
          initialSortId="daysWaiting"
          hiddenColumnIds={moneyColumns ? undefined : ["amount"]}
          emptyMessage="Nothing is waiting to be verified."
          failedLabel="The verification queue could not be loaded."
        />
      </section>

      {/* =====================================================
          DID NOT STICK
      ===================================================== */}

      <section className="flex flex-col gap-4">
        <h2 className="text-h4">Rejected and reversed</h2>

        {renderCards("failed")}

        <Note>
          Rejected and reversed payments are already excluded from collected and from net.
          They are counted here so a period with unusual activity looks different from a
          quiet one rather than simply smaller.
        </Note>
      </section>
    </div>
  );
}
