import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { formatDate, formatDateTime } from "@/src/lib/utils/format-date";
import type { SalesExportRow } from "@/src/lib/types/sales-reports";

/*
 * ExcelJS and jsPDF can only embed raster images, so the logo has to be a PNG.
 * public/logo.png is checked for and skipped when absent, which is why the
 * export still works on a fresh checkout — just without the mark.
 */
const LOGO_PATH = join(process.cwd(), "public", "logo.png");

function loadLogoBase64(): string | null {
  try {
    if (!existsSync(LOGO_PATH)) return null;
    return `data:image/png;base64,${readFileSync(LOGO_PATH).toString("base64")}`;
  } catch {
    return null;
  }
}

export interface SalesPdfMeta {
  rangeLabel: string;
  total: number;
  truncated: boolean;
  currency: string;
}

function money(value: number | null, currency: string): string {
  if (value === null) return "—";
  return `${currency} ${value.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * The deal register as a landscape PDF.
 *
 * Columns are chosen to fit one page width without wrapping money: deal,
 * customer, vehicle, owner, status and the four figures that matter. The full
 * column set lives in the Excel export.
 */
export function generateSalesPdf(rows: SalesExportRow[], meta: SalesPdfMeta): Buffer {
  const doc = new jsPDF({ orientation: "landscape" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = loadLogoBase64();

  /* ---- Header ---- */

  doc.setFillColor(17, 31, 66);
  doc.rect(0, 0, pageWidth, 24, "F");

  if (logo) {
    try {
      doc.addImage(logo, "PNG", 10, 5, 14, 14);
    } catch {
      // A missing or unreadable logo must never stop the export.
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text("Optimus Megatron Cars — Sales Report", logo ? 28 : 10, 12);

  doc.setFontSize(8);
  doc.setTextColor(200, 210, 225);
  doc.text(
    `${meta.rangeLabel} · ${rows.length} of ${meta.total} deals${
      meta.truncated ? " (capped)" : ""
    } · generated ${formatDateTime(new Date().toISOString())}`,
    logo ? 28 : 10,
    18,
  );

  /* ---- Totals strip ---- */

  const totalDue = rows.reduce((sum, row) => sum + (row.total_due ?? 0), 0);
  const paid = rows.reduce((sum, row) => sum + (row.verified_paid ?? 0), 0);
  const balance = rows.reduce((sum, row) => sum + (row.balance_due ?? 0), 0);

  doc.setTextColor(17, 31, 66);
  doc.setFontSize(9);
  doc.text(
    `Total due ${money(totalDue, meta.currency)}    Paid ${money(paid, meta.currency)}    Balance ${money(
      balance,
      meta.currency,
    )}`,
    10,
    32,
  );

  /* ---- Table ---- */

  autoTable(doc, {
    startY: 37,
    head: [
      [
        "Deal",
        "Status",
        "Customer",
        "Vehicle",
        "Showroom",
        "Sales executive",
        "Agreed",
        "Total due",
        "Paid",
        "Balance",
        "Created",
      ],
    ],
    body: rows.map((row) => [
      row.deal_number,
      row.status,
      row.customer_name,
      `${row.vehicle_title} (${row.stock_id})`,
      row.location_name ?? "—",
      row.owner_name?.trim() || "—",
      money(row.agreed_price, row.currency),
      money(row.total_due, row.currency),
      money(row.verified_paid, row.currency),
      money(row.balance_due, row.currency),
      formatDate(row.created_at),
    ]),
    styles: { fontSize: 7, cellPadding: 1.8, overflow: "linebreak" },
    headStyles: { fillColor: [17, 31, 66], textColor: 255, fontSize: 7.5 },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    columnStyles: {
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
      9: { halign: "right" },
    },
    margin: { left: 8, right: 8 },
  });

  /* ---- Footer: page numbers ---- */

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120, 130, 150);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 10, doc.internal.pageSize.getHeight() - 6, {
      align: "right",
    });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
