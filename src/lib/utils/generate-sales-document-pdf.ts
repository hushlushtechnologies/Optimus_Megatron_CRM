import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { readFileSync } from "fs";
import { join } from "path";

import { formatDate, formatDateTime } from "@/src/lib/utils/format-date";
import { formatFils, toFils } from "@/src/lib/utils/sales-money";
import type { DocumentSnapshot, DocumentType, SalesDocumentRecord } from "@/src/lib/types/sales-documents";

const LOGO_PATH = join(process.cwd(), "public", "logo.png");
const NAVY: [number, number, number] = [17, 31, 66];
const MARGIN = 14;
const PAGE_BOTTOM = 272;

const TITLES: Record<DocumentType, string> = {
  Quotation: "QUOTATION",
  Invoice: "SALES INVOICE",
  Receipt: "PAYMENT RECEIPT",
  "Reservation Confirmation": "RESERVATION CONFIRMATION",
};

function loadLogo(): string | null {
  try {
    return `data:image/png;base64,${readFileSync(LOGO_PATH).toString("base64")}`;
  } catch {
    return null;
  }
}

type Pdf = jsPDF & { lastAutoTable?: { finalY: number } };

/** Lines of text in a column. Returns the y just below it. */
function block(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  heading: string | null,
  lines: (string | undefined)[],
): number {
  let cursor = y;
  if (heading) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 150);
    doc.text(heading.toUpperCase(), x, cursor);
    cursor += 5;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30, 40, 60);
  for (const line of lines) {
    if (!line) continue;
    for (const part of doc.splitTextToSize(line, width) as string[]) {
      doc.text(part, x, cursor);
      cursor += 4.6;
    }
  }
  return cursor;
}

