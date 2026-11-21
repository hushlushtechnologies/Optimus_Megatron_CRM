import { NextRequest, NextResponse } from "next/server";

import { requireOfferPermission } from "@/src/lib/supabase/offer-permissions";
import {
  getAssignmentExportRows,
  getCampaignExportRows,
  getLoyaltyExportRows,
  getRedemptionExportRows,
  MAX_EXPORT_ROWS,
} from "@/src/lib/supabase/offer-export-queries";
import {
  OFFER_EXPORT_DATASETS,
  type OfferExportDataset,
} from "@/src/lib/types/offer-export";
import {
  ASSIGNMENT_EXPORT_COLUMNS,
  CAMPAIGN_EXPORT_COLUMNS,
  DATASET_TITLES,
  LOYALTY_EXPORT_COLUMNS,
  REDEMPTION_EXPORT_COLUMNS,
} from "@/src/lib/utils/offer-export-columns";
import { generateOfferExcel, type OfferExportMeta } from "@/src/lib/utils/generate-offer-excel";
import { generateOfferPdf } from "@/src/lib/utils/generate-offer-pdf";
import {
  parseOfferFilters,
  parseOfferSearch,
  parseOfferTab,
} from "@/src/lib/utils/offer-list-params";
import { OFFER_TAB_LABELS } from "@/src/lib/types/offer-list";

/*
|--------------------------------------------------------------------------
| DOWNLOADING OFFERS AND LOYALTY DATA (Phase 24)
|--------------------------------------------------------------------------
|
| Requires offers.export, which is not offers.view.
|
| The difference is the same one Sprint 7 drew for enquiries, and it matters
| more here: viewing shows one customer's points to one person at a screen,
| while exporting puts every customer's balance and every discount given
| into a file that can be emailed, copied to a laptop and kept after
| somebody leaves. Those deserve separate answers.
|
| Row-level security still applies underneath, so a person exports only the
| rows they can already see. This check is the early, legible refusal.
|
| Four datasets, matching the plan: campaigns (the filtered list or a ticked
| selection), redemption history, personalised offers, and the loyalty
| ledger.
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
  const permission = await requireOfferPermission("export");

  if (!permission.allowed) {
    return fail(permission.error ?? "You don't have permission to export offer data.", 403);
  }

  const params = request.nextUrl.searchParams;

  const format = params.get("format");

  if (format !== "excel" && format !== "pdf") {
    return fail("Ask for excel or pdf.", 400);
  }

  const rawDataset = params.get("dataset") ?? "campaigns";

  if (!(OFFER_EXPORT_DATASETS as readonly string[]).includes(rawDataset)) {
    return fail("Unknown export.", 400);
  }

  const dataset = rawDataset as OfferExportDataset;

  try {
    const built = await build(dataset, params);

    if (!built) return fail("Unknown export scope.", 400);

    if (built.rowCount === 0) {
      return fail("There is nothing to export for the current selection.", 400);
    }

    const dateStamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(
      new Date(),
    );

    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "X-Export-Count": String(built.rowCount),
      "X-Export-Total": String(built.meta.total),
      "X-Export-Truncated": String(built.meta.truncated),
    };

    const stem = `omc-${dataset}-${dateStamp}`;

    if (format === "excel") {
      const body = bufferToResponseBody(await built.excel());

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

    const body = bufferToResponseBody(built.pdf());

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
     * A refusal the person can act on — nothing ticked, too many ticked —
     * is their answer, not a server error. Without this branch those
     * messages would be replaced by "Unable to generate the export", and
     * somebody would retry the same impossible thing.
     */
    if (error instanceof ExportRefusal) {
      return fail(error.message, 400);
    }

    console.error("Offer export error:", error);
    return fail("Unable to generate the export. Please try again.", 500);
  }
}

interface Built {
  rowCount: number;
  meta: OfferExportMeta;
  excel: () => Promise<Buffer>;
  pdf: () => Buffer;
}

/**
 * Fetch the dataset and bind it to its columns.
 *
 * Returning closures rather than the rows keeps the row type attached to
 * the matching column list. Handing both back separately would type-check
 * against the wrong pairing, which is a file full of dashes rather than an
 * error.
 */
