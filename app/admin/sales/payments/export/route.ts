import { NextRequest, NextResponse } from "next/server";

import { getPaymentExportRows } from "@/src/lib/supabase/sales-payment-queries";
import { currentUserSalesPermissions } from "@/src/lib/supabase/sales-permissions";
import type { PaymentQueueTab } from "@/src/lib/types/sales-payments";
import { generatePaymentExcel } from "@/src/lib/utils/generate-payment-excel";
import { generatePaymentPdf } from "@/src/lib/utils/generate-payment-pdf";
import {
  countActivePaymentFilters,
  parsePaymentFilters,
  parsePaymentSort,
} from "@/src/lib/utils/payment-queue-filters";

/*
|--------------------------------------------------------------------------
| PAYMENTS EXPORT
|--------------------------------------------------------------------------
|
| Needs sales.export and the same access the payments queue needs. Row-level
| security still applies underneath, so a person only ever exports the
| payments they can already see on the screen.
|
| The tab, search, filters and order all come from the query string, so the
| file matches the view it was asked for rather than the whole table.
|
| The X-Export-* headers let downloadExportFile say when the row cap bit,
| rather than handing someone a quietly short file.
*/

const TABS: PaymentQueueTab[] = ["awaiting", "verified", "closed", "all"];

const TAB_LABELS: Record<PaymentQueueTab, string> = {
  awaiting: "Awaiting verification",
  verified: "Verified",
  closed: "Rejected and reversed",
  all: "All payments",
};

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
  const permissions = await currentUserSalesPermissions();

  if (!permissions.export) {
    return fail("You don't have permission to export sales data.", 403);
  }

  if (!permissions.paymentsVerify && !permissions.paymentsReverse) {
    return fail("You don't have permission to export the payments queue.", 403);
  }

  const params = request.nextUrl.searchParams;
  const format = params.get("format");

  if (format !== "excel" && format !== "pdf") {
    return fail("Invalid export format.", 400);
  }

  const tabRaw = (params.get("tab") ?? "").trim();
  const tab: PaymentQueueTab = TABS.includes(tabRaw as PaymentQueueTab)
    ? (tabRaw as PaymentQueueTab)
    : "awaiting";

  const search = (params.get("q") ?? "").trim().slice(0, 100);

  const filters = parsePaymentFilters(Object.fromEntries(params.entries()));
  const sort = parsePaymentSort(params.get("sort") ?? "", tab === "awaiting");

  const filterCount = countActivePaymentFilters(filters);

  const scopeLabel = [
    TAB_LABELS[tab],
    search ? `search "${search}"` : null,
    filterCount > 0 ? `${filterCount} ${filterCount === 1 ? "filter" : "filters"}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  try {
    const result = await getPaymentExportRows({ tab, search, filters, sort });

    if (result.rows.length === 0) {
      return fail("There are no payments to export for that view.", 400);
    }

    const currency = result.rows[0]?.currency ?? "AED";
    const meta = { scopeLabel, total: result.total, truncated: result.truncated, currency };

    const dateStamp = new Date().toISOString().slice(0, 10);

    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "X-Export-Count": String(result.rows.length),
      "X-Export-Total": String(result.total),
      "X-Export-Truncated": String(result.truncated),
    };

    if (format === "excel") {
      const body = bufferToResponseBody(await generatePaymentExcel(result.rows, meta));

      return new NextResponse(body, {
        headers: {
          ...headers,
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="omc-payments-${tab}-${dateStamp}.xlsx"`,
          "Content-Length": String(body.byteLength),
        },
      });
    }

    const body = bufferToResponseBody(generatePaymentPdf(result.rows, meta));

    return new NextResponse(body, {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="omc-payments-${tab}-${dateStamp}.pdf"`,
        "Content-Length": String(body.byteLength),
      },
    });
  } catch (error) {
    console.error("Payments export error:", error);
    return fail("Unable to generate the export. Please try again.", 500);
  }
}
