"use client";

import { Skeleton } from "@/src/components/ui/skeleton";
import { FormSection } from "@/src/components/test-drives/form/form-section";
import { formatDay } from "@/src/lib/utils/test-drive-format";
import type { SearchResult, TestDriveLeadOption } from "@/src/lib/types/test-drive";

interface DealLeadSectionProps {
  hasCustomer: boolean;
  vehicleId: string;
  /** null while loading. */
  leads: SearchResult<TestDriveLeadOption> | null;
  leadId: string | null;
  onChange: (leadId: string | null) => void;
  error?: string;
    step?: number;
  description?: string;
}

const OPTION_CLASS =
  "border-border bg-card hover:border-primary/40 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-primary flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2";

export function DealLeadSection({
  hasCustomer,
  vehicleId,
  leads,
  leadId,
  onChange,
  error,
  step = 3,
  description = "Link the lead this deal came from, so the original source is kept. Optional.",
}: DealLeadSectionProps) {
  return (
        <FormSection step={step} title="Lead" description={description}>
      {!hasCustomer ? (
        <p className="text-body-sm text-text-muted">Choose a customer first to see their open leads.</p>
      ) : leads === null ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading leads">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : leads.failed ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          The customer&apos;s leads couldn&apos;t be loaded. You can still create the deal and link a lead later.
        </p>
      ) : leads.results.length === 0 ? (
        <p className="text-body-sm text-text-muted">
          This customer has no open leads. The deal can still be created without one.
        </p>
      ) : (
        <fieldset className="flex flex-col gap-2" aria-describedby={error ? "deal-lead-error" : undefined}>
          <legend className="sr-only">Choose a lead</legend>

          <label className={OPTION_CLASS}>
            <input
              type="radio"
              name="deal-lead"
              checked={leadId === null}
              onChange={() => onChange(null)}
              className="accent-primary mt-1 size-4"
            />
            <span className="text-body-sm text-text-primary">Don&apos;t link a lead</span>
          </label>

          {leads.results.map((lead) => (
            <label key={lead.id} className={OPTION_CLASS}>
              <input
                type="radio"
                name="deal-lead"
                checked={leadId === lead.id}
                onChange={() => onChange(lead.id)}
                className="accent-primary mt-1 size-4"
              />
              <span className="min-w-0 flex-1">
                <span className="text-body-sm text-text-primary flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium">
                  {lead.lead_number}
                  <span className="text-caption text-text-subtle font-normal">{lead.stage_name}</span>
                  {vehicleId && lead.car_id === vehicleId && (
                    <span className="bg-primary/15 text-caption text-primary-text rounded-full px-1.5 py-0.5">
                      Same vehicle
                    </span>
                  )}
                </span>
                <span className="text-caption text-text-subtle block truncate">
                  {lead.vehicle_title ?? "No vehicle chosen"} · created {formatDay(lead.created_at)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {error && (
        <p id="deal-lead-error" role="alert" className="text-body-sm text-red-500">
          {error}
        </p>
      )}
    </FormSection>
  );
}