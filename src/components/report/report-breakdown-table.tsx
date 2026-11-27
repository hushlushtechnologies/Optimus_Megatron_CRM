"use client";

import { ArrowDown, ArrowUp, ArrowUpRight, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { cn } from "@/src/lib/utils/cn";

/*
|--------------------------------------------------------------------------
| BREAKDOWN TABLE
|--------------------------------------------------------------------------
|
| The four report breakdowns — status, showroom, executive, month — as real
| sortable tables rather than bar strips.
|
| A bar shows which is biggest. A table shows by how much, lets a column be
| sorted, and gives a figure that can be read out loud or checked against a
| screen. The share bar stays, as a background tint behind the label, so the
| proportion is still visible without costing a column.
*/

export interface BreakdownColumn<TRow> {
  id: string;
  label: string;
  align?: "left" | "right";
  /** The value sorted on. Strings sort alphabetically, numbers numerically. */
  value: (row: TRow) => string | number;
  /** What is rendered. Defaults to the sort value. */
  render?: (row: TRow) => ReactNode;
}

interface ReportBreakdownTableProps<TRow> {
  title: string;
  description?: string;
  rows: TRow[] | null;
  columns: BreakdownColumn<TRow>[];
  getRowId: (row: TRow) => string;
  /** Column sorted on first load. */
  initialSortId: string;
  /** Drives the proportion tint. Omit for no tint. */
  shareValue?: (row: TRow) => number;
  /** Where a row leads, when it leads somewhere. */
  getRowHref?: (row: TRow) => string | null;
  emptyMessage: string;
  /** What couldn't be loaded, for the error line. */
  failedLabel: string;
  /**
   * Column ids to leave out.
   *
   * Sprint 9 uses this for money: a person without reports.financial sees
   * the same breakdown with its value column absent, rather than a second
   * near-identical table defined for them. Dropping the column here rather
   * than at each of the four call sites means a new breakdown cannot
   * accidentally leak a money column by forgetting the check.
   */
  hiddenColumnIds?: readonly string[];
}

type Direction = "asc" | "desc";

export function ReportBreakdownTable<TRow>({
  title,
  description,
  rows,
  columns: allColumns,
  getRowId,
  initialSortId,
  shareValue,
  getRowHref,
  emptyMessage,
  failedLabel,
  hiddenColumnIds,
}: ReportBreakdownTableProps<TRow>) {
  /*
   * Hidden columns are removed before anything else reads the list, so a
   * hidden column cannot be sorted on, measured for the tint, or rendered.
   * Filtering at render time only would leave it sortable by URL.
   */
  const columns = useMemo(
    () =>
      hiddenColumnIds?.length
        ? allColumns.filter((column) => !hiddenColumnIds.includes(column.id))
        : allColumns,
    [allColumns, hiddenColumnIds],
  );

  const [sortId, setSortId] = useState(initialSortId);
  const [direction, setDirection] = useState<Direction>("desc");

  const sorted = useMemo(() => {
    if (!rows) return [];

    /* If the initial sort column was hidden, fall back to the first visible
       one rather than sorting on nothing. */
    const column = columns.find((candidate) => candidate.id === sortId) ?? columns[0];
    if (!column) return rows;

    const factor = direction === "asc" ? 1 : -1;

    return [...rows].sort((a, b) => {
      const left = column.value(a);
      const right = column.value(b);

      if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
      return String(left).localeCompare(String(right)) * factor;
    });
  }, [rows, columns, sortId, direction]);

  // The largest value sets the full-width tint; 1 guards against divide-by-zero.
  const peak = useMemo(() => {
    if (!rows || !shareValue) return 1;
    return Math.max(...rows.map((row) => Math.abs(shareValue(row))), 1);
  }, [rows, shareValue]);

  const toggleSort = (id: string) => {
    if (id === sortId) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortId(id);
    // A new column starts descending: for a report, "biggest first" is the useful default.
    setDirection("desc");
  };

  return (
    <section aria-label={title} className="surface-card flex flex-col gap-3 p-5">
      <div className="min-w-0">
        <p className="text-label">{title}</p>
        {description && <p className="text-caption text-text-subtle mt-1">{description}</p>}
      </div>

      {rows === null ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          The {failedLabel} couldn&apos;t be loaded. Refresh the page to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-body-sm text-text-muted">{emptyMessage}</p>
      ) : (
        /*
         * A wide table scrolls sideways inside its card.
         *
         * `scrollbar-hidden` is this project's convention — eighteen other
         * scroll containers use it, the shared data table included — and
         * leaving it off here is what put a visible horizontal scrollbar
         * under every breakdown table on every report.
         *
         * Hiding the bar removes the only mouse affordance for scrolling,
         * so the container is made focusable with a label, the way the
         * test-drive calendar already does it. Without that a keyboard user
         * has no route to the off-screen columns at all.
         */
        <div
          role="region"
          aria-label={`${title} — scrolls sideways`}
          tabIndex={0}
          className="scrollbar-hidden focus-visible:ring-primary min-w-0 overflow-x-auto overscroll-x-contain rounded-lg focus-visible:ring-2 focus-visible:outline-none"
        >
          <table className="w-full border-collapse">
            <caption className="sr-only">
              {title}. Sorted by {columns.find((column) => column.id === sortId)?.label ?? ""},{" "}
              {direction === "asc" ? "ascending" : "descending"}.
            </caption>

            <thead>
              <tr className="border-border border-b">
                {columns.map((column) => {
                  const isSorted = column.id === sortId;
                  const alignRight = column.align === "right";

                  return (
                    <th
                      key={column.id}
                      scope="col"
                      aria-sort={isSorted ? (direction === "asc" ? "ascending" : "descending") : "none"}
                      className={cn("py-2", alignRight ? "text-right" : "text-left")}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className={cn(
                          "text-label focus-visible:ring-primary inline-flex min-h-8 items-center gap-1 rounded transition-colors focus-visible:ring-2 focus-visible:outline-none",
                          isSorted ? "text-text-primary" : "hover:text-text-primary",
                          alignRight && "flex-row-reverse",
                        )}
                      >
                        {column.label}

                        {isSorted ? (
                          direction === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="size-3" aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" aria-hidden="true" />
                        )}

                        <span className="sr-only">
                          {isSorted
                            ? `, sorted ${direction === "asc" ? "ascending" : "descending"}. Activate to reverse.`
                            : ". Activate to sort by this column."}
                        </span>
                      </button>
                    </th>
                  );
                })}

                {getRowHref && <th scope="col" className="w-10 py-2" />}
              </tr>
            </thead>

            <tbody>
              {sorted.map((row) => {
                const href = getRowHref?.(row) ?? null;
                const share = shareValue ? Math.round((Math.abs(shareValue(row)) / peak) * 100) : 0;

                return (
                  <tr key={getRowId(row)} className="border-border group relative border-b last:border-0">
                    {columns.map((column, index) => (
                      <td
                        key={column.id}
                        className={cn(
                          "text-body-sm relative py-2.5",
                          column.align === "right"
                            ? "text-text-primary text-right tabular-nums"
                            : "text-text-primary",
                          index === 0 && "pr-3",
                        )}
                      >
                        {/* Proportion tint, behind the first cell only. */}
                        {index === 0 && shareValue && (
                          <span
                            aria-hidden="true"
                            className="bg-primary/8 pointer-events-none absolute inset-y-1 left-0 rounded-sm"
                            style={{ width: `${share}%` }}
                          />
                        )}

                        <span className="relative">{column.render?.(row) ?? column.value(row)}</span>
                      </td>
                    ))}

                    {getRowHref && (
                      <td className="py-2.5 text-right">
                        {href && (
                          <Link
                            href={href}
                            className="text-text-subtle hover:text-primary-text focus-visible:ring-primary inline-flex rounded p-1 focus-visible:ring-2 focus-visible:outline-none"
                          >
                            <ArrowUpRight className="size-3.5" aria-hidden="true" />
                            <span className="sr-only">Open in Sales</span>
                          </Link>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
