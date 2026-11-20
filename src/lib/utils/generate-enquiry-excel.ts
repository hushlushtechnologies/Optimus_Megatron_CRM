import ExcelJS from "exceljs";
import { readFileSync } from "fs";
import { join } from "path";

import { formatDate, formatDateTime } from "@/src/lib/utils/format-date";

import type { EnquiryExportRow } from "@/src/lib/supabase/enquiry-export-queries";

// =========================================================
// CONFIG
// =========================================================

const LOGO_PATH = join(process.cwd(), "public", "logo.png");

interface Column {
  header: string;
  key: string;
  width: number;
}

/*
 * One list, used for the column widths and the header row both, so the two
 * can't fall out of step. In the lead export those are two literal arrays
 * that have to be edited together; getting them out of order there shifts
 * every heading one column along.
 */
const COLUMNS: Column[] = [
  { header: "", key: "_spacer", width: 2 },
  { header: "Reference", key: "enquiryNumber", width: 16 },
  { header: "Received", key: "createdAt", width: 18 },
  { header: "Type", key: "type", width: 16 },
  { header: "Status", key: "status", width: 18 },
  { header: "Priority", key: "priority", width: 11 },
  { header: "Source", key: "source", width: 14 },
  { header: "Subject", key: "subject", width: 30 },
  { header: "Customer", key: "customerName", width: 24 },
  { header: "Phone", key: "phone", width: 18 },
  { header: "Email", key: "email", width: 28 },
  { header: "Prefers", key: "preferredContact", width: 12 },
  { header: "Vehicle", key: "vehicle", width: 30 },
  { header: "Stock No.", key: "stockId", width: 14 },
  { header: "Location", key: "location", width: 18 },
  { header: "With", key: "assignedTo", width: 20 },
  { header: "Next Follow-Up", key: "nextFollowUpAt", width: 18 },
  { header: "Last Activity", key: "lastActivityAt", width: 18 },
  { header: "Closed", key: "closedAt", width: 18 },
  { header: "Close Reason", key: "closeReason", width: 26 },
];

const dash = (value: string | null) => value ?? "—";
const day = (value: string | null) => (value ? formatDate(new Date(value)) : "—");

// =========================================================
// GENERATE ENQUIRY EXCEL
// =========================================================

/**
 * The enquiry list as a workbook, in the same house style as the other
 * exports.
 *
 * Frozen below the header so a long list stays readable while scrolling,
 * and an autofilter on the header row because the first thing anybody does
 * with a file like this is narrow it.
 */
export async function generateEnquiryExcel(
  rows: EnquiryExportRow[],
  title = "Enquiry Export",
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Optimus Megatron Cars";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Enquiries", {
    views: [
      {
        state: "frozen",
        ySplit: 4,
      },
    ],
  });

  // =======================================================
  // LOGO
  // =======================================================

  try {
    // Base64 to avoid ExcelJS Buffer typing conflicts.
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
    // The export still works without it.
    console.warn("Enquiry export logo could not be loaded:", error);
  }

  // =======================================================
  // TITLE
  // =======================================================

  sheet.mergeCells("B1:E1");

  sheet.getCell("B1").value = `Optimus Megatron Cars — ${title}`;

  sheet.getCell("B1").font = {
    bold: true,
    size: 13,
    color: { argb: "FF111F42" },
  };

  sheet.mergeCells("B2:E2");

  sheet.getCell("B2").value =
    `Generated ${formatDateTime(new Date())} · ${rows.length} ${rows.length === 1 ? "enquiry" : "enquiries"}` +
    " · contains customer contact details, internal use only";

  sheet.getCell("B2").font = {
    size: 9,
    color: { argb: "FF6B7280" },
  };

  // =======================================================
  // COLUMNS AND HEADER ROW
  // =======================================================

  sheet.columns = COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));

  const headerRow = sheet.getRow(4);

  headerRow.values = COLUMNS.map((column) => column.header);

  headerRow.font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
  };

  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF111F42" },
  };

  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 22;

  // =======================================================
  // DATA ROWS — DUBAI TIMEZONE
  // =======================================================

  for (const row of rows) {
    sheet.addRow({
      _spacer: "",
      enquiryNumber: row.enquiryNumber,
      createdAt: day(row.createdAt),
      type: row.type,
      status: row.status,
      priority: row.priority,
      source: row.source,
      subject: dash(row.subject),
      customerName: row.customerName,
      phone: dash(row.phone),
      email: dash(row.email),
      preferredContact: dash(row.preferredContact),
      vehicle: dash(row.vehicle),
      stockId: dash(row.stockId),
      location: dash(row.location),
      assignedTo: row.assignedTo,
      nextFollowUpAt: day(row.nextFollowUpAt),
      lastActivityAt: day(row.lastActivityAt),
      closedAt: day(row.closedAt),
      closeReason: dash(row.closeReason),
    });
  }

  // =======================================================
  // FILTER
  // =======================================================

  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 4, column: 2 },
      to: { row: 4 + rows.length, column: COLUMNS.length },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return Buffer.from(buffer);
}
