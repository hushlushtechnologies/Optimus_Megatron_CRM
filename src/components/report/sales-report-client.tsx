"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Banknote,
  FileSpreadsheet,
  FileText,
  Handshake,
  Percent,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { MetricCard } from "@/src/components/shared/metric-card";
import { Button } from "@/src/components/ui/button";
import { SalesStatusBadge } from "@/src/components/sales/sales-status-badge";

import { useMotion } from "@/src/hooks/use-motion";
import { cn } from "@/src/lib/utils/cn";
import { formatMoney } from "@/src/lib/utils/sales-format";
import { downloadExportFile } from "@/src/lib/utils/download-export-file";
import { REPORT_RANGES, type ReportRange, type SalesReportData } from "@/src/lib/types/sales-reports";

interface SalesReportClientProps {
  data: SalesReportData;
  canExport: boolean;
}

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
export function SalesReportClient({ data, canExport }: SalesReportClientProps) {
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

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);

    try {
      const result = await downloadExportFile(
        `/admin/sales/export?format=${format}&range=${data.range}`,
      );

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
          BREAKDOWNS
      ===================================================== */}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* By status */}
        <motion.section {...fadeUp(2)} aria-label="By status" className="surface-card flex flex-col gap-3 p-5">
          <p className="text-label">Deals created, by status</p>

          {data.byStatus === null ? (
            <SectionFailed what="status breakdown" />
          ) : data.byStatus.length === 0 ? (
            <p className="text-body-sm text-text-muted">No deals were created in this period.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.byStatus.map((row) => (
                <li
                  key={row.status}
                  className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
                >
                  <SalesStatusBadge status={row.status} size="sm" />
                  <span className="text-body-sm text-text-primary tabular-nums">
                    {row.count} · {formatMoney(row.value, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </motion.section>

        {/* By showroom */}
        <motion.section
          {...fadeUp(3)}
          aria-label="By showroom"
          className="surface-card flex flex-col gap-3 p-5"
        >
          <p className="text-label">Completed, by showroom</p>

          {data.byShowroom === null ? (
            <SectionFailed what="showroom breakdown" />
          ) : data.byShowroom.length === 0 ? (
            <p className="text-body-sm text-text-muted">No deal was completed in this period.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.byShowroom.map((row) => (
                <li
                  key={row.locationId}
                  className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
                >
                  <span className="text-body-sm text-text-primary truncate">{row.locationName}</span>
                  <span className="text-body-sm text-text-muted tabular-nums">
                    {row.completed} · {formatMoney(row.value, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      </div>

      {/* =====================================================
          SALES EXECUTIVES
      ===================================================== */}

      <motion.section
        {...fadeUp(4)}
        aria-label="Sales executives"
        className="surface-card flex flex-col gap-3 p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-label">Sales executives</p>
          <Link
            href="/admin/sales"
            className="text-caption text-primary-text hover:text-primary-hover focus-visible:ring-primary inline-flex items-center gap-1 rounded focus-visible:ring-2 focus-visible:outline-none"
          >
            Open Sales
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        {data.byOwner === null ? (
          <SectionFailed what="executive breakdown" />
        ) : data.byOwner.length === 0 ? (
          <p className="text-body-sm text-text-muted">
            No deal is owned by anyone in this period yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-md border-collapse">
              <caption className="sr-only">
                Deals completed and still open for each sales executive
              </caption>
              <thead>
                <tr className="border-border border-b">
                  <th scope="col" className="text-label py-2 text-left">
                    Executive
                  </th>
                  <th scope="col" className="text-label py-2 text-right">
                    Completed
                  </th>
                  <th scope="col" className="text-label py-2 text-right">
                    Open
                  </th>
                  <th scope="col" className="text-label py-2 text-right">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.byOwner.map((row) => (
                  <tr key={row.ownerId} className="border-border border-b last:border-0">
                    <td className="text-body-sm text-text-primary py-2.5 pr-3">{row.ownerName}</td>
                    <td className="text-body-sm text-text-primary py-2.5 text-right tabular-nums">
                      {row.completed}
                    </td>
                    <td className="text-body-sm text-text-muted py-2.5 text-right tabular-nums">
                      {row.open}
                    </td>
                    <td className="text-body-sm text-text-primary py-2.5 text-right tabular-nums">
                      {formatMoney(row.value, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>

      {/* =====================================================
          MONTHLY
      ===================================================== */}

      <motion.section {...fadeUp(5)} aria-label="By month" className="surface-card flex flex-col gap-3 p-5">
        <p className="text-label">Completions by month</p>

        {data.monthly === null ? (
          <SectionFailed what="monthly breakdown" />
        ) : data.monthly.length === 0 ? (
          <p className="text-body-sm text-text-muted">No deal was completed in this period.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {data.monthly.map((point) => {
              const peak = Math.max(...(data.monthly ?? []).map((item) => item.value), 1);
              const width = Math.max(2, Math.round((point.value / peak) * 100));

              return (
                <li key={point.month} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body-sm text-text-primary">{point.month}</span>
                    <span className="text-caption text-text-muted tabular-nums">
                      {point.completed} {point.completed === 1 ? "deal" : "deals"} ·{" "}
                      {formatMoney(point.value, currency)}
                    </span>
                  </div>

                  <div
                    role="presentation"
                    className="bg-card-hover h-1.5 w-full overflow-hidden rounded-full"
                  >
                    <div className="bg-gradient-primary h-full rounded-full" style={{ width: `${width}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </motion.section>
    </div>
  );
}