"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { FileText, TriangleAlert } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { saveCompanyProfileAction } from "@/app/admin/sales/settings/company-actions";
import { useMotion } from "@/src/hooks/use-motion";
import { companyProfileSchema } from "@/src/lib/validation/sales-documents";
import type { CompanyProfile } from "@/src/lib/types/sales-documents";

interface Values {
  legalName: string;
  tradeName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxRegistrationNumber: string;
  bankDetails: string;
  quotationTerms: string;
  invoiceFooter: string;
  quotationValidDays: string;
}

function toValues(profile: CompanyProfile): Values {
  return {
    legalName: profile.legalName ?? "",
    tradeName: profile.tradeName ?? "",
    address: profile.address ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    website: profile.website ?? "",
    taxRegistrationNumber: profile.taxRegistrationNumber ?? "",
    bankDetails: profile.bankDetails ?? "",
    quotationTerms: profile.quotationTerms ?? "",
    invoiceFooter: profile.invoiceFooter ?? "",
    quotationValidDays: String(profile.quotationValidDays),
  };
}

/** Company details printed on quotations, invoices, receipts and reservation confirmations. */
export function CompanyProfileCard({ company }: { company: CompanyProfile | null }) {
  const router = useRouter();
  const { fadeUp } = useMotion();

  const initial = company ? toValues(company) : null;
  const [values, setValues] = useState<Values | null>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const dirty = !!values && !!initial && JSON.stringify(values) !== JSON.stringify(initial);
  const patch = (change: Partial<Values>) =>
    setValues((previous) => (previous ? { ...previous, ...change } : previous));

  const save = async () => {
    if (!values) return;

    const parsed = companyProfileSchema.safeParse({
      ...values,
      quotationValidDays: Number(values.quotationValidDays),
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      });
      setErrors(next);
      toast.error("Please fix the highlighted details.");
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      const result = await saveCompanyProfileAction({
        ...values,
        quotationValidDays: Number(values.quotationValidDays),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Company details saved");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: keyof Values,
    label: string,
    options?: { multiline?: boolean; helper?: string; max?: number },
  ) => {
    if (!values) return null;
    return options?.multiline ? (
      <Textarea
        label={label}
        rows={3}
        maxLength={options.max}
        showCharacterCount
        hint={options.helper}
        error={errors[key]}
        value={values[key]}
        onChange={(event) => patch({ [key]: event.target.value } as Partial<Values>)}
      />
    ) : (
      <Input
        label={label}
        hint={options?.helper}
        error={errors[key]}
        value={values[key]}
        maxLength={options?.max}
        onChange={(event) => patch({ [key]: event.target.value } as Partial<Values>)}
      />
    );
  };

  return (
    <motion.section
      {...fadeUp(5)}
      aria-label="Company details"
      className="surface-card flex flex-col gap-4 p-5"
    >
      <header className="flex items-center gap-2.5">
        <span className="text-primary">
          <FileText className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-h3">Company details for documents</h2>
      </header>

      {!values ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
        >
          The company details couldn&apos;t be loaded. Refresh the page to try again.
        </p>
      ) : (
        <>
          {values.legalName.trim() === "" && (
            <p
              role="status"
              className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
              Documents can&apos;t be created until a company name is saved.
            </p>
          )}

          <p className="text-body-sm text-text-muted">
            These are printed on every quotation, invoice, receipt and reservation confirmation. A document
            keeps the details it was created with, so changing them here never alters one already created.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("legalName", "Company name", { max: 120 })}
            {field("tradeName", "Trading name (optional)", { max: 120 })}
          </div>
          {field("address", "Address", { multiline: true, max: 300 })}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {field("phone", "Phone", { max: 40 })}
            {field("email", "Email", { max: 120 })}
            {field("website", "Website", { max: 120 })}
          </div>
          {field("taxRegistrationNumber", "Tax registration number (TRN)", {
            max: 40,
            helper:
              "Printed on documents when set. Invoices are titled “Sales Invoice” and show tax as not applied until your accountant confirms how VAT applies.",
          })}
          {field("bankDetails", "Bank details for payments", {
            multiline: true,
            max: 600,
            helper: "Shown on invoices under “How to pay”.",
          })}
          {field("quotationTerms", "Quotation terms", { multiline: true, max: 1500 })}
          {field("invoiceFooter", "Invoice notes", { multiline: true, max: 600 })}

          <div className="max-w-xs">
            <Input
              label="Quotation valid for (days)"
              type="number"
              inputMode="numeric"
              min={1}
              max={90}
              error={errors.quotationValidDays}
              value={values.quotationValidDays}
              onChange={(event) => patch({ quotationValidDays: event.target.value })}
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <p role="status" className="text-caption text-text-subtle mr-auto">
              {dirty ? "You have unsaved changes." : "All changes saved."}
            </p>
            <Button
              variant="outline"
              disabled={!dirty || saving}
              onClick={() => initial && setValues(initial)}
            >
              Discard
            </Button>
            <Button variant="gradient" isLoading={saving} disabled={!dirty} onClick={save}>
              Save company details
            </Button>
          </div>
        </>
      )}
    </motion.section>
  );
}
