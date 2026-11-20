import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { readFileSync } from "fs";
import { join } from "path";

import { formatDate, formatDateTime } from "@/src/lib/utils/format-date";

import type { EnquiryExportRow } from "@/src/lib/supabase/enquiry-export-queries";

// =========================================================
// CONFIG
// =========================================================

const LOGO_PATH = join(process.cwd(), "public", "logo.png");

// =========================================================
// LOGO HELPER
// =========================================================

function loadLogoBase64(): string | null {
  try {
    const buffer = readFileSync(LOGO_PATH);

    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

// =========================================================
// GENERATE ENQUIRY PDF
// =========================================================

/**
 * A printable enquiry list, in the same house style as the lead and sales
 * exports so the three sit together in a folder.
 *
 * Landscape and narrow columns, because the useful version of this document
 * is one somebody takes into a morning meeting — a portrait page would fit
 * four columns and wrap the rest.
 *
 * `title` names the scope, so a file does not have to be opened to find out
 * whether it is the whole list or one type.
 */
export function generateEnquiryPdf(rows: EnquiryExportRow[], title = "Enquiry Export"): Buffer {
  const doc = new jsPDF({
    orientation: "landscape",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = loadLogoBase64();

  // =======================================================
  // HEADER
  // =======================================================

  doc.setFillColor(17, 31, 66);
  doc.rect(0, 0, pageWidth, 24, "F");

  if (logo) {
    doc.addImage(logo, "PNG", 10, 4, 16, 16);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");

  doc.text("Optimus Megatron Cars", logo ? 30 : 14, 11);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  doc.text(title, logo ? 30 : 14, 17);

  doc.setFontSize(8);
  doc.setTextColor(200, 205, 215);

  doc.text(
    `Generated ${formatDateTime(new Date())} · ${rows.length} ${rows.length === 1 ? "enquiry" : "enquiries"}`,
    pageWidth - 14,
    17,
    {
      align: "right",
    },
  );

  // =======================================================
  // TABLE
  // =======================================================

  autoTable(doc, {
    startY: 30,

    head: [
      [
        "Ref",
        "Received",
        "Type",
        "Status",
        "Priority",
        "Customer",
        "Phone",
        "Email",
        "Vehicle",
        "With",
        "Next follow-up",
      ],
    ],

    body: rows.map((row) => [
      row.enquiryNumber,

      row.createdAt ? formatDate(new Date(row.createdAt)) : "—",

      row.type,

      row.status,

      row.priority,

      row.customerName,

      row.phone ?? "—",

      row.email ?? "—",

      row.vehicle ?? "—",

      row.assignedTo,

      row.nextFollowUpAt ? formatDate(new Date(row.nextFollowUpAt)) : "—",
    ]),

    styles: {
      fontSize: 7,
      cellPadding: 2,
      overflow: "linebreak",
    },

    headStyles: {
      fillColor: [17, 31, 66],
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: "bold",
    },

    alternateRowStyles: {
      fillColor: [247, 248, 250],
    },

    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 20 },
      2: { cellWidth: 22 },
      3: { cellWidth: 24 },
      4: { cellWidth: 16 },
      6: { cellWidth: 26 },
      8: { cellWidth: 38 },
      10: { cellWidth: 22 },
    },

    margin: { left: 10, right: 10 },
  });

  // =======================================================
  // FOOTER
  //
  // Says what the file holds, because a spreadsheet of the public's contact
  // details that gets forwarded should carry that reminder on every page.
  // =======================================================

  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);

    doc.setFontSize(7);
    doc.setTextColor(130, 136, 148);

    doc.text(
      "Contains customer contact details — internal use only.",
      10,
      doc.internal.pageSize.getHeight() - 6,
    );

    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 10, doc.internal.pageSize.getHeight() - 6, {
      align: "right",
    });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
