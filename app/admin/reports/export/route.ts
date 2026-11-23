import { NextRequest, NextResponse } from "next/server";

import {
  canOpenSection,
  currentReportAccess,
} from "@/src/lib/supabase/report-permissions";
import {
  buildSectionExport,
  isExportableSection,
} from "@/src/lib/supabase/report-export-builders";
import { findReportSection } from "@/src/lib/types/report-sections";
import { generateExportExcel } from "@/src/lib/utils/generate-export-excel";
import { generateExportPdf } from "@/src/lib/utils/generate-export-pdf";
import type { ExportMeta } from "@/src/lib/utils/export-tables";
import { activeFilterChips, parseReportQuery } from "@/src/lib/utils/report-filters";

/*
|--------------------------------------------------------------------------
| DOWNLOADING A REPORT (Phase 10)
|--------------------------------------------------------------------------
|
| One route for every section, because the difference between exporting
| inventory and exporting operations is which builder runs — everything
| else, the permission check, the headers, the filename, the truncation
| accounting, is identical. Six routes would be six places for those to
| drift apart.
|
| THREE CHECKS, IN THIS ORDER
|
|   1. Can this person export at all?
|   2. Can this person open THIS section?
|   3. May they see money in it?
|
| The second is the one worth stating plainly. Without it, somebody with
| any export key could download any report simply by editing the section in
| the URL — the export route becomes a way around the page permissions it
| sits behind. The screen hides sections this person cannot open; this is
| the same answer for the address bar.
|
| The third is not enforced here but passed to the builder, which omits the
| money and says in the file that it did. A file that silently drops its
| financial columns looks like a complete file with nothing much in it.
|
| Row-level security still applies underneath all three, so a person
| exports only the rows they can already see. These checks are the early,
| legible refusal.
*/

/**
 * NextResponse needs a web-compatible BodyInit. A Node Buffer is typed as
 * Buffer<ArrayBufferLike>, which newer TypeScript does not accept directly,
 * so a fresh ArrayBuffer-backed Uint8Array is made.
 */
function bufferToResponseBody(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const body = new Uint8Array(buffer.byteLength);
  body.set(buffer);
  return body;
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const access = await currentReportAccess();

  if (!access.canExport) {
    return fail("You don't have permission to export report data.", 403);
  }

  const params = request.nextUrl.searchParams;

  const format = params.get("format");

  if (format !== "excel" && format !== "pdf") {
    return fail("Ask for excel or pdf.", 400);
  }

  const rawSection = params.get("section") ?? "";

  if (!isExportableSection(rawSection)) {
    return fail("That report cannot be exported yet.", 400);
  }

  if (!canOpenSection(access, rawSection)) {
    return fail("You don't have permission to view that report.", 403);
  }

  const section = findReportSection(rawSection);

  if (!section) return fail("Unknown report.", 400);

  /*
   * The filters are parsed from the same query string the page uses, by the
   * same parser, which narrows them to the ones this section accepts. That
   * is what makes the file match the screen it was taken from: a filter the
   * page ignored must not quietly apply to the export, and one the page
   * applied must not be dropped.
   */
  const query = parseReportQuery(Object.fromEntries(params.entries()), rawSection);

  try {
    const built = await buildSectionExport(section.id as typeof rawSection, query.range, query.filters, access, {
      customFrom: query.customFrom,
      customTo: query.customTo,
    });

    const meta: ExportMeta = {
      title: section.label,
      period: built.rangeLabel,
      filters: activeFilterChips(query.filters, rawSection).map(
        (chip) => `${chip.label}: ${chip.display}`,
      ),
      currency: built.currency,
      sensitive: built.sensitive,
      truncated: built.truncated,
    };

    const dateStamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(
      new Date(),
    );

    const rowCount = built.tables.reduce((sum, table) => sum + table.rows.length, 0);

    /*
     * The truncation flag goes in a header as well as in the file.
     *
     * The file is what a person reads; the header is what the browser and
     * any future automation read. A caller that downloads this on a
     * schedule and feeds it onward has no way to see a red line on page
     * one, so the fact that the data is partial has to be legible without
     * opening the document.
     */
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "X-Export-Section": rawSection,
      "X-Export-Count": String(rowCount),
      "X-Export-Tables": String(built.tables.length),
      "X-Export-Truncated": String(built.truncated),
      "X-Export-Financial": String(access.financial),
    };

    /*
     * Deliberately no X-Export-Total.
     *
     * The single-dataset exports send one, and "showing 1,000 of 4,210"
     * means something there. Here the file holds vehicles, brands,
     * locations and ageing buckets, and adding their totals together
     * produces a number that counts nothing. A number that looks
     * authoritative and means nothing is worse in a header than an absent
     * one, so the per-table totals stay in the file, beside the tables
     * they belong to, and the header carries only the fact that something
     * was capped.
     */

    const stem = `omc-${rawSection}-report-${dateStamp}`;

    if (format === "excel") {
      const body = bufferToResponseBody(await generateExportExcel(built.tables, meta));

      return new NextResponse(body, {
        headers: {
          ...headers,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${stem}.xlsx"`,
          "Content-Length": String(body.byteLength),
        },
      });
    }

    const body = bufferToResponseBody(generateExportPdf(built.tables, meta));

    return new NextResponse(body, {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${stem}.pdf"`,
        "Content-Length": String(body.byteLength),
      },
    });
  } catch (error) {
    /*
     * The raw message is logged, not returned. A Supabase error names
     * tables, columns and sometimes the policy that refused — detail that
     * belongs in a log and not on a staff member's screen.
     */
    console.error(`Report export failed (${rawSection}):`, error);

    return fail("Unable to generate the export. Please try again.", 500);
  }
}
