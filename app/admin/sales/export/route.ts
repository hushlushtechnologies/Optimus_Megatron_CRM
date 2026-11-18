import { NextRequest, NextResponse } from "next/server";

import { requireSalesPermission } from "@/src/lib/supabase/sales-permissions";
import { getSalesExportRows, parseReportRange } from "@/src/lib/supabase/sales-report-queries";
import { generateSalesExcel } from "@/src/lib/utils/generate-sales-excel";
import { generateSalesPdf } from "@/src/lib/utils/generate-sales-pdf";
import { REPORT_RANGES } from "@/src/lib/types/sales-reports";

/*
|--------------------------------------------------------------------------
| SALES EXPORT (Sprint 6 Phase 17)
|--------------------------------------------------------------------------
|
| Requires sales.export. Row-level security still applies to the underlying
| query, so a person only ever exports the deals they can already see.
|
| The X-Export-* headers let downloadExportFile tell the person when the row
| cap bit, rather than handing them a silently short file.
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
  const permission = await requireSalesPermission("export");
  if (!permission.allowed) {
    return fail(permission.error ?? "You don't have permission to export sales data.", 403);
  }

  const params = request.nextUrl.searchParams;
  const format = params.get("format");

  if (format !== "excel" && format !== "pdf") {
    return fail("Invalid export format.", 400);
  }

  const range = parseReportRange(params.get("range") ?? undefined);
  const rangeLabel = REPORT_RANGES.find((option) => option.id === range)?.label ?? "All time";

  try {
    const result = await getSalesExportRows(range);

    if (result.rows.length === 0) {
      return fail("There are no deals to export for that period.", 400);
    }

    const currency = result.rows[0]?.currency ?? "AED";
    const meta = { rangeLabel, total: result.total, truncated: result.truncated, currency };

    const dateStamp = new Date().toISOString().slice(0, 10);

    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "X-Export-Count": String(result.rows.length),
      "X-Export-Total": String(result.total),
      "X-Export-Truncated": String(result.truncated),
    };

    if (format === "excel") {
      const body = bufferToResponseBody(await generateSalesExcel(result.rows, meta));

      return new NextResponse(body, {
        headers: {
          ...headers,
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="omc-sales-${range}-${dateStamp}.xlsx"`,
          "Content-Length": String(body.byteLength),
        },
      });
    }

    const body = bufferToResponseBody(generateSalesPdf(result.rows, meta));

    return new NextResponse(body, {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="omc-sales-${range}-${dateStamp}.pdf"`,
        "Content-Length": String(body.byteLength),
      },
    });
  } catch (error) {
    console.error("Sales export error:", error);
    return fail("Unable to generate the export. Please try again.", 500);
  }
}