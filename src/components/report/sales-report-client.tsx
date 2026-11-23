"use client";

import {
  BarChart3,
  FileSpreadsheet,
  FileText,
  Handshake,
  Percent,
  Table2,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ReportBreakdownTable } from "@/src/components/report/report-breakdown-table";
import { ReportDealTable } from "@/src/components/report/report-deal-table";
import { ReportSummaryView } from "@/src/components/report/report-summary-view";
import { SalesStatusBadge } from "@/src/components/sales/sales-status-badge";
import { MetricCard } from "@/src/components/shared/metric-card";
import { Button } from "@/src/components/ui/button";

import { useMotion } from "@/src/hooks/use-motion";
import {
  REPORT_RANGES,
  type MonthlyPoint,
  type OwnerPerformanceRow,
  type ReportDealsResult,
  type ReportRange,
  type ReportView,
  type SalesReportData,
  type ShowroomPerformanceRow,
  type StatusBreakdownRow,
} from "@/src/lib/types/sales-reports";
import { cn } from "@/src/lib/utils/cn";
import { downloadExportFile } from "@/src/lib/utils/download-export-file";

interface SalesReportClientProps {
  data: SalesReportData;
  /** Deal rows for the table view. */
  deals: ReportDealsResult;
  view: ReportView;
  canExport: boolean;
  /**
   * False hides every money figure on this report.
   *
   * Gated on reports.financial, separately from sales.view. Somebody who may
   * read the sales pipeline does not automatically get to see what the
   * business took — a report aggregates in a way a paginated list does not,
   * and row-level security decides which rows, not whether their total
   * belongs on a card.
   */
  canSeeFinancial: boolean;
}

const VIEWS: { id: ReportView; label: string; Icon: typeof BarChart3 }[] = [
  { id: "summary", label: "Summary", Icon: BarChart3 },
  { id: "table", label: "Table", Icon: Table2 },
];

type ExportFormat = "excel" | "pdf";

function SectionFailed({ what }: { what: string }) {
  return (
    <p
      role="alert"
      className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
    >
      The {what} couldn&apos;t be loaded. Refresh the page to try again.
    </p>
  );
}

/**
 * Sales reporting.
 *
 * Every figure comes from the same views the Sales pages read, so a number
 * here always matches the screen it links to. Two attribution rules are worth
 * knowing, and the page says them out loud rather than leaving them implied:
 * money is attributed to the month a deal **completed**, and counts of work
 * started are attributed to the month a deal was **created**.
 */