async function build(
  dataset: OfferExportDataset,
  params: URLSearchParams,
): Promise<Built | null> {
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  const promotionId = params.get("promotionId") ?? undefined;

  if (dataset === "campaigns") {
    const rawScope = params.get("scope") ?? "current";

    if (rawScope !== "current" && rawScope !== "selected") return null;

    const ids = params.get("ids")?.split(",").filter(Boolean);

    if (rawScope === "selected") {
      if (!ids?.length) {
        throw new ExportRefusal("Nothing was selected to export.");
      }

      if (ids.length > MAX_EXPORT_ROWS) {
        throw new ExportRefusal(`Export at most ${MAX_EXPORT_ROWS} campaigns at a time.`);
      }
    }

    const tab = parseOfferTab(params.get("tab") ?? undefined);
    const search = parseOfferSearch(params.get("q") ?? undefined);
    const filters = parseOfferFilters(Object.fromEntries(params.entries()));

    const result = await getCampaignExportRows({ scope: rawScope, ids, tab, search, filters });

    const meta: OfferExportMeta = {
      title: DATASET_TITLES.campaigns,
      scopeLabel:
        rawScope === "selected"
          ? `${result.rows.length} selected`
          : `${OFFER_TAB_LABELS[tab]}${search ? ` matching "${search}"` : ""}`,
      total: result.total,
      truncated: result.truncated,
    };

    return {
      rowCount: result.rows.length,
      meta,
      excel: () => generateOfferExcel(result.rows, CAMPAIGN_EXPORT_COLUMNS, meta),
      pdf: () => generateOfferPdf(result.rows, CAMPAIGN_EXPORT_COLUMNS, meta),
    };
  }

  if (dataset === "redemptions") {
    const result = await getRedemptionExportRows({ promotionId, from, to });

    const meta: OfferExportMeta = {
      title: DATASET_TITLES.redemptions,
      scopeLabel: describeRange(promotionId, from, to),
      total: result.total,
      truncated: result.truncated,
      sensitive: true,
    };

    return {
      rowCount: result.rows.length,
      meta,
      excel: () => generateOfferExcel(result.rows, REDEMPTION_EXPORT_COLUMNS, meta),
      pdf: () => generateOfferPdf(result.rows, REDEMPTION_EXPORT_COLUMNS, meta),
    };
  }

  if (dataset === "assignments") {
    const result = await getAssignmentExportRows({ promotionId });

    const meta: OfferExportMeta = {
      title: DATASET_TITLES.assignments,
      scopeLabel: promotionId ? "One campaign" : "All campaigns",
      total: result.total,
      truncated: result.truncated,
      sensitive: true,
    };

    return {
      rowCount: result.rows.length,
      meta,
      excel: () => generateOfferExcel(result.rows, ASSIGNMENT_EXPORT_COLUMNS, meta),
      pdf: () => generateOfferPdf(result.rows, ASSIGNMENT_EXPORT_COLUMNS, meta),
    };
  }

  const customerId = params.get("customerId") ?? undefined;

  const result = await getLoyaltyExportRows({ customerId, from, to });

  const meta: OfferExportMeta = {
    title: DATASET_TITLES.loyalty,
    scopeLabel: customerId ? "One customer" : describeRange(undefined, from, to),
    total: result.total,
    truncated: result.truncated,
    sensitive: true,
  };

  return {
    rowCount: result.rows.length,
    meta,
    excel: () => generateOfferExcel(result.rows, LOYALTY_EXPORT_COLUMNS, meta),
    pdf: () => generateOfferPdf(result.rows, LOYALTY_EXPORT_COLUMNS, meta),
  };
}

/** A refusal the person should read, rather than a 500. */
class ExportRefusal extends Error {}

function describeRange(
  promotionId: string | undefined,
  from: string | undefined,
  to: string | undefined,
): string {
  const scope = promotionId ? "One campaign" : "All campaigns";

  if (from && to) return `${scope}, ${from} to ${to}`;
  if (from) return `${scope}, from ${from}`;
  if (to) return `${scope}, up to ${to}`;

  return `${scope}, all time`;
}
