"use client";

import type { SortingState, VisibilityState } from "@tanstack/react-table";
import { Table2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import {
  REPORT_DEAL_COLUMN_OPTIONS,
  REPORT_DEAL_DEFAULT_HIDDEN,
  getReportDealColumns,
} from "@/src/components/report/report-deal-columns";
import { DataTable } from "@/src/components/shared/data-table/data-table";
import { TableCustomizer } from "@/src/components/shared/data-table/table-customizer";
import { EmptyState } from "@/src/components/shared/empty-state";
import type { ReportDealsResult } from "@/src/lib/types/sales-reports";
import { formatMoney } from "@/src/lib/utils/sales-format";

interface ReportDealTableProps {
  deals: ReportDealsResult;
  currency: string;
  rangeLabel: string;
}

/**
 * The deal-level view of a report.
 *
 * The summary view answers "how are we doing"; this answers "which deals",
 * which is the question you cannot ask of a bar chart. Rows are held in
 * memory so sorting any column is instant, and the footer totals the rows
 * actually shown — so the table always agrees with itself even after sorting
 * or hiding columns.
 */
export function ReportDealTable({ deals, currency, rangeLabel }: ReportDealTableProps) {
  const columns = useMemo(() => getReportDealColumns(), []);

  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(REPORT_DEAL_DEFAULT_HIDDEN);

  /*
   * Totals are summed from the rows on screen, not from the report's own
   * figures. If the two ever disagree it is because the table is capped, and
   * the notice below says so rather than letting the numbers quietly differ.
   */
  const totals = useMemo(() => {
    const sum = (pick: (row: ReportDealsResult["rows"][number]) => number | null) =>
      deals.rows.reduce((total, row) => total + (pick(row) ?? 0), 0);

    return {
      totalDue: sum((row) => row.total_due),
      paid: sum((row) => row.verified_paid),
      balance: sum((row) => row.balance_due),
    };
  }, [deals.rows]);

  if (deals.failed) {
    return (
      <p
        role="alert"
        className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
      >
        The deal table couldn&apos;t be loaded. Refresh the page to try again.
      </p>
    );
  }

  return (
    <section aria-label="Deals" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label">Deals</p>
          <p className="text-caption text-text-subtle mt-1">
            {deals.rows.length === deals.total
              ? `All ${deals.total} ${deals.total === 1 ? "deal" : "deals"} created in ${rangeLabel.toLowerCase()}`
              : `${deals.rows.length} of ${deals.total} deals created in ${rangeLabel.toLowerCase()}`}
            . Click any column heading to sort.
          </p>
        </div>

        <TableCustomizer
          columns={REPORT_DEAL_COLUMN_OPTIONS}
          visibility={columnVisibility as Record<string, boolean>}
          // The customizer reports one column at a time, so merge rather than replace.
          onVisibilityChange={(columnId, visible) =>
            setColumnVisibility((current) => ({ ...current, [columnId]: visible }))
          }
          onReset={() => setColumnVisibility(REPORT_DEAL_DEFAULT_HIDDEN)}
        />
      </div>

      {/*
        Being honest about the cap matters: without this, a total that is
        short of the summary's figure looks like a bug rather than a limit.
      */}
      {deals.truncated && (
        <p
          role="status"
          className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span>
            This period holds {deals.total} deals and the table shows the most recent {deals.rows.length}. The
            totals below cover the rows shown, so they will be lower than the summary. Use Excel or PDF above
            for the full set.
          </span>
        </p>
      )}

      <DataTable
        columns={columns}
        data={deals.rows}
        getRowId={(row) => row.id}
        sorting={sorting}
        onSortingChange={setSorting}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        ariaLabel={`Deals created in ${rangeLabel.toLowerCase()}`}
        emptyState={
          <EmptyState
            icon="SearchX"
            title="No deals in this period"
            description="Choose a wider period above, or create a deal from a lead or test drive."
          />
        }
      />

      {deals.rows.length > 0 && (
        <dl className="surface-card grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-label flex items-center gap-1.5">
              <Table2 className="size-3.5" aria-hidden="true" />
              Total due ({deals.rows.length} rows)
            </dt>
            <dd className="text-text-primary mt-1 truncate text-[17px] font-semibold tabular-nums">
              {formatMoney(totals.totalDue, currency)}
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="text-label">Paid</dt>
            <dd className="text-text-primary mt-1 truncate text-[17px] font-semibold tabular-nums">
              {formatMoney(totals.paid, currency)}
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="text-label">Balance</dt>
            <dd className="text-text-primary mt-1 truncate text-[17px] font-semibold tabular-nums">
              {formatMoney(totals.balance, currency)}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
