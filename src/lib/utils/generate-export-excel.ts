import ExcelJS from "exceljs";
import { readFileSync } from "fs";
import { join } from "path";

import {
  provenanceLine,
  type ExportMeta,
  type RenderedTable,
} from "@/src/lib/utils/export-tables";
import { formatCellTime } from "@/src/lib/utils/export-columns";

/*
|--------------------------------------------------------------------------
| THE REPORT WORKBOOK
|--------------------------------------------------------------------------
|
| One sheet per table. Same house style as the offers, enquiry, lead and
| sales workbooks so the files sit together in a folder: logo top left,
| title and provenance above a frozen navy header row, autofilter on the
| header because the first thing anybody does with a file like this is
| narrow it.
|
| The title block is repeated on every sheet rather than put once on a cover
| sheet. Sheets get copied out of workbooks and mailed on their own, and a
| sheet of figures with no period on it is the one that gets quoted wrong.
*/

const LOGO_PATH = join(process.cwd(), "public", "logo.png");

const NAVY = "FF111F42";
const GREY = "FF6B7280";
const RED = "FFB91C1C";

/* The row the column headers live on, and therefore the freeze point. */
const HEADER_ROW = 4;

/*
|--------------------------------------------------------------------------
| SHEET NAMES
|--------------------------------------------------------------------------
|
| Excel will not open a workbook whose sheet names break its rules, and the
| failure is silent until the moment somebody double-clicks the file. There
| are four rules and all four are reachable from report section names:
|
|   - 31 characters at most ("Vehicles by status and location")
|   - none of : \ / ? * [ ] ("Sales by salesperson 01/11-30/11")
|   - not empty, and no leading or trailing apostrophe
|   - unique within the workbook, ignoring case
|
| The last one is the one that bites: two breakdowns legitimately called
| "By status" in different sections become one sheet name after truncation.
| So names are numbered when they collide rather than silently dropped.
*/
export function safeSheetName(raw: string, taken: Set<string>): string {
  const cleaned = raw
    .replace(/[:\\/?*[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .trim();

  const base = (cleaned.length > 0 ? cleaned : "Sheet").slice(0, 31).trim();

  if (!taken.has(base.toLowerCase())) {
    taken.add(base.toLowerCase());
    return base;
  }

  /*
   * Suffix with " (2)", " (3)" … and trim the stem so the whole thing still
   * fits in 31. Bounded by the number of sheets, so it always terminates.
   */
  for (let n = 2; n < 100; n += 1) {
    const suffix = ` (${n})`;
    const candidate = `${base.slice(0, 31 - suffix.length).trim()}${suffix}`;

    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }

  const fallback = `Sheet ${taken.size + 1}`;
  taken.add(fallback.toLowerCase());
  return fallback;
}

export async function generateExportExcel(
  tables: RenderedTable[],
  meta: ExportMeta,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Optimus Megatron Cars";
  workbook.created = new Date();

  const generatedAt = formatCellTime(new Date().toISOString());
  const provenance = provenanceLine(meta, generatedAt);

  let logoId: number | null = null;

  try {
    const logoBase64 = readFileSync(LOGO_PATH).toString("base64");

    logoId = workbook.addImage({
      base64: `data:image/png;base64,${logoBase64}`,
      extension: "png",
    });
  } catch (error: unknown) {
    /* The export still works without it. */
    console.warn("Report export logo could not be loaded:", error);
  }

  const taken = new Set<string>();

  /*
   * A workbook with no sheets cannot be written by Excel's format, so an
   * export that produced nothing still gets one sheet saying so. A staff
   * member who downloads a file and cannot open it has no way to tell an
   * empty result from a broken feature.
   */
  const toWrite: RenderedTable[] =
    tables.length > 0
      ? tables
      : [
          {
            name: "No data",
            note: "No rows matched this report's filters for the selected period.",
            columns: [{ label: "Result", width: 60, align: "left" }],
            rows: [],
            truncated: false,
            total: 0,
          },
        ];

  for (const table of toWrite) {
    const sheet = workbook.addWorksheet(safeSheetName(table.name, taken), {
      views: [{ state: "frozen", ySplit: HEADER_ROW }],
    });

    const lastColumn = String.fromCharCode(
      65 + Math.min(Math.max(table.columns.length, 3), 10),
    );

    if (logoId !== null) {
      sheet.addImage(logoId, {
        tl: { col: 0, row: 0 },
        ext: { width: 48, height: 48 },
      });
    }

    sheet.mergeCells(`B1:${lastColumn}1`);
    sheet.getCell("B1").value =
      `Optimus Megatron Cars — ${meta.title} — ${table.name}`;
    sheet.getCell("B1").font = { bold: true, size: 13, color: { argb: NAVY } };

    sheet.mergeCells(`B2:${lastColumn}2`);
    sheet.getCell("B2").value = provenance;
    sheet.getCell("B2").font = { size: 9, color: { argb: GREY } };

    /*
     * Row 3 carries the caveats: what this particular table counts, and
     * whether it is all of it. Truncation is stated per sheet because a
     * workbook can be complete in five tables and capped in the sixth, and
     * a warning on the cover would be read as applying to everything.
     */
    sheet.mergeCells(`B3:${lastColumn}3`);

    const rowCount = `${table.rows.length.toLocaleString("en-US")} ${table.rows.length === 1 ? "row" : "rows"}`;

    if (table.truncated) {
      sheet.getCell("B3").value =
        `INCOMPLETE — showing ${rowCount} of ${(table.total ?? table.rows.length).toLocaleString("en-US")} matching. The row cap was reached. Narrow the filters and export again for the full set.` +
        (table.note ? ` · ${table.note}` : "");
      sheet.getCell("B3").font = { size: 9, bold: true, color: { argb: RED } };
    } else {
      sheet.getCell("B3").value = table.note
        ? `${rowCount} · ${table.note}`
        : rowCount;
      sheet.getCell("B3").font = { size: 9, color: { argb: GREY } };
    }

    /*
     * Widths and keys only — deliberately no `header`.
     *
     * Giving ExcelJS a header here does not just describe the column, it
     * writes that text into row 1, straight over the merged title cell. The
     * merge means the last write wins, so the title ends up reading as the
     * name of the final column. The header row is written explicitly below,
     * where it belongs.
     */
    const spacer: Partial<ExcelJS.Column> = { key: "_spacer", width: 2 };

    sheet.columns = [
      spacer,
      ...table.columns.map((column, index) => ({
        key: `c${index}`,
        width: column.width,
      })),
    ];

    const headerRow = sheet.getRow(HEADER_ROW);

    headerRow.values = ["", ...table.columns.map((column) => column.label)];
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    headerRow.alignment = { vertical: "middle", wrapText: true };
    headerRow.height = 22;

    for (const cells of table.rows) {
      const record: Record<string, string> = { _spacer: "" };

      cells.forEach((cell, index) => {
        record[`c${index}`] = cell;
      });

      sheet.addRow(record);
    }

    /*
     * Money and counts right-aligned, so a column of figures reads as one.
     * The values stay text: they are exact decimal strings converted from
     * bigint fils, and letting Excel parse them to its own float is how a
     * reconciled total comes out a hundredth short.
     */
    table.columns.forEach((column, index) => {
      if (column.align !== "right") return;

      sheet.getColumn(index + 2).alignment = { horizontal: "right" };
    });

    if (table.rows.length > 0) {
      sheet.autoFilter = {
        from: { row: HEADER_ROW, column: 2 },
        to: { row: HEADER_ROW + table.rows.length, column: table.columns.length + 1 },
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return Buffer.from(buffer);
}