export function generateSalesDocumentPdf(record: SalesDocumentRecord): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }) as Pdf;
  const snap: DocumentSnapshot = record.snapshot;
  const cur = snap.currency;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const voided = record.status === "Voided";
  const logo = loadLogo();

  const money = (value: number | null | undefined) => formatFils(toFils(value ?? null), cur);
  const contentWidth = pageWidth - MARGIN * 2;
  const company = snap.company;
  const companyName = company.trade_name || company.legal_name;

  /* ---------- Header ---------- */
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 32, "F");
  if (logo) doc.addImage(logo, "PNG", MARGIN, 7, 17, 17);

  const textX = logo ? MARGIN + 22 : MARGIN;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(companyName, textX, 15);
  if (company.trade_name && company.trade_name !== company.legal_name) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(200, 205, 215);
    doc.text(company.legal_name, textX, 20);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(TITLES[record.doc_type], pageWidth - MARGIN, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(215, 220, 230);
  doc.text(record.doc_number, pageWidth - MARGIN, 19, { align: "right" });
  if (voided) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 130, 130);
    doc.text("VOIDED", pageWidth - MARGIN, 26, { align: "right" });
  }

  /* ---------- From and details ---------- */
  let y = 42;
  const half = contentWidth / 2 - 4;
  const leftEnd = block(doc, MARGIN, y, half, "From", [
    company.legal_name,
    company.address,
    company.phone ? `Phone: ${company.phone}` : undefined,
    company.email,
    company.website,
    company.tax_registration_number ? `Tax registration no: ${company.tax_registration_number}` : undefined,
  ]);

  const rightEnd = block(doc, MARGIN + half + 8, y, half, "Details", [
    `Issued: ${formatDate(snap.issued_on)}`,
    snap.valid_until ? `Valid until: ${formatDate(snap.valid_until)}` : undefined,
    snap.deal_number ? `Deal: ${snap.deal_number}` : undefined,
    snap.reservation_number ? `Reservation: ${snap.reservation_number}` : undefined,
    snap.showroom ? `Showroom: ${snap.showroom}` : undefined,
    snap.salesperson ? `Sales executive: ${snap.salesperson}` : undefined,
  ]);

  y = Math.max(leftEnd, rightEnd) + 4;

  if (voided) {
    doc.setFillColor(254, 226, 226);
    doc.rect(MARGIN, y - 2, contentWidth, 9, "F");
    doc.setTextColor(153, 27, 27);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const when = record.voided_at ? ` on ${formatDateTime(record.voided_at)}` : "";
    doc.text(
      (
        doc.splitTextToSize(
          `This document was voided${when}: ${record.void_reason ?? ""}`,
          contentWidth - 4,
        ) as string[]
      )[0],
      MARGIN + 2,
      y + 4,
    );
    y += 12;
  }

  /* ---------- Customer and vehicle ---------- */
  const partyHeading =
    record.doc_type === "Quotation"
      ? "Prepared for"
      : record.doc_type === "Receipt"
        ? "Received from"
        : "Customer";

  const customerEnd = block(doc, MARGIN, y, half, partyHeading, [
    snap.customer.name,
    `Customer ID: ${snap.customer.number}`,
    snap.customer.phone,
    snap.customer.email,
    snap.customer.address,
  ]);

  const vehicle = snap.vehicle;
  const vehicleEnd = vehicle
    ? block(doc, MARGIN + half + 8, y, half, "Vehicle", [
        vehicle.title,
        `Stock ID: ${vehicle.stock_id}`,
        [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" · ") || undefined,
        vehicle.vin ? `VIN: ${vehicle.vin}` : undefined,
        vehicle.mileage_km !== undefined
          ? `Mileage: ${vehicle.mileage_km.toLocaleString("en")} km`
          : undefined,
        vehicle.color ? `Colour: ${vehicle.color}` : undefined,
      ])
    : y;

  y = Math.max(customerEnd, vehicleEnd) + 6;

  const ensure = (space: number) => {
    if (y + space > PAGE_BOTTOM) {
      doc.addPage();
      y = 20;
    }
  };

  /* ---------- Body by type ---------- */
  if (record.doc_type === "Receipt" && snap.payment) {
    const pay = snap.payment;
    ensure(34);
    doc.setFillColor(245, 247, 250);
    doc.rect(MARGIN, y, contentWidth, 22, "F");
    doc.setTextColor(120, 130, 150);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("AMOUNT RECEIVED", MARGIN + 4, y + 7);
    doc.setTextColor(...NAVY);
    doc.setFontSize(18);
    doc.text(money(pay.amount), MARGIN + 4, y + 17);
    y += 28;

    autoTable(doc, {
      startY: y,
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 1.8, textColor: [30, 40, 60] },
      columnStyles: { 0: { cellWidth: 45, textColor: [120, 130, 150] } },
      body: [
        ["For", pay.kind],
        ["Paid by", pay.method],
        ...(pay.reference ? [["Reference", pay.reference]] : []),
        ["Date paid", formatDate(pay.paid_on)],
        ...(pay.verified_by && pay.verified_at
          ? [["Verified", `${pay.verified_by} on ${formatDateTime(pay.verified_at)}`]]
          : []),
      ],
      margin: { left: MARGIN, right: MARGIN },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 6;

    if (snap.total !== undefined) {
      ensure(30);
      autoTable(doc, {
        startY: y,
        theme: "grid",
        head: [["Deal position at the time of this receipt", ""]],
        body: [
          ["Total due", money(snap.total)],
          ["Received to date (verified)", money(snap.received)],
          ["Balance due", money(snap.balance)],
        ],
        headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
        styles: { fontSize: 9, cellPadding: 2.2 },
        columnStyles: { 1: { halign: "right" } },
        margin: { left: MARGIN, right: MARGIN },
      });
      y = (doc.lastAutoTable?.finalY ?? y) + 6;
    }
  }

  if (record.doc_type === "Reservation Confirmation" && snap.reservation) {
    const res = snap.reservation;
    ensure(40);
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["Reservation", ""]],
      body: [
        ["Vehicle held from", res.starts_at ? formatDateTime(res.starts_at) : "—"],
        ["Vehicle held until", res.expires_at ? formatDateTime(res.expires_at) : "—"],
        ...(res.deposit_required !== undefined ? [["Deposit required", money(res.deposit_required)]] : []),
        ...(res.deposit_verified !== undefined
          ? [["Deposit received (verified)", money(res.deposit_verified)]]
          : []),
        ...(res.deposit_waived ? [["Deposit", "Waived"]] : []),
      ],
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 9, cellPadding: 2.2 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { halign: "right" } },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 70, 90);
    const text = doc.splitTextToSize(
      "The vehicle is held for the customer until the time above. After that the hold ends automatically and the vehicle may be offered to others.",
      contentWidth,
    ) as string[];
    ensure(text.length * 4.6 + 4);
    text.forEach((line) => {
      doc.text(line, MARGIN, y);
      y += 4.6;
    });
    y += 4;
  }

  if ((record.doc_type === "Quotation" || record.doc_type === "Invoice") && snap.lines) {
    ensure(40);
    autoTable(doc, {
      startY: y,
      head: [["Description", "Amount"]],
      body: snap.lines.map((line) => [
        line.detail ? `${line.label}\n${line.detail}` : line.label,
        money(line.amount),
      ]),
      foot: [[snap.total_label ?? "Total", money(snap.total)]],
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
      footStyles: { fillColor: [245, 247, 250], textColor: NAVY, fontStyle: "bold", fontSize: 10 },
      styles: { fontSize: 9, cellPadding: 2.6 },
      columnStyles: { 1: { halign: "right", cellWidth: 45 } },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 6;

    if (record.doc_type === "Invoice" && snap.received !== undefined) {
      ensure(24);
      autoTable(doc, {
        startY: y,
        theme: "plain",
        styles: { fontSize: 9, cellPadding: 1.8 },
        columnStyles: { 0: { halign: "right" }, 1: { halign: "right", cellWidth: 45, fontStyle: "bold" } },
        body: [
          ["Received to date (verified payments)", money(snap.received)],
          ["Balance due at the time of issue", money(snap.balance)],
        ],
        margin: { left: MARGIN, right: MARGIN },
      });
      y = (doc.lastAutoTable?.finalY ?? y) + 6;
    }
  }

  /* ---------- Notes, terms and payment details ---------- */
  const paragraph = (heading: string, text: string | undefined) => {
    if (!text) return;
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    ensure(lines.length * 4.4 + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 150);
    doc.text(heading.toUpperCase(), MARGIN, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 70, 90);
    lines.forEach((line) => {
      doc.text(line, MARGIN, y);
      y += 4.4;
    });
    y += 3;
  };

  paragraph("Note", snap.note);
  if (record.doc_type === "Quotation") paragraph("Terms", company.quotation_terms);
  if (record.doc_type === "Invoice") paragraph("How to pay", company.bank_details);
  if (record.doc_type === "Invoice") paragraph("Notes", company.invoice_footer);

  if (record.doc_type === "Quotation" || record.doc_type === "Invoice") {
    ensure(10);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 150);
    doc.text(
      snap.tax_applied ? "Tax is included as shown." : "Tax is not applied on this document.",
      MARGIN,
      y,
    );
    y += 5;
    if (record.doc_type === "Quotation") {
      doc.text("This is a quotation, not an invoice. It does not reserve the vehicle.", MARGIN, y);
    }
  }

  /* ---------- Footer on every page, once the page count is known ---------- */
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(220, 224, 232);
    doc.line(MARGIN, pageHeight - 14, pageWidth - MARGIN, pageHeight - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`${record.doc_number} · ${company.legal_name}`, MARGIN, pageHeight - 9);
    doc.text(`Page ${page} of ${pages}`, pageWidth - MARGIN, pageHeight - 9, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
