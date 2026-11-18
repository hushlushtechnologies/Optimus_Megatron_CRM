import { existsSync, readFileSync } from "fs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { join } from "path";

import type { PaymentQueueRow } from "@/src/lib/types/sales-payments";
import { formatDate, formatDateTime } from "@/src/lib/utils/format-date";
import type { PaymentExportMeta } from "@/src/lib/utils/generate-payment-excel";

const LOGO_PATH = join(process.cwd(), "public", "logo.png");

function loadLogoBase64(): string | null {
  try {
    if (!existsSync(LOGO_PATH)) return null;
    return `data:image/png;base64,${readFileSync(LOGO_PATH).toString("base64")}`;
  } catch {
    return null;
  }
}

function money(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * The payments register as a landscape PDF.
 *
 * Columns are chosen to fit one page width without wrapping money: what was
 * paid, how, for which deal, by whom, and where it stands. The full column
 * set — notes, reasons, every timestamp — lives in the Excel export.
 */
export function generatePaymentPdf(rows: PaymentQueueRow[], meta: PaymentExportMeta): Buffer {
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
  doc.text("Optimus Megatron Cars — Payments", logo ? 28 : 10, 12);

  doc.setFontSize(8);
  doc.setTextColor(200, 210, 225);
  doc.text(
    `${meta.scopeLabel} · ${rows.length} of ${meta.total} payments${
      meta.truncated ? " (capped)" : ""
    } · generated ${formatDateTime(new Date().toISOString())}`,
    logo ? 28 : 10,
    18,
  );

  /* ---- Totals strip ---- */

  const moneyIn = rows.filter((row) => row.direction === "in").reduce((sum, row) => sum + row.amount, 0);
  const refunds = rows.filter((row) => row.direction === "out").reduce((sum, row) => sum + row.amount, 0);

  doc.setTextColor(17, 31, 66);
  doc.setFontSize(9);
  doc.text(
    `Money in ${money(moneyIn, meta.currency)}    Refunds out ${money(
      refunds,
      meta.currency,
    )}    Net ${money(moneyIn - refunds, meta.currency)}`,
    10,
    32,
  );

  /* ---- Table ---- */

  autoTable(doc, {
    startY: 37,
    head: [
      [
        "Paid",
        "What for",
        "Method",
        "Amount",
        "Status",
        "Deal / reservation",
        "Customer",
        "Vehicle",
        "Reference",
        "Recorded by",
        "Verified by",
      ],
    ],
    body: rows.map((row) => [
      formatDate(row.paid_on),
      row.kind,
      row.method,
      `${row.direction === "out" ? "−" : ""}${money(row.amount, row.currency)}`,
      row.status,
      row.deal_number ?? row.reservation_number ?? "—",
      row.customer_name ?? "—",
      row.vehicle_title ? `${row.vehicle_title}${row.stock_id ? ` (${row.stock_id})` : ""}` : "—",
      row.reference ?? "—",
      row.recorded_by_name?.trim() || "—",
      row.verified_by_name?.trim() || "—",
    ]),
    styles: { fontSize: 7, cellPadding: 1.8, overflow: "linebreak" },
    headStyles: { fillColor: [17, 31, 66], textColor: 255, fontSize: 7.5 },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    columnStyles: { 3: { halign: "right" } },
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
