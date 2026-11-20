import { NextRequest, NextResponse } from "next/server";

import { requireEnquiryPermission } from "@/src/lib/supabase/enquiry-permissions";
import { getEnquiryExportRows, MAX_EXPORT_ROWS } from "@/src/lib/supabase/enquiry-export-queries";
import { generateEnquiryExcel } from "@/src/lib/utils/generate-enquiry-excel";
import { generateEnquiryPdf } from "@/src/lib/utils/generate-enquiry-pdf";
import { ENQUIRY_TYPES } from "@/src/lib/types/enquiry";
import { parseEnquiryFilters, parseEnquiryTab } from "@/src/lib/utils/enquiry-filters";

/*
|--------------------------------------------------------------------------
| DOWNLOADING ENQUIRIES
|--------------------------------------------------------------------------
|
| Requires enquiries.export, which is not enquiries.view. The difference
| matters: viewing shows one member of the public's details to one person at
| a screen, while exporting puts every one of them in a file that can be
| emailed, copied to a laptop and kept after somebody leaves. Those deserve
| separate answers, which is why Phase 1 created the permission and Phase 17
| wired it up.
|
| Three scopes, matching the plan: the current filtered view, a ticked
| selection, or one enquiry type.
*/

export async function GET(request: NextRequest) {
  const permission = await requireEnquiryPermission("export");

  if (!permission.allowed) {
    return NextResponse.json({ error: permission.error }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;

  const format = params.get("format");

  if (format !== "excel" && format !== "pdf") {
    return NextResponse.json({ error: "Ask for excel or pdf." }, { status: 400 });
  }

  const rawScope = params.get("scope") ?? "current";

  if (rawScope !== "current" && rawScope !== "selected" && rawScope !== "type") {
    return NextResponse.json({ error: "Unknown export scope." }, { status: 400 });
  }

  const scope = rawScope;

  try {
    const ids = params.get("ids")?.split(",").filter(Boolean);

    if (scope === "selected") {
      if (!ids?.length) {
        return NextResponse.json({ error: "Nothing was selected to export." }, { status: 400 });
      }

      if (ids.length > MAX_EXPORT_ROWS) {
        return NextResponse.json(
          { error: `Export at most ${MAX_EXPORT_ROWS} enquiries at a time.` },
          { status: 400 },
        );
      }
    }

    const enquiryType = params.get("type") ?? undefined;

    /*
     * Checked against the real list rather than passed through: it reaches a
     * query, and an unknown value should be a refusal here instead of an
     * empty file somebody mistakes for "no enquiries of that type".
     */
    const knownType = (ENQUIRY_TYPES as readonly string[]).includes(enquiryType ?? "");

    if (scope === "type" && !knownType) {
      return NextResponse.json({ error: "Unknown enquiry type." }, { status: 400 });
    }

    const rows = await getEnquiryExportRows({
      scope,
      ids,
      enquiryType,
      tab: parseEnquiryTab(params.get("tab") ?? ""),
      search: params.get("q") ?? "",
      filters: parseEnquiryFilters(Object.fromEntries(params.entries())),
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "There is nothing to export for the current selection." },
        { status: 400 },
      );
    }

    const title =
      scope === "selected"
        ? "Selected Enquiries"
        : scope === "type"
          ? `${enquiryType} Enquiries`
          : "Enquiry Export";

    const slug =
      scope === "type" && enquiryType ? enquiryType.toLowerCase().replace(/[^a-z0-9]+/g, "-") : scope;

    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === "excel") {
      const buffer = await generateEnquiryExcel(rows, title);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="omc-enquiries-${slug}-${dateStamp}.xlsx"`,
        },
      });
    }

    const buffer = generateEnquiryPdf(rows, title);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="omc-enquiries-${slug}-${dateStamp}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Enquiry export error:", error);

    return NextResponse.json({ error: "Unable to generate the export. Please try again." }, { status: 500 });
  }
}
