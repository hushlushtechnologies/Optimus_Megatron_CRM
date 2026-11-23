import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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
| THE REPORT PDF
|--------------------------------------------------------------------------
|
| Landscape, because the useful version of this document is one somebody
| takes into a morning meeting — a portrait page would fit four columns and
| wrap the rest.
|
| One section per table, stacked down the document, so a report prints as a
| report rather than as six separate downloads that have to be stapled.
|
| KNOWN LIMITATION — NON-LATIN TEXT
|
| jsPDF's built-in Helvetica is WinAnsi-encoded, so Arabic characters do not
| survive into the file; they are dropped rather than rendered. This is true
| of every PDF export in this app, not just the reports. A customer named in
| Arabic exports correctly to Excel and illegibly to PDF. Fixing it means
| embedding a Unicode font, which is its own piece of work. Until then the
| Excel export is the one to use where Arabic names matter.
*/

const LOGO_PATH = join(process.cwd(), "public", "logo.png");

const NAVY: [number, number, number] = [17, 31, 66];
const GREY: [number, number, number] = [107, 114, 128];
const RED: [number, number, number] = [185, 28, 28];
const INK: [number, number, number] = [31, 41, 55];

/* Below this much free space, a new section starts on a fresh page rather
 * than leaving a heading stranded at the foot of one. */
const MIN_SECTION_SPACE = 46;

function loadLogoBase64(): string | null {
  try {
    const buffer = readFileSync(LOGO_PATH);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Where the last table finished.
 *
 * jspdf-autotable returns nothing and records the position on the document
 * instead. The property is not in jsPDF's own types, hence the narrowing
 * here rather than a cast at each call site.
 */
function lastTableBottom(doc: jsPDF, fallback: number): number {
  const withTable = doc as jsPDF & { lastAutoTable?: { finalY?: number } };
  const finalY = withTable.lastAutoTable?.finalY;

  return typeof finalY === "number" ? finalY : fallback;
}

export function generateExportPdf(tables: RenderedTable[], meta: ExportMeta): Buffer {
  const doc = new jsPDF({ orientation: "landscape" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const logo = loadLogoBase64();
  const left = logo ? 34 : 14;

  /* ---- document header, once ---- */
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
  doc.text(`Optimus Megatron Cars — ${meta.title}`, left, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GREY);

  const provenance = provenanceLine(meta, formatCellTime(new Date().toISOString()));

  /* The provenance can outrun one line once filters are listed, and jsPDF
   * does not wrap on its own — it would run off the edge of the page. */
  const provenanceLines = doc.splitTextToSize(provenance, pageWidth - left - 14);

  doc.text(provenanceLines, left, 24);

  let cursor = 24 + provenanceLines.length * 4 + 4;

  /*
   * An incomplete document says so at the top, not only beside the table
   * that was capped. A PDF gets printed and passed around long after the
   * screen that produced it is gone, and the reader who picks up page four
   * never sees a warning that only appeared on page one of six.
   */
  if (meta.truncated) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...RED);
    doc.text(
      "INCOMPLETE — at least one table in this document reached the row cap. The affected tables are marked below.",
      left,
      cursor,
    );
    cursor += 7;
  }

  if (tables.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(
      "No rows matched this report's filters for the selected period.",
      left,
      cursor + 4,
    );
  }

  /* ---- one section per table ---- */
  tables.forEach((table, index) => {
    if (index > 0) {
      cursor = lastTableBottom(doc, cursor) + 12;
    }

    if (cursor > pageHeight - MIN_SECTION_SPACE) {
      doc.addPage();
      cursor = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(table.name, 14, cursor);

    cursor += 5;

    const rowCount = `${table.rows.length.toLocaleString("en-US")} ${table.rows.length === 1 ? "row" : "rows"}`;

    if (table.truncated) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...RED);
      doc.text(
        `INCOMPLETE — showing ${rowCount} of ${(table.total ?? table.rows.length).toLocaleString("en-US")} matching. Narrow the filters and export again for the full set.`,
        14,
        cursor,
      );
      cursor += 5;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GREY);
      doc.text(rowCount, 14, cursor);
      cursor += 5;
    }

    if (table.note) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GREY);

      const noteLines = doc.splitTextToSize(table.note, pageWidth - 28);

      doc.text(noteLines, 14, cursor);
      cursor += noteLines.length * 4 + 2;
    }

    autoTable(doc, {
      startY: cursor,
      head: [table.columns.map((column) => column.label)],
      body: table.rows.length > 0 ? table.rows : [["—"]],
      styles: {
        font: "helvetica",
        fontSize: 7,
        cellPadding: 2,
        overflow: "linebreak",
        textColor: INK,
      },
      headStyles: {
        fillColor: NAVY,
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [247, 248, 250] },
      columnStyles: Object.fromEntries(
        table.columns.map((column, columnIndex) => [
          columnIndex,
          { halign: column.align, cellWidth: "auto" as const },
        ]),
      ),
      margin: { left: 14, right: 14, top: 16 },
    });
  });

  /*
   * Footers last, once every page exists.
   *
   * Stamping them while the tables were drawn is the obvious way to do it
   * and it is wrong: the page count at that moment is the count so far, so
   * every page comes out reading "Page 3 of 3". The whole purpose of "of N"
   * is to let a reader notice a page is missing from the printout, and that
   * version silently destroys it. Counting after the fact is the fix.
   */
  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GREY);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 14, pageHeight - 8, {
      align: "right",
    });
    doc.text(`${meta.title} · ${meta.period}`, 14, pageHeight - 8);
  }

  return Buffer.from(doc.output("arraybuffer"));
}
