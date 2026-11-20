"use client";

import { Banknote, Info } from "lucide-react";

import {
  EnquiryField,
  EnquiryFieldEmpty,
  EnquirySection,
} from "@/src/components/enquiries/enquiry-detail-section";
import { financeAmount, type EnquiryFinanceDetails } from "@/src/lib/types/enquiry-details";
import { formatMoney } from "@/src/lib/utils/sales-format";

interface EnquiryFinanceCardProps {
  details: EnquiryFinanceDetails;
  index?: number;
}

/**
 * The finance figures behind one enquiry.
 *
 * Says plainly what it is at the bottom, because a screen full of prices,
 * terms and monthly amounts looks like an approved deal, and somebody
 * reading it quickly between calls could repeat it to a customer as one.
 */
export function EnquiryFinanceCard({ details, index = 0 }: EnquiryFinanceCardProps) {
  const balance = financeAmount(details);

  return (
    <EnquirySection
      title="Finance request"
      index={index}
      icon={<Banknote className="size-4" aria-hidden="true" />}
      description="What the customer said they had in mind."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <EnquiryField label="Vehicle price">
          {details.vehiclePrice === null ? (
            <EnquiryFieldEmpty>Not discussed</EnquiryFieldEmpty>
          ) : (
            formatMoney(details.vehiclePrice)
          )}
        </EnquiryField>

        <EnquiryField label="Down payment">
          {details.downPayment === null ? (
            <EnquiryFieldEmpty>Not discussed</EnquiryFieldEmpty>
          ) : (
            formatMoney(details.downPayment)
          )}
        </EnquiryField>

        <EnquiryField label="Preferred term">
          {details.termMonths === null ? (
            <EnquiryFieldEmpty>Not discussed</EnquiryFieldEmpty>
          ) : (
            `${details.termMonths} months`
          )}
        </EnquiryField>

        <EnquiryField label="Monthly budget">
          {details.monthlyBudget === null ? (
            <EnquiryFieldEmpty>Not discussed</EnquiryFieldEmpty>
          ) : (
            formatMoney(details.monthlyBudget)
          )}
        </EnquiryField>

        <EnquiryField label="Employment">
          {details.employmentType ?? <EnquiryFieldEmpty>Not discussed</EnquiryFieldEmpty>}
        </EnquiryField>

        <EnquiryField label="Bank mentioned">
          {details.bankPreference ?? <EnquiryFieldEmpty>None</EnquiryFieldEmpty>}
        </EnquiryField>
      </div>

      {balance !== null && (
        <EnquiryField label="Left to finance">
          <span className="text-body font-medium">{formatMoney(balance)}</span>
        </EnquiryField>
      )}

      {details.notes && <EnquiryField label="Notes">{details.notes}</EnquiryField>}

      <p className="text-caption text-text-subtle flex items-start gap-2">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />A request for help arranging finance.
        Nothing here is checked, approved, or an offer.
      </p>
    </EnquirySection>
  );
}
