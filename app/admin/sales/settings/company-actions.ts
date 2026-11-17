"use server";

import { revalidatePath } from "next/cache";
import { beginSalesAction } from "@/src/lib/supabase/sales-permissions";
import { companyProfileSchema } from "@/src/lib/validation/sales-documents";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import type { SettingsActionResult } from "@/src/lib/types/sales-pricing";

export async function saveCompanyProfileAction(input: unknown): Promise<SettingsActionResult> {
  const start = await beginSalesAction("settings");
  if (!start.ok) return { error: start.error };

  const parsed = companyProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the company details and try again." };
  }
  const v = parsed.data;

  const { data, error } = await start.supabase
    .from("sales_company_profile")
    .update({
      legal_name: v.legalName,
      trade_name: v.tradeName,
      address: v.address,
      phone: v.phone,
      email: v.email,
      website: v.website,
      tax_registration_number: v.taxRegistrationNumber,
      bank_details: v.bankDetails,
      quotation_terms: v.quotationTerms,
      invoice_footer: v.invoiceFooter,
      quotation_valid_days: v.quotationValidDays,
      updated_by: start.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");

  if (error) {
    console.error("saveCompanyProfileAction error:", error);
    return { error: mapSalesDbError(error) };
  }
  if (!data || data.length === 0) {
    return { error: "The company details could not be saved. You may not have permission to change them." };
  }

  revalidatePath("/admin/sales/settings");
  return { error: null };
}