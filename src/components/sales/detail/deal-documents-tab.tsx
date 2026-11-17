"use client";

import { DocumentsPanel } from "@/src/components/sales/documents/documents-panel";
import { dealDocumentOptions } from "@/src/lib/utils/sales-documents";
import type { SalesDocumentItem } from "@/src/lib/types/sales-documents";
import type { SalesDealDetail } from "@/src/lib/types/sales-detail";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";

interface DealDocumentsTabProps {
  deal: SalesDealDetail;
  documents: SalesDocumentItem[] | null;
  permissions: SalesPermissions;
}

export function DealDocumentsTab({ deal, documents, permissions }: DealDocumentsTabProps) {
  return (
    <DocumentsPanel
      documents={documents}
      dealId={deal.id}
      reservationId={null}
      options={dealDocumentOptions(deal, documents)}
      canIssue={permissions.documents}
      canVoid={permissions.cancel}
      intro="Quotations, invoices and receipts for this deal. A created document never changes. Receipts are created from the Payments tab, once a payment is verified."
    />
  );
}