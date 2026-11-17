export type DocumentType = "Quotation" | "Invoice" | "Receipt" | "Reservation Confirmation";
export type DocumentStatus = "Issued" | "Voided";

/** One document as a list shows it. */
export interface SalesDocumentItem {
  id: string;
  doc_type: DocumentType;
  doc_number: string;
  status: DocumentStatus;
  deal_id: string | null;
  reservation_id: string | null;
  payment_id: string | null;
  valid_until: string | null;
  note: string | null;
  issued_at: string;
  issued_by_name: string | null;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
  total: number | null;
  currency: string | null;
}

export interface DocumentLine {
  label: string;
  detail?: string | null;
  amount: number;
}

/** The frozen content of a document. Built by the database when it is created and never changed. */
export interface DocumentSnapshot {
  currency: string;
  issued_on: string;
  company: {
    legal_name: string;
    trade_name?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    tax_registration_number?: string;
    bank_details?: string;
    invoice_footer?: string;
    quotation_terms?: string;
  };
  customer: { name: string; number: string; phone?: string; email?: string; address?: string };
  vehicle?: {
    title: string;
    stock_id: string;
    brand?: string;
    model?: string;
    year?: number;
    vin?: string;
    mileage_km?: number;
    color?: string;
  };
  showroom?: string;
  salesperson?: string;
  deal_number?: string;
  reservation_number?: string;
  lines?: DocumentLine[];
  total?: number;
  total_label?: string;
  tax_applied?: boolean;
  valid_until?: string;
  received?: number;
  balance?: number;
  payment?: {
    kind: string;
    method: string;
    reference?: string;
    paid_on: string;
    amount: number;
    verified_by?: string;
    verified_at?: string;
  };
  reservation?: {
    starts_at?: string;
    expires_at?: string;
    deposit_required?: number;
    deposit_verified?: number;
    deposit_waived?: boolean;
    waiver_reason?: string;
  };
  note?: string;
}

export interface SalesDocumentRecord {
  doc_type: DocumentType;
  doc_number: string;
  status: DocumentStatus;
  issued_at: string;
  voided_at: string | null;
  void_reason: string | null;
  snapshot: DocumentSnapshot;
}

export type DocumentPdfResult =
  { status: "ok"; record: SalesDocumentRecord } | { status: "not_found" } | { status: "error" };

export interface IssueDocumentResult {
  error: string | null;
  documentId?: string;
  documentNumber?: string;
  /** false when the document already existed and was returned instead. */
  created?: boolean;
}

export interface DocumentActionResult {
  error: string | null;
}

export interface CompanyProfile {
  legalName: string | null;
  tradeName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxRegistrationNumber: string | null;
  bankDetails: string | null;
  quotationTerms: string | null;
  invoiceFooter: string | null;
  quotationValidDays: number;
}