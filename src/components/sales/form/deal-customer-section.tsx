"use client";

import Link from "next/link";
import { CustomerAvatar } from "@/src/components/customers/customer-avatar";
import { FormSection } from "@/src/components/test-drives/form/form-section";
import { SearchSelect } from "@/src/components/test-drives/form/search-select";
import { searchDealCustomersAction } from "@/app/admin/sales/new/actions";
import type { TestDriveCustomerOption } from "@/src/lib/types/test-drive";

interface DealCustomerSectionProps {
  value: TestDriveCustomerOption | null;
  onChange: (customer: TestDriveCustomerOption | null) => void;
  error?: string;
}

function CustomerRow({ customer }: { customer: TestDriveCustomerOption }) {
  return (
    <div className="flex items-center gap-2.5">
      <CustomerAvatar fullName={customer.full_name} photoUrl={customer.photo_url} size="sm" />
      <div className="min-w-0">
        <p className="text-text-primary truncate font-medium">{customer.full_name}</p>
        <p className="text-caption text-text-subtle truncate">
          {customer.customer_number} · {customer.phone}
        </p>
      </div>
    </div>
  );
}

export function DealCustomerSection({ value, onChange, error }: DealCustomerSectionProps) {
  return (
    <FormSection step={1} title="Customer" description="Who is buying the vehicle?">
      <SearchSelect<TestDriveCustomerOption>
        label="Customer"
        required
        placeholder="Search by name, phone number or customer ID…"
        value={value}
        onChange={onChange}
        search={searchDealCustomersAction}
        renderOption={(customer) => <CustomerRow customer={customer} />}
        renderSelected={(customer) => <CustomerRow customer={customer} />}
        emptyMessage="No customers found. Check the spelling, or add them as a new customer."
        error={error}
      />

      <p className="text-caption text-text-subtle">
        Not in the list?{" "}
        <Link
          href="/admin/customers/new"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-text hover:text-primary-hover"
        >
          Add a new customer
          <span className="sr-only"> (opens in a new tab)</span>
        </Link>
        , then search for them here. Searching first avoids duplicate records.
      </p>
    </FormSection>
  );
}