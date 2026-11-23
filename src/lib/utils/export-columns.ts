/*
|--------------------------------------------------------------------------
| EXPORT COLUMNS, SHARED BY EVERY EXPORT IN THE APPLICATION
|--------------------------------------------------------------------------
|
| Lifted out of offer-export-columns.ts in Sprint 9, unchanged.
|
| The Sprint 8 offers export already had the shape Phase 10 asks for: one
| object per column holding its heading, its width, how to present it and how
| to read it off a row. The reports need the same thing, and the wrong way to
| get it is a second copy that drifts.
|
| So the generic half lives here and offer-export-columns.ts re-exports it.
| Nothing about the offers export changed.
|
| `kind` tells a generator how to present a value, not what it is:
|
|   text     as written
|   date     the day, in Dubai
|   time     the day and the minute, in Dubai
|   money    right-aligned, passed through EXACTLY — see formatCellMoney for
|            why parsing it would drop the cents
|   number   right-aligned, thousands separated
*/

export type ColumnKind = "text" | "date" | "time" | "money" | "number";

export interface ExportColumn<TRow> {
  header: string;
  width: number;
  kind: ColumnKind;
  value: (row: TRow) => string | number | null;
}

/*
|--------------------------------------------------------------------------
| FORMATTING
|--------------------------------------------------------------------------
|
| Dubai is UTC+04:00 all year with no daylight saving, so a timestamp can be
| rendered in local time without a zone database — but the zone is named
| explicitly anyway, because the server's own clock is UTC and a file that
| says 02:00 for a redemption taken at 06:00 is a file somebody will
| reconcile wrongly.
*/

const DUBAI = "Asia/Dubai";

export function formatCellDate(iso: string | null): string {
  if (!iso) return "—";

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: DUBAI,
  }).format(parsed);
}

export function formatCellTime(iso: string | null): string {
  if (!iso) return "—";

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: DUBAI,
  }).format(parsed);
}

/**
 * A money value for a cell.
 *
 * Arrives as an exact decimal string from the fils in the database and is
 * handed on unchanged. Deliberately not parsed to a number on the way
 * through: AED 1,234,567.89 is beyond the range where a float still
 * represents every hundredth exactly, and this column gets summed.
 */
export function formatCellMoney(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";

  return String(value);
}

export function formatCellNumber(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString("en-US") : String(value);
}

/** One cell, as text, for whichever generator is asking. */
export function formatCell(kind: ColumnKind, value: string | number | null): string {
  switch (kind) {
    case "date":
      return formatCellDate(value === null ? null : String(value));
    case "time":
      return formatCellTime(value === null ? null : String(value));
    case "money":
      return formatCellMoney(value);
    case "number":
      return formatCellNumber(value);
    default:
      return value === null || value === undefined || value === "" ? "—" : String(value);
  }
}