export function SalesReportClient({ data, deals, view, canExport , canSeeFinancial }: SalesReportClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { fadeUp } = useMotion();

  const [isSwitching, startSwitching] = useTransition();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const changeRange = (range: ReportRange) => {
    if (range === data.range) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);

    startSwitching(() => router.replace(`${pathname}?${params.toString()}`));
  };

  /*
   * The view lives in the URL, so a table view can be linked, bookmarked and
   * shared, and the browser's back button behaves the way people expect.
   */
  const changeView = (next: ReportView) => {
    if (next === view) return;

    const params = new URLSearchParams(searchParams.toString());
    if (next === "summary") params.delete("view");
    else params.set("view", next);

    startSwitching(() => router.replace(`${pathname}?${params.toString()}`));
  };

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);

    try {
      const result = await downloadExportFile(`/admin/sales/export?format=${format}&range=${data.range}`);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.truncated && result.count !== null && result.total !== null
          ? `Exported the first ${result.count} of ${result.total} deals.`
          : `Exported as ${format === "excel" ? "Excel" : "PDF"}.`,
      );
    } finally {
      setExporting(null);
    }
  };

  /*
   * Money columns are dropped rather than blanked, and the proportion tint
   * goes with them: a tint derived from deal value would still show who sold
   * the most even with the figures hidden.
   */
  const hiddenColumnIds = canSeeFinancial ? undefined : ["value"];

  const kpis = data.kpis;
  const currency = kpis?.currency ?? "AED";
  const rangeLabel = REPORT_RANGES.find((option) => option.id === data.range)?.label ?? "This month";

  return (
    <div className="flex flex-col gap-6">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-h2">Sales reports</h1>
          <p className="text-body-sm text-text-muted mt-1 max-w-2xl">
            Money is counted in the month a deal completed. Deals created and win rate are counted in the
            month a deal started. Figures follow your own access, so a colleague may see different totals.
          </p>
        </div>

        {canExport && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void handleExport("excel")}
              isLoading={exporting === "excel"}
              disabled={exporting !== null}
              leftIcon={<FileSpreadsheet className="size-4" />}
            >
              Excel
            </Button>

            <Button
              variant="outline"
              onClick={() => void handleExport("pdf")}
              isLoading={exporting === "pdf"}
              disabled={exporting !== null}
              leftIcon={<FileText className="size-4" />}
            >
              PDF
            </Button>
          </div>
        )}
      </div>

      {/* =====================================================
          RANGE
      ===================================================== */}

      <div
        role="group"
        aria-label="Report period"
        className="border-border bg-card flex w-fit max-w-full flex-wrap gap-1 rounded-lg border p-1"
      >
        {REPORT_RANGES.map((option) => {
          const isSelected = data.range === option.id;

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => changeRange(option.id)}
              disabled={isSwitching}
              className={cn(
                "text-body-sm focus-visible:ring-primary relative min-h-9 rounded-md px-3.5 font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60",
                isSelected ? "text-[#0b1220]" : "text-text-muted hover:text-text-primary",
              )}
            >
              {isSelected && (
                <motion.span
                  layoutId="report-range-pill"
                  className="bg-primary absolute inset-0 rounded-md"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative z-10">{option.label}</span>
            </button>
          );
        })}
      </div>

      {/* =====================================================
          COMPLETENESS
      ===================================================== */}

      {/*
        What this report does NOT cover.

        Sprint 6 capped every aggregate at 5,000 rows and asked for no count,
        so a period holding more reported a partial total with nothing on the
        page to say so. The figures now carry their own completeness and this
        is where it is said — in the same words whether a query failed or a
        cap bit, because in both cases the number on screen is not the whole
        answer.

        role="status" rather than "alert": it is information about the figures
        below, not an interruption.
      */}
      {kpis?.notice && (
        <div
          role="status"
          className="border-warning/40 bg-warning/10 flex items-start gap-2.5 rounded-lg border px-4 py-3"
        >
          <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="text-body-sm text-text-primary">{kpis.notice}</p>
        </div>
      )}

      {/* =====================================================
          KPIs
      ===================================================== */}

      {kpis === null ? (
        <SectionFailed what="report" />
      ) : (
        <section
          aria-label="Sales performance"
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5"
        >
          <MetricCard
            label="Deals created"
            value={kpis.created}
            caption={`Started in ${rangeLabel.toLowerCase()}`}
            icon={<Handshake />}
          />
          <MetricCard
            label="Completed"
            value={kpis.completed}
            caption={`Closed in ${rangeLabel.toLowerCase()}`}
            icon={<TrendingUp />}
          />
          <MetricCard
            label="Still open"
            value={kpis.open}
            caption="Open right now, any start date"
            icon={<Wallet />}
          />
          <MetricCard
            label="Cancelled"
            value={kpis.cancelled}
            caption={`Of those started in ${rangeLabel.toLowerCase()}`}
            icon={<TriangleAlert />}
          />
          {/*
            The cohort rate, not completed-over-created.

            The old card divided deals completed in the window by deals
            created in it — two different sets of deals — so it read over
            100% whenever a deal closed in a month it had not started in.
            This asks one question of one population: of the deals started in
            this period, how many have closed?
          */}
          <MetricCard
            label="Closed so far"
            value={kpis.cohortWinRate ?? 0}
            suffix={kpis.cohortWinRate === null ? undefined : "%"}
            caption={
              kpis.cohortWinRate === null
                ? "No deals started in this period"
                : `${kpis.cohortCompleted} of ${kpis.created} started in ${rangeLabel.toLowerCase()}`
            }
            icon={<Percent />}
          />
        </section>
      )}

      {/* =====================================================
          MONEY SUMMARY
      ===================================================== */}

      {kpis && canSeeFinancial && (
        <motion.section
          {...fadeUp(1)}
          aria-label="Money"
          className="surface-card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5"
        >
          <div className="min-w-0">
            <p className="text-label">Completed deal value</p>
            <p className="text-text-primary mt-1 truncate text-[20px] font-semibold tabular-nums">
              {kpis.completedValue?.display ?? "Unavailable"}
            </p>
            <p className="text-caption text-text-subtle mt-0.5">
              Total due on deals completed in {rangeLabel.toLowerCase()}
            </p>
          </div>

          {/*
            Collected and net are two figures now, not one.

            This used to be a single number netting refunds against receipts
            and labelled "Verified collected", so a month that took AED 2m
            and refunded AED 2m reported zero collected. That is true of the
            net and false of the collection, and they are separate metrics by
            definition.
          */}
          <div className="min-w-0">
            <p className="text-label">Verified collected</p>
            <p className="text-text-primary mt-1 truncate text-[20px] font-semibold tabular-nums">
              {kpis.collected?.display ?? "Unavailable"}
            </p>
            <p className="text-caption text-text-subtle mt-0.5">
              {kpis.collected === null
                ? "This figure could not be loaded."
                : "Verified payments in. Refunds are not deducted here. Unverified money is excluded."}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-label">Refunds paid</p>
            <p className="text-text-primary mt-1 truncate text-[20px] font-semibold tabular-nums">
              {kpis.refunded?.display ?? "Unavailable"}
            </p>
            <p className="text-caption text-text-subtle mt-0.5">
              {kpis.refunded === null
                ? "This figure could not be loaded."
                : "Verified refunds out, by payment date"}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-label">Net cash movement</p>
            <p className="text-text-primary mt-1 truncate text-[20px] font-semibold tabular-nums">
              {kpis.netCash?.display ?? "Unavailable"}
            </p>
            <p className="text-caption text-text-subtle mt-0.5">
              {kpis.netCash === null
                ? "This figure could not be loaded."
                : "Collected less refunds. Not the same as revenue."}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-label">Outstanding</p>
            <p className="text-text-primary mt-1 truncate text-[20px] font-semibold tabular-nums">
              {kpis.outstanding?.display ?? "Unavailable"}
            </p>
            <p className="text-caption text-text-subtle mt-0.5">
              Still to collect on confirmed deals, whenever they started
            </p>
          </div>
        </motion.section>
      )}

      {/* =====================================================
          VIEW SWITCH

          The summary answers "how are we doing". The table answers
          "which deals", which is the question a bar chart cannot be
          asked. Both read exactly the same figures.
      ===================================================== */}

      <div
        role="group"
        aria-label="Report view"
        className="border-border bg-card flex w-fit gap-1 rounded-lg border p-1"
      >
        {VIEWS.map((option) => {
          const isSelected = view === option.id;

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => changeView(option.id)}
              disabled={isSwitching}
              className={cn(
                "text-body-sm focus-visible:ring-primary relative inline-flex min-h-9 items-center rounded-md px-3.5 font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60",
                isSelected ? "text-[#0b1220]" : "text-text-muted hover:text-text-primary",
              )}
            >
              {isSelected && (
                <motion.span
                  layoutId="report-view-pill"
                  className="bg-primary absolute inset-0 rounded-md"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <option.Icon className="size-4" aria-hidden="true" />
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      {view === "table" ? (
        <>
          <ReportDealTable deals={deals} currency={currency} rangeLabel={rangeLabel} />

          {/* The same four breakdowns, with sortable numeric columns
              and a link through to Sales filtered to that slice. */}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ReportBreakdownTable<StatusBreakdownRow>
              title="Deals created, by status"
              description={`Every deal created in ${rangeLabel.toLowerCase()}.`}
              rows={data.byStatus}
              getRowId={(row) => row.status}
              initialSortId="count"
              shareValue={(row) => row.count}
              getRowHref={(row) => `/admin/sales?status=${encodeURIComponent(row.status)}`}
              emptyMessage="No deals were created in this period."
              failedLabel="status breakdown"
              hiddenColumnIds={hiddenColumnIds}
              columns={[
                {
                  id: "status",
                  label: "Status",
                  value: (row) => row.status,
                  render: (row) => <SalesStatusBadge status={row.status} size="sm" />,
                },
                { id: "count", label: "Deals", align: "right", value: (row) => row.count },
                {
                  id: "value",
                  label: "Total due",
                  align: "right",
                  value: (row) => row.value.chart,
                  render: (row) => row.value.display,
                },
              ]}
            />

            <ReportBreakdownTable<ShowroomPerformanceRow>
              title="Completed, by showroom"
              description={`Deals completed in ${rangeLabel.toLowerCase()}.`}
              rows={data.byShowroom}
              getRowId={(row) => row.locationId}
              initialSortId="value"
              shareValue={canSeeFinancial ? (row) => row.value.chart : undefined}
              getRowHref={(row) => `/admin/sales?showroom=${row.locationId}`}
              emptyMessage="No deal was completed in this period."
              failedLabel="showroom breakdown"
              hiddenColumnIds={hiddenColumnIds}
              columns={[
                { id: "locationName", label: "Showroom", value: (row) => row.locationName },
                { id: "completed", label: "Completed", align: "right", value: (row) => row.completed },
                {
                  id: "value",
                  label: "Value",
                  align: "right",
                  value: (row) => row.value.chart,
                  render: (row) => row.value.display,
                },
              ]}
            />
          </div>

          <ReportBreakdownTable<OwnerPerformanceRow>
            title="Sales executives"
            description="Completed in this period, and what each still holds open."
            rows={data.byOwner}
            getRowId={(row) => row.ownerId}
            initialSortId="value"
            shareValue={canSeeFinancial ? (row) => row.value.chart : undefined}
            getRowHref={(row) => `/admin/sales?owner=${row.ownerId}`}
            emptyMessage="No deal is owned by anyone in this period yet."
            failedLabel="executive breakdown"
            hiddenColumnIds={hiddenColumnIds}
            columns={[
              { id: "ownerName", label: "Executive", value: (row) => row.ownerName },
              { id: "completed", label: "Completed", align: "right", value: (row) => row.completed },
              { id: "open", label: "Open", align: "right", value: (row) => row.open },
              {
                id: "value",
                label: "Value",
                align: "right",
                value: (row) => row.value.chart,
                render: (row) => row.value.display,
              },
            ]}
          />

          <ReportBreakdownTable<MonthlyPoint>
            title="Completions by month"
            description="Counted in the month each deal completed."
            rows={data.monthly}
            getRowId={(row) => row.month}
            initialSortId="month"
            shareValue={canSeeFinancial ? (row) => row.value.chart : undefined}
            emptyMessage="No deal was completed in this period."
            failedLabel="monthly breakdown"
            hiddenColumnIds={hiddenColumnIds}
            columns={[
              { id: "month", label: "Month", value: (row) => row.month },
              { id: "completed", label: "Completed", align: "right", value: (row) => row.completed },
              {
                id: "value",
                label: "Value",
                align: "right",
                value: (row) => row.value.chart,
                render: (row) => row.value.display,
              },
            ]}
          />
        </>
      ) : (
        <ReportSummaryView data={data} currency={currency} />
      )}
    </div>
  );
}
