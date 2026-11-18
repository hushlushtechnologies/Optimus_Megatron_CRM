import ExcelJS from "exceljs";
import { readFileSync } from "fs";
import { join } from "path";

import { formatDate, formatDateTime } from "@/src/lib/utils/format-date";
import type { SalesExportRow } from "@/src/lib/types/sales-reports";

const LOGO_PATH = join(process.cwd(), "public", "logo.png");

const COLUMNS = [
  { header: "Deal", key: "deal_number", width: 16 },
  { header: "Status", key: "status", width: 14 },
  { header: "Customer", key: "customer_name", width: 24 },
  { header: "Customer ID", key: "customer_number", width: 16 },
  { header: "Vehicle", key: "vehicle_title", width: 30 },
  { header: "Stock ID", key: "stock_id", width: 14 },
  { header: "Brand", key: "brand_name", width: 16 },
  { header: "Showroom", key: "location_name", width: 18 },
  { header: "Sales executive", key: "owner_name", width: 20 },
  { header: "Lead", key: "lead_number", width: 16 },
  { header: "Reservation", key: "reservation_number", width: 16 },
  { header: "Listed", key: "listed_price", width: 14 },
  { header: "Proposed", key: "proposed_price", width: 14 },
  { header: "Discount", key: "discount_amount", width: 14 },
  { header: "Agreed", key: "agreed_price", width: 14 },
  { header: "Total due", key: "total_due", width: 14 },
  { header: "Paid", key: "verified_paid", width: 14 },
  { header: "Balance", key: "balance_due", width: 14 },
  { header: "Created", key: "created_at", width: 16 },
  { header: "Updated", key: "updated_at", width: 16 },
] as const;

const MONEY_KEYS = new Set([
  "listed_price",
  "proposed_price",
  "discount_amount",
  "agreed_price",
  "total_due",
  "verified_paid",
  "balance_due",
]);

export interface SalesExcelMeta {
  rangeLabel: string;
  total: number;
  truncated: boolean;
  currency: string;
}

/**
 * The deal register as a spreadsheet.
 *
 * Money is written as a real number with a currency format, not a string, so
 * whoever receives it can total and filter it in Excel. Totals are summed from
 * the same rows that appear below them, so the sheet is self-consistent.
 */
export async function generateSalesExcel(rows: SalesExportRow[], meta: SalesExcelMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Optimus Megatron Cars";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Sales", { views: [{ state: "frozen", ySplit: 4 }] });

  try {
    const logoBase64 = readFileSync(LOGO_PATH).toString("base64");
    const logoId = workbook.addImage({ base64: `data:image/png;base64,${logoBase64}`, extension: "png" });
    sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 48, height: 48 } });
  } catch (error: unknown) {
    // The export still works without the logo.
    console.warn("Sales export logo could not be loaded:", error);
  }

  /* ---- Title block ---- */

  sheet.mergeCells(1, 2, 1, COLUMNS.length);
  const title = sheet.getCell(1, 2);
  title.value = "Optimus Megatron Cars — Sales Report";
  title.font = { size: 14, bold: true, color: { argb: "FF111F42" } };

  sheet.mergeCells(2, 2, 2, COLUMNS.length);
  const subtitle = sheet.getCell(2, 2);
  subtitle.value = `${meta.rangeLabel} · ${rows.length} of ${meta.total} deals${
    meta.truncated ? " (capped)" : ""
  } · generated ${formatDateTime(new Date().toISOString())}`;
  subtitle.font = { size: 10, color: { argb: "FF5F6F86" } };

  sheet.getRow(3).height = 6;

  /* ---- Header row ---- */

  const headerRow = sheet.getRow(4);
  COLUMNS.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111F42" } };
    cell.alignment = { vertical: "middle" };
  });
  headerRow.height = 20;

  COLUMNS.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });

  /* ---- Data ---- */

  rows.forEach((row) => {
    const values = COLUMNS.map((column) => {
      const key = column.key;

      if (key === "created_at" || key === "updated_at") {
        return formatDate(row[key]);
      }

      const value = row[key as keyof SalesExportRow];
      return value ?? "";
    });

    const added = sheet.addRow(values);

    COLUMNS.forEach((column, index) => {
      if (MONEY_KEYS.has(column.key)) {
        added.getCell(index + 1).numFmt = `"${meta.currency}" #,##0.00`;
        added.getCell(index + 1).alignment = { horizontal: "right" };
      }
    });
  });

  /* ---- Totals ---- */

  if (rows.length > 0) {
    const sum = (key: keyof SalesExportRow) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);

    const totalsRow = sheet.addRow([]);
    totalsRow.getCell(1).value = "Total";
    totalsRow.getCell(1).font = { bold: true };

    const totals: Partial<Record<string, number>> = {
      total_due: sum("total_due"),
      verified_paid: sum("verified_paid"),
      balance_due: sum("balance_due"),
    };

    COLUMNS.forEach((column, index) => {
      const value = totals[column.key];
      if (value === undefined) return;

      const cell = totalsRow.getCell(index + 1);
      cell.value = value;
      cell.numFmt = `"${meta.currency}" #,##0.00`;
      cell.font = { bold: true };
      cell.alignment = { horizontal: "right" };
    });
  }

  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: COLUMNS.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
