import { NextRequest, NextResponse } from "next/server";
import { getDocumentForPdf } from "@/src/lib/supabase/sales-document-queries";
import { generateSalesDocumentPdf } from "@/src/lib/utils/generate-sales-document-pdf";
import { isUuid } from "@/src/lib/utils/search-term";

// jspdf needs Node, and the answer depends on who is asking.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return fail("That document could not be found.", 404);

  try {
    // The database only returns the document if this person may see its deal or reservation.
    const result = await getDocumentForPdf(id);
    if (result.status === "not_found") return fail("That document could not be found.", 404);
    if (result.status === "error") return fail("Unable to read the document. Please try again.", 500);

    const buffer = generateSalesDocumentPdf(result.record);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${result.record.doc_number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Sales document PDF error:", error);
    return fail("Unable to create the PDF. Please try again.", 500);
  }
}