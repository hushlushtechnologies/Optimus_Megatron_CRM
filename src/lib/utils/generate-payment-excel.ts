import ExcelJS from "exceljs";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import type { PaymentQueueRow } from "@/src/lib/types/sales-payments";
import { formatDate, formatDateTime } from "@/src/lib/utils/format-date";

/*
 * ExcelJS can only embed raster images, so the logo has to be a PNG. It is
 * checked for rather than assumed, which is why the export still works on a
 * fresh checkout — just without the mark.
 */
const LOGO_PATH = join(process.cwd(), "public", "logo.png");

const COLUMNS = [
  { header: "Date paid", key: "paid_on", width: 13 },
  { header: "Direction", key: "direction", width: 11 },
  { header: "What for", key: "kind", width: 19 },
  { header: "Method", key: "method", width: 16 },
  { header: "Amount", key: "amount", width: 15 },
  { header: "Status", key: "status", width: 12 },
  { header: "Reference", key: "reference", width: 20 },
  { header: "Deal", key: "deal_number", width: 15 },
  { header: "Reservation", key: "reservation_number", width: 15 },
  { header: "Customer", key: "customer_name", width: 24 },
  { header: "Customer ID", key: "customer_number", width: 14 },
  { header: "Vehicle", key: "vehicle_title", width: 30 },
  { header: "Stock ID", key: "stock_id", width: 13 },
  { header: "Recorded by", key: "recorded_by_name", width: 20 },
  { header: "Recorded at", key: "recorded_at", width: 18 },
  { header: "Verified by", key: "verified_by_name", width: 20 },
  { header: "Verified at", key: "verified_at", width: 18 },
  { header: "Reversed by", key: "reversed_by_name", width: 20 },
  { header: "Reversed at", key: "reversed_at", width: 18 },
  { header: "Reason", key: "status_reason", width: 30 },
  { header: "Note", key: "notes", width: 30 },
] as const;

export interface PaymentExportMeta {
  /** What the person was looking at, such as "Awaiting verification · 2 filters". */
  scopeLabel: string;
  total: number;
  truncated: boolean;
  currency: string;
}

/**
 * A refund leaves the business, so it is written as a negative number.
 *
 * That way the Amount column totals to the net movement of money and can be
 * summed, sorted and pivoted in Excel without anyone having to know which
 * rows were refunds.
 */
function signedAmount(row: PaymentQueueRow): number {
  return row.direction === "out" ? -row.amount : row.amount;
}

/* =========================================================
   GENERATOR
========================================================= */

export async function generatePaymentExcel(
  rows: PaymentQueueRow[],
  meta: PaymentExportMeta,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Optimus Megatron Cars";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Payments", { views: [{ state: "frozen", ySplit: 4 }] });

  try {
    if (existsSync(LOGO_PATH)) {
      const logoBase64 = readFileSync(LOGO_PATH).toString("base64");
      const logoId = workbook.addImage({ base64: `data:image/png;base64,${logoBase64}`, extension: "png" });
      sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 48, height: 48 } });
    }
  } catch (error: unknown) {
    // The export still works without the logo.
    console.warn("Payment export logo could not be loaded:", error);
  }

  /* ---- Title block ---- */

  sheet.mergeCells(1, 2, 1, COLUMNS.length);
  const title = sheet.getCell(1, 2);
  title.value = "Optimus Megatron Cars — Payments";
  title.font = { size: 14, bold: true, color: { argb: "FF111F42" } };

  sheet.mergeCells(2, 2, 2, COLUMNS.length);
  const subtitle = sheet.getCell(2, 2);
  subtitle.value = `${meta.scopeLabel} · ${rows.length} of ${meta.total} payments${
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

  const amountColumn = COLUMNS.findIndex((column) => column.key === "amount") + 1;

  rows.forEach((row) => {
    const values = COLUMNS.map((column) => {
      switch (column.key) {
        case "amount":
          return signedAmount(row);

        case "direction":
          return row.direction === "out" ? "Refund out" : "Money in";

        case "paid_on":
          return formatDate(row.paid_on);

        case "recorded_at":
          return formatDateTime(row.recorded_at);

        case "verified_at":
          return row.verified_at ? formatDateTime(row.verified_at) : "";

        case "reversed_at":
          return row.reversed_at ? formatDateTime(row.reversed_at) : "";

        default:
          return row[column.key as keyof PaymentQueueRow] ?? "";
      }
    });

    const added = sheet.addRow(values);
    const amountCell = added.getCell(amountColumn);
    amountCell.numFmt = `"${meta.currency}" #,##0.00;[Red]-"${meta.currency}" #,##0.00`;
    amountCell.alignment = { horizontal: "right" };
  });

  /* ---- Totals ---- */

  if (rows.length > 0) {
    const moneyIn = rows
      .filter((row) => row.direction === "in")
      .reduce((total, row) => total + row.amount, 0);

    const refunds = rows
      .filter((row) => row.direction === "out")
      .reduce((total, row) => total + row.amount, 0);

    sheet.addRow([]);

    const totalsRow = sheet.addRow([]);
    totalsRow.getCell(1).value = "Net";
    totalsRow.getCell(1).font = { bold: true };

    const net = totalsRow.getCell(amountColumn);
    net.value = moneyIn - refunds;
    net.numFmt = `"${meta.currency}" #,##0.00;[Red]-"${meta.currency}" #,##0.00`;
    net.font = { bold: true };
    net.alignment = { horizontal: "right" };

    const breakdown = sheet.addRow([]);
    breakdown.getCell(1).value = `Money in ${moneyIn.toFixed(2)} · refunds out ${refunds.toFixed(2)}`;
    breakdown.getCell(1).font = { size: 9, color: { argb: "FF5F6F86" } };
  }

  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLUMNS.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
