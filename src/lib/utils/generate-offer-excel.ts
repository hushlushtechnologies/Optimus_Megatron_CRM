import ExcelJS from "exceljs";
import { readFileSync } from "fs";
import { join } from "path";

import {
  formatCell,
  type ExportColumn,
} from "@/src/lib/utils/offer-export-columns";

/*
|--------------------------------------------------------------------------
| THE OFFERS AND LOYALTY WORKBOOK
|--------------------------------------------------------------------------
|
| One generator for all four datasets, driven by the column list it is
| handed. The alternative was four near-identical functions, which is four
| places to fix a formatting bug and three places to forget.
|
| Same house style as the enquiry, lead and sales workbooks so the files sit
| together in a folder: logo top left, title and provenance above a frozen
| navy header row, autofilter on the header because the first thing anybody
| does with a file like this is narrow it.
*/

const LOGO_PATH = join(process.cwd(), "public", "logo.png");

const NAVY = "FF111F42";
const GREY = "FF6B7280";

export interface OfferExportMeta {
  /** "Campaigns", "Redemption History", … */
  title: string;
  /** What the file covers, in words — the filter or the scope. */
  scopeLabel: string;
  /** How many matched before any cap. */
  total: number;
  truncated: boolean;
  /** Set for any file holding customer names or contact details. */
  sensitive?: boolean;
}

export async function generateOfferExcel<TRow>(
  rows: TRow[],
  columns: ExportColumn<TRow>[],
  meta: OfferExportMeta,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Optimus Megatron Cars";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(meta.title.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  /* ---- logo ---- */
  try {
    const logoBase64 = readFileSync(LOGO_PATH).toString("base64");

    const logoId = workbook.addImage({
      base64: `data:image/png;base64,${logoBase64}`,
      extension: "png",
    });

    sheet.addImage(logoId, {
      tl: { col: 0, row: 0 },
      ext: { width: 48, height: 48 },
    });
  } catch (error: unknown) {
    /* The export still works without it. */
    console.warn("Offer export logo could not be loaded:", error);
  }

  /* ---- title ---- */
  sheet.mergeCells("B1:F1");
  sheet.getCell("B1").value = `Optimus Megatron Cars — ${meta.title}`;
  sheet.getCell("B1").font = { bold: true, size: 13, color: { argb: NAVY } };

  /*
   * The subtitle carries provenance, not decoration. Three things belong
   * here because all three change how the file should be read: when it was
   * taken, what it covers, and whether it is the whole of that.
   */
  sheet.mergeCells("B2:F2");

  const countText = `${rows.length.toLocaleString("en-US")} ${rows.length === 1 ? "row" : "rows"}`;

  const truncationText = meta.truncated
    ? ` · SHOWING ${countText} OF ${meta.total.toLocaleString("en-US")} — the row cap was reached, so this file is not complete`
    : ` · ${countText}`;

  sheet.getCell("B2").value =
    `Generated ${formatCell("time", new Date().toISOString())} (Dubai) · ${meta.scopeLabel}` +
    truncationText +
    (meta.sensitive ? " · contains customer details, internal use only" : "");

  sheet.getCell("B2").font = { size: 9, color: { argb: GREY } };

  /* ---- columns ---- */

  /*
   * Widths and keys only — deliberately no `header`.
   *
   * Giving ExcelJS a header here does not just describe the column, it
   * writes that text into row 1, straight over the merged title cell at B1.
   * The merge means the last write wins, so "Optimus Megatron Cars —
   * Campaigns" came out reading "Code", the name of the final column. The
   * header row is written explicitly below, where it belongs.
   */
  const spacer: Partial<ExcelJS.Column> = { key: "_spacer", width: 2 };

  sheet.columns = [
    spacer,
    ...columns.map((column, index) => ({
      key: `c${index}`,
      width: column.width,
    })),
  ];

  const headerRow = sheet.getRow(4);

  headerRow.values = ["", ...columns.map((column) => column.header)];
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 22;

  /* ---- data ---- */
  for (const row of rows) {
    const record: Record<string, string> = { _spacer: "" };

    columns.forEach((column, index) => {
      record[`c${index}`] = formatCell(column.kind, column.value(row));
    });

    sheet.addRow(record);
  }

  /*
   * Money and counts right-aligned, so a column of figures reads as one.
   * The values stay text: they are exact decimal strings converted from
   * bigint fils, and letting Excel parse them to its own float is how a
   * reconciled total comes out a hundredth short.
   */
  columns.forEach((column, index) => {
    if (column.kind !== "money" && column.kind !== "number") return;

    sheet.getColumn(index + 2).alignment = { horizontal: "right" };
  });

  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 4, column: 2 },
      to: { row: 4 + rows.length, column: columns.length + 1 },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return Buffer.from(buffer);
}
