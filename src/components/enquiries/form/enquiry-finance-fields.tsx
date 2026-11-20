"use client";

import { Info } from "lucide-react";

import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";

import {
  EMPLOYMENT_TYPES,
  FINANCE_TERMS,
  financeAmount,
  financeIsPlausible,
  type EnquiryFinanceDetails,
} from "@/src/lib/types/enquiry-details";
import { formatMoney } from "@/src/lib/utils/sales-format";

interface EnquiryFinanceFieldsProps {
  value: EnquiryFinanceDetails;
  onChange: (next: EnquiryFinanceDetails) => void;
}

/* =========================================================
   HELPERS
========================================================= */

/**
 * A number box that tells empty apart from zero.
 *
 * An empty box means the customer didn't say, which is a different fact from
 * them saying nothing down. Storing 0 for both would turn "didn't ask" into
 * "asked for no deposit".
 */
function MoneyInput({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <Input
      label={label}
      hint={hint}
      type="number"
      inputMode="decimal"
      min={0}
      step={500}
      placeholder="AED"
      value={value === null ? "" : String(value)}
      onChange={(event) => {
        const raw = event.target.value;
        onChange(raw === "" ? null : Number(raw));
      }}
    />
  );
}

/* =========================================================
   COMPONENT
========================================================= */

/**
 * What a finance enquiry asks for beyond the shared fields.
 *
 * Every figure here is what the customer said they had in mind. Nothing is
 * verified, nothing is an application, and nothing is an approval.
 *
 * There is deliberately no income field, no document upload and no
 * identification. A dealership CRM has no secure workflow for any of those
 * yet, and a field that exists will be filled in eventually — so the safest
 * version of this form is the one that cannot collect them.
 */
export function EnquiryFinanceFields({ value, onChange }: EnquiryFinanceFieldsProps) {
  const set = <K extends keyof EnquiryFinanceDetails>(key: K, next: EnquiryFinanceDetails[K]) => {
    onChange({ ...value, [key]: next });
  };

  const balance = financeAmount(value);
  const plausible = financeIsPlausible(value);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyInput
          label="Vehicle price"
          hint="What the conversation was built on."
          value={value.vehiclePrice}
          onChange={(next) => set("vehiclePrice", next)}
        />

        <MoneyInput
          label="Down payment they have in mind"
          value={value.downPayment}
          onChange={(next) => set("downPayment", next)}
        />

        <Select
          label="Preferred term"
          options={[
            { value: "", label: "Not discussed" },
            ...FINANCE_TERMS.map((months) => ({
              value: String(months),
              label: `${months} months${months % 12 === 0 ? ` · ${months / 12} year${months === 12 ? "" : "s"}` : ""}`,
            })),
          ]}
          value={value.termMonths === null ? "" : String(value.termMonths)}
          onChange={(event) => set("termMonths", event.target.value ? Number(event.target.value) : null)}
        />

        <MoneyInput
          label="Monthly budget"
          hint="Roughly what they said they could manage."
          value={value.monthlyBudget}
          onChange={(next) => set("monthlyBudget", next)}
        />

        <Select
          label="Employment"
          options={[
            { value: "", label: "Not discussed" },
            ...EMPLOYMENT_TYPES.map((item) => ({ value: item, label: item })),
          ]}
          value={value.employmentType ?? ""}
          onChange={(event) =>
            set("employmentType", (event.target.value || null) as EnquiryFinanceDetails["employmentType"])
          }
        />

        <Input
          label="Bank they mentioned"
          placeholder="If they named one"
          maxLength={120}
          value={value.bankPreference ?? ""}
          onChange={(event) => set("bankPreference", event.target.value || null)}
        />
      </div>

      {/*
        Arithmetic on two numbers the person just typed, shown back so they
        can see whether it reads right. Not a quote, and not stored.
      */}
      {balance !== null && (
        <p className="text-body-sm text-text-muted bg-card-hover flex items-start gap-2 rounded-md px-3 py-2.5">
          <Info className="text-text-subtle mt-0.5 size-4 shrink-0" aria-hidden="true" />

          <span>
            That leaves <span className="text-text-primary font-medium">{formatMoney(balance)}</span> to
            finance.
            {plausible === false && (
              <>
                {" "}
                Their monthly budget looks short of covering it over {value.termMonths ?? 0} months — worth
                raising before it goes to a bank.
              </>
            )}
          </span>
        </p>
      )}

      <Textarea
        label="Anything else about the finance request"
        rows={3}
        maxLength={2000}
        value={value.notes ?? ""}
        onChange={(event) => set("notes", event.target.value || null)}
        hint="No income figures, payslips or ID here — there is nowhere secure to keep them yet."
      />
    </div>
  );
}
