"use client";

import {
  Banknote,
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
import { formatMoney } from "@/src/lib/utils/sales-format";

interface SalesReportClientProps {
  data: SalesReportData;
  /** Deal rows for the table view. */
  deals: ReportDealsResult;
  view: ReportView;
  canExport: boolean;
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
export function SalesReportClient({ data, deals, view, canExport }: SalesReportClientProps) {
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
          KPIs
      ===================================================== */}

      {kpis === null ? (
        <SectionFailed what="report" />
      ) : (
        <section
          aria-label="Sales performance"
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6"
        >
          <MetricCard label="Deals created" value={kpis.created} icon={<Handshake />} />
          <MetricCard label="Completed" value={kpis.completed} icon={<TrendingUp />} />
          <MetricCard label="Still open" value={kpis.open} icon={<Wallet />} />
          <MetricCard
            label="Win rate"
            value={kpis.winRate ?? 0}
            suffix={kpis.winRate === null ? undefined : "%"}
            icon={<Percent />}
          />
          <MetricCard label="Cancelled" value={kpis.cancelled} icon={<TriangleAlert />} />
          <MetricCard label="Collected" value={Math.round(kpis.collected)} icon={<Banknote />} />
        </section>
      )}

      {/* =====================================================
          MONEY SUMMARY
      ===================================================== */}

      {kpis && (
        <motion.section
          {...fadeUp(1)}
          aria-label="Money"
          className="surface-card grid grid-cols-1 gap-4 p-5 sm:grid-cols-3"
        >
          <div className="min-w-0">
            <p className="text-label">Completed deal value</p>
            <p className="text-text-primary mt-1 truncate text-[20px] font-semibold tabular-nums">
              {formatMoney(kpis.completedValue, currency)}
            </p>
            <p className="text-caption text-text-subtle mt-0.5">
              Total due on deals completed in {rangeLabel.toLowerCase()}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-label">Verified collected</p>
            <p className="text-text-primary mt-1 truncate text-[20px] font-semibold tabular-nums">
              {formatMoney(kpis.collected, currency)}
            </p>
            <p className="text-caption text-text-subtle mt-0.5">
              Payments in, less refunds out. Unverified money is excluded.
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-label">Outstanding</p>
            <p className="text-text-primary mt-1 truncate text-[20px] font-semibold tabular-nums">
              {formatMoney(kpis.outstanding, currency)}
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
                  value: (row) => row.value,
                  render: (row) => formatMoney(row.value, currency),
                },
              ]}
            />

            <ReportBreakdownTable<ShowroomPerformanceRow>
              title="Completed, by showroom"
              description={`Deals completed in ${rangeLabel.toLowerCase()}.`}
              rows={data.byShowroom}
              getRowId={(row) => row.locationId}
              initialSortId="value"
              shareValue={(row) => row.value}
              getRowHref={(row) => `/admin/sales?showroom=${row.locationId}`}
              emptyMessage="No deal was completed in this period."
              failedLabel="showroom breakdown"
              columns={[
                { id: "locationName", label: "Showroom", value: (row) => row.locationName },
                { id: "completed", label: "Completed", align: "right", value: (row) => row.completed },
                {
                  id: "value",
                  label: "Value",
                  align: "right",
                  value: (row) => row.value,
                  render: (row) => formatMoney(row.value, currency),
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
            shareValue={(row) => row.value}
            getRowHref={(row) => `/admin/sales?owner=${row.ownerId}`}
            emptyMessage="No deal is owned by anyone in this period yet."
            failedLabel="executive breakdown"
            columns={[
              { id: "ownerName", label: "Executive", value: (row) => row.ownerName },
              { id: "completed", label: "Completed", align: "right", value: (row) => row.completed },
              { id: "open", label: "Open", align: "right", value: (row) => row.open },
              {
                id: "value",
                label: "Value",
                align: "right",
                value: (row) => row.value,
                render: (row) => formatMoney(row.value, currency),
              },
            ]}
          />

          <ReportBreakdownTable<MonthlyPoint>
            title="Completions by month"
            description="Counted in the month each deal completed."
            rows={data.monthly}
            getRowId={(row) => row.month}
            initialSortId="month"
            shareValue={(row) => row.value}
            emptyMessage="No deal was completed in this period."
            failedLabel="monthly breakdown"
            columns={[
              { id: "month", label: "Month", value: (row) => row.month },
              { id: "completed", label: "Completed", align: "right", value: (row) => row.completed },
              {
                id: "value",
                label: "Value",
                align: "right",
                value: (row) => row.value,
                render: (row) => formatMoney(row.value, currency),
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
