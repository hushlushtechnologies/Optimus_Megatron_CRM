import { createClient } from "@/src/lib/supabase/server";
import type {
  CompanyProfile,
  DocumentPdfResult,
  DocumentSnapshot,
  SalesDocumentItem,
  SalesDocumentRecord,
} from "@/src/lib/types/sales-documents";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIST_COLUMNS =
  "id, doc_type, doc_number, status, deal_id, reservation_id, payment_id, valid_until, note, issued_at, issued_by_name, voided_at, voided_by_name, void_reason, total, currency";

/**
 * The documents for a deal and/or a reservation, newest first, as the signed-in person may see them.
 * Returns null (not an empty list) when it can't be loaded.
 */
export async function getSalesDocuments(params: {
  dealId: string | null;
  reservationId: string | null;
}): Promise<SalesDocumentItem[] | null> {
  const targets: string[] = [];
  if (params.dealId && UUID_RE.test(params.dealId)) targets.push(`deal_id.eq.${params.dealId}`);
  if (params.reservationId && UUID_RE.test(params.reservationId)) targets.push(`reservation_id.eq.${params.reservationId}`);
  if (targets.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_document_list")
    .select(LIST_COLUMNS)
    .or(targets.join(","))
    .order("issued_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("getSalesDocuments error:", error);
    return null;
  }

  return ((data ?? []) as unknown as (Omit<SalesDocumentItem, "total"> & { total: number | string | null })[]).map(
    (row) => ({ ...row, total: row.total === null ? null : Number(row.total) }),
  );
}

interface DocumentRow {
  doc_type: SalesDocumentRecord["doc_type"];
  doc_number: string;
  status: SalesDocumentRecord["status"];
  issued_at: string;
  voided_at: string | null;
  void_reason: string | null;
  snapshot: DocumentSnapshot;
}

/** One document with its frozen content, for the PDF. The database applies the same access rules as the lists. */
export async function getDocumentForPdf(id: string): Promise<DocumentPdfResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_documents")
    .select("doc_type, doc_number, status, issued_at, voided_at, void_reason, snapshot")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getDocumentForPdf error:", error);
    return { status: "error" };
  }
  if (!data) return { status: "not_found" };

  return { status: "ok", record: data as unknown as DocumentRow };
}

interface CompanyRow {
  legal_name: string | null;
  trade_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  tax_registration_number: string | null;
  bank_details: string | null;
  quotation_terms: string | null;
  invoice_footer: string | null;
  quotation_valid_days: number | string;
}

/** For the settings page. null when it couldn't be loaded. */
export async function getCompanyProfile(): Promise<CompanyProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_company_profile")
    .select(
      "legal_name, trade_name, address, phone, email, website, tax_registration_number, bank_details, quotation_terms, invoice_footer, quotation_valid_days",
    )
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("getCompanyProfile error:", error);
    return null;
  }

  const row = data as unknown as CompanyRow;
  return {
    legalName: row.legal_name,
    tradeName: row.trade_name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    taxRegistrationNumber: row.tax_registration_number,
    bankDetails: row.bank_details,
    quotationTerms: row.quotation_terms,
    invoiceFooter: row.invoice_footer,
    quotationValidDays: Number(row.quotation_valid_days),
  };
}