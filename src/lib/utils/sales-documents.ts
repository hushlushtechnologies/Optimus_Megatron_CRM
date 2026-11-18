import type { DocumentType, SalesDocumentItem } from "@/src/lib/types/sales-documents";
import type { SalesDealDetail } from "@/src/lib/types/sales-detail";
import type { ReservationListRow } from "@/src/lib/types/reservations";

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  Quotation: "Quotation",
  Invoice: "Sales invoice",
  Receipt: "Payment receipt",
  "Reservation Confirmation": "Reservation confirmation",
};

export function documentPdfPath(id: string): string {
  return `/admin/sales/documents/${id}/pdf`;
}

export interface DocumentOption {
  type: DocumentType;
  label: string;
  /** Why it can't be created right now. null when it can. */
  reason: string | null;
}

/** Which documents can be created for a deal right now. Receipts are created from the payments. */
export function dealDocumentOptions(
  deal: SalesDealDetail,
  documents: SalesDocumentItem[] | null,
): DocumentOption[] {
  const hasLiveInvoice = !!documents?.some((doc) => doc.doc_type === "Invoice" && doc.status === "Issued");

  const quotationReason =
    deal.status === "Cancelled"
      ? "A cancelled deal can't be quoted."
      : deal.proposed_price === null || deal.proposed_price <= 0
        ? "Set the proposed price first."
        : null;

  const invoiceReason =
    deal.status !== "Confirmed" && deal.status !== "Completed"
      ? "An invoice needs a confirmed deal."
      : hasLiveInvoice
        ? "An invoice is already issued. Void it first to create a new one."
        : null;

  return [
    { type: "Quotation", label: "Create quotation", reason: quotationReason },
    { type: "Invoice", label: "Create invoice", reason: invoiceReason },
  ];
}

export function reservationDocumentOptions(
  reservation: Pick<ReservationListRow, "status">,
  documents: SalesDocumentItem[] | null,
): DocumentOption[] {
  const hasLive = !!documents?.some(
    (doc) => doc.doc_type === "Reservation Confirmation" && doc.status === "Issued",
  );

  const reason =
    reservation.status !== "Confirmed" && reservation.status !== "Converted"
      ? "A confirmation needs the vehicle to be held."
      : hasLive
        ? "A confirmation is already issued. Void it first to create a new one."
        : null;

  return [{ type: "Reservation Confirmation", label: "Create confirmation", reason }];
}
