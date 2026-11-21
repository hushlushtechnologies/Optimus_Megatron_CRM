import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { readFileSync } from "fs";
import { join } from "path";

import { formatCell, type ExportColumn } from "@/src/lib/utils/offer-export-columns";
import type { OfferExportMeta } from "@/src/lib/utils/generate-offer-excel";

/*
|--------------------------------------------------------------------------
| THE OFFERS AND LOYALTY PDF
|--------------------------------------------------------------------------
|
| Landscape, because the useful version of this document is one somebody
| takes into a morning meeting — a portrait page would fit four columns and
| wrap the rest.
|
| Same house style as the lead, enquiry and sales PDFs. One generator for
| all four datasets, driven by the column list, for the same reason the
| workbook is.
*/

const LOGO_PATH = join(process.cwd(), "public", "logo.png");

const NAVY: [number, number, number] = [17, 31, 66];
const GREY: [number, number, number] = [107, 114, 128];
const RED: [number, number, number] = [185, 28, 28];

function loadLogoBase64(): string | null {
  try {
    const buffer = readFileSync(LOGO_PATH);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export function generateOfferPdf<TRow>(
  rows: TRow[],
  columns: ExportColumn<TRow>[],
  meta: OfferExportMeta,
): Buffer {
  const doc = new jsPDF({ orientation: "landscape" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = loadLogoBase64();

  /* ---- header ---- */
  if (logo) {
    try {
      doc.addImage(logo, "PNG", 14, 10, 16, 16);
    } catch {
      /* The document still works without it. */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...NAVY);
  doc.text(`Optimus Megatron Cars — ${meta.title}`, logo ? 34 : 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GREY);

  const countText = `${rows.length.toLocaleString("en-US")} ${rows.length === 1 ? "row" : "rows"}`;

  doc.text(
    `Generated ${formatCell("time", new Date().toISOString())} (Dubai) · ${meta.scopeLabel} · ${countText}` +
      (meta.sensitive ? " · contains customer details, internal use only" : ""),
    logo ? 34 : 14,
    24,
  );

  /*
   * An incomplete file says so on the page, in red, above the table.
   * A silently short document of financial data is worse than no document,
   * because it looks complete — and a PDF gets printed and passed around
   * long after the screen that produced it is gone.
   */
  let tableTop = 32;

  if (meta.truncated) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...RED);
    doc.text(
      `INCOMPLETE — showing ${countText} of ${meta.total.toLocaleString("en-US")} matching. Narrow the filter and export again for the full set.`,
      logo ? 34 : 14,
      30,
    );
    tableTop = 38;
  }

  /* ---- table ---- */
  autoTable(doc, {
    startY: tableTop,
    head: [columns.map((column) => column.header)],
    body: rows.map((row) => columns.map((column) => formatCell(column.kind, column.value(row)))),
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 2,
      overflow: "linebreak",
textColor: [31, 41, 55],
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [247, 248, 250] },
    columnStyles: Object.fromEntries(
      columns.map((column, index) => [
        index,
        {
          halign: column.kind === "money" || column.kind === "number" ? "right" : "left",
          cellWidth: "auto" as const,
        },
      ]),
    ),
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      const current = doc.getCurrentPageInfo().pageNumber;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GREY);
      doc.text(
        `Page ${current} of ${pageCount}`,
        pageWidth - 14,
        doc.internal.pageSize.getHeight() - 8,
        { align: "right" },
      );
    },
  });

  return Buffer.from(doc.output("arraybuffer"));
}
