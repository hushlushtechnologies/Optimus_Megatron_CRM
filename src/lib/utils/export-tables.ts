import { formatCell, type ExportColumn } from "@/src/lib/utils/export-columns";

/*
|--------------------------------------------------------------------------
| A REPORT EXPORT IS SEVERAL TABLES, NOT ONE
|--------------------------------------------------------------------------
|
| The Sprint 8 offers export produced one table per file, which suited it:
| campaigns, or redemptions, or the ledger. A report is not like that. The
| inventory report is a status summary plus three breakdowns plus an ageing
| table, and a file holding only one of those is not an export of the report.
|
| So an export carries a list of tables. Excel gets one sheet each; the PDF
| gets one section each.
|
| WHY THE ROWS ARE PRE-FORMATTED
|
| Each table has its own row type, and TypeScript has no comfortable way to
| hold a list of tables with different row types — the version that compiles
| ends up so full of `unknown` and casts that the column definitions stop
| being checked, which defeats the point of having them.
|
| So the formatting happens in toRenderedTable, where the row type is still
| known and the columns are still type-checked against it. What reaches a
| generator is strings. The generators get simpler too: neither of them
| needs to know what a money column is.
*/

export interface RenderedColumn {
  label: string;
  width: number;
  align: "left" | "right";
}

export interface RenderedTable {
  /** Sheet name in Excel, section heading in the PDF. */
  name: string;
  /** One line under the heading. Used for date basis and caveats. */
  note?: string;
  columns: RenderedColumn[];
  rows: string[][];
  /** True when the underlying query was capped. */
  truncated: boolean;
  /** How many rows matched, when known. */
  total: number | null;
}

/**
 * Turn typed rows and columns into a table a generator can render.
 *
 * This is where the column definitions are checked against the row type —
 * the last point at which that is possible, and the reason the formatting
 * happens here rather than in the generators.
 */
export function toRenderedTable<TRow>(
  name: string,
  columns: ExportColumn<TRow>[],
  rows: TRow[],
  options: { note?: string; truncated?: boolean; total?: number | null } = {},
): RenderedTable {
  return {
    name,
    note: options.note,
    columns: columns.map((column) => ({
      label: column.header,
      width: column.width,
      align: column.kind === "money" || column.kind === "number" ? "right" : "left",
    })),
    rows: rows.map((row) => columns.map((column) => formatCell(column.kind, column.value(row)))),
    truncated: options.truncated ?? false,
    total: options.total ?? null,
  };
}

/**
 * A table of label/value pairs, for the figures on a report.
 *
 * A report's cards are not rows of anything — they are nine separate
 * numbers — so they export as a two-column summary with the definition
 * alongside. Without the definitions a spreadsheet of "Completed: 14" is
 * exactly the kind of figure that gets quoted out of context, with no way
 * to tell what date put the 14 there.
 */
export function figuresTable(
  name: string,
  figures: { label: string; value: string; definition: string; basis: string }[],
): RenderedTable {
  return {
    name,
    columns: [
      { label: "Figure", width: 28, align: "left" },
      { label: "Value", width: 20, align: "right" },
      { label: "Counted by", width: 16, align: "left" },
      { label: "What it means", width: 70, align: "left" },
    ],
    rows: figures.map((figure) => [figure.label, figure.value, figure.basis, figure.definition]),
    truncated: false,
    total: figures.length,
  };
}

/*
|--------------------------------------------------------------------------
| WHAT A FILE SAYS ABOUT ITSELF
|--------------------------------------------------------------------------
*/

export interface ExportMeta {
  /** "Sales report", "Inventory report". */
  title: string;
  /** The period, in words: "November 2026". */
  period: string;
  /** Filters in force, already in words. Empty when none. */
  filters: string[];
  currency: string;
  /** Set for any file holding customer names or contact details. */
  sensitive?: boolean;
  /** Set when any table in the file was capped. */
  truncated?: boolean;
}

/**
 * The provenance line that appears under the title in every export.
 *
 * Four things, because all four change how the file should be read: when it
 * was taken, what period it covers, what was filtered out, and whether it is
 * the whole of that.
 *
 * The plan asks for title, applied filters, reporting period, currency and a
 * generated timestamp on every export. This is where that happens, once, so
 * a new report cannot ship without them.
 */
export function provenanceLine(meta: ExportMeta, generatedAt: string): string {
  const parts = [
    `Generated ${generatedAt} (Dubai)`,
    `Period: ${meta.period}`,
    `Currency: ${meta.currency}`,
  ];

  parts.push(meta.filters.length > 0 ? `Filters: ${meta.filters.join("; ")}` : "Filters: none");

  if (meta.sensitive) parts.push("Contains customer details — internal use only");

  return parts.join(" · ");
}
