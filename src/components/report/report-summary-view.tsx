"use client";

import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

import { SalesStatusBadge } from "@/src/components/sales/sales-status-badge";
import { useMotion } from "@/src/hooks/use-motion";
import type { SalesReportData } from "@/src/lib/types/sales-reports";
import { formatMoney } from "@/src/lib/utils/sales-format";

interface ReportSummaryViewProps {
  data: SalesReportData;
  currency: string;
}

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
 * The at-a-glance view of a report: proportions rather than figures.
 *
 * Good for "how are we doing", deliberately not for "which deals" — that is
 * what the table view is for. Lives in its own file because the report client
 * was becoming too long to read in one screen.
 */
export function ReportSummaryView({ data, currency }: ReportSummaryViewProps) {
  const { fadeUp } = useMotion();

  return (
    <>
      {/* =====================================================
          BREAKDOWNS
      ===================================================== */}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* By status */}
        <motion.section
          {...fadeUp(2)}
          aria-label="By status"
          className="surface-card flex flex-col gap-3 p-5"
        >
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
          <p className="text-body-sm text-text-muted">No deal is owned by anyone in this period yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-md border-collapse">
              <caption className="sr-only">Deals completed and still open for each sales executive</caption>
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
    </>
  );
}
