"use client";

import { motion } from "motion/react";
import { Info } from "lucide-react";

import { ReportBreakdownTable } from "@/src/components/report/report-breakdown-table";
import { ReportCountBreakdown } from "@/src/components/report/report-count-breakdown";
import { ReportFigureCard } from "@/src/components/report/report-figure-card";
import { ReportPeriodPicker } from "@/src/components/report/report-period-picker";
import { useMotion } from "@/src/hooks/use-motion";
import type { ReportFigure } from "@/src/lib/supabase/report-aggregate";
import {
  COUNTING_NOTE,
  CUSTOMER_LEAD_METRICS,
  type CustomerLeadReportData,
  type LostReasonRow,
} from "@/src/lib/types/report-customers";
import type { Money } from "@/src/lib/utils/report-money";
import type { ReportRangeId } from "@/src/lib/utils/report-time";

/*
|--------------------------------------------------------------------------
| CUSTOMERS AND LEADS
|--------------------------------------------------------------------------
|
| Two halves, deliberately separated on screen as well as in the query layer.
|
| The note between them is the most important thing on the page. Customer
| figures count PEOPLE; lead figures count OPPORTUNITIES. The two sets of
| totals will not reconcile, and a reader who assumes they should will
| conclude the report is broken — or worse, will not notice and will report
| "we have 400 customers" when 400 is the number of leads.
*/

interface ReportCustomersClientProps {
  data: CustomerLeadReportData;
  range: ReportRangeId;
  canSeeFinancial: boolean;
}

export function ReportCustomersClient({
  data,
  range,
  canSeeFinancial,
}: ReportCustomersClientProps) {
  const { fadeUp } = useMotion();

  const figures: Record<string, ReportFigure<number | Money>> = {
    totalCustomers: data.totalCustomers,
    newCustomers: data.newCustomers,
    activeCustomers: data.activeCustomers,
    buyers: data.buyers,
    repeatBuyers: data.repeatBuyers,
    /* averageCustomerValue is ReportFigure<Money | null>: null inside a
       successful figure means "no buyers to average", which is different
       from the lookup failing. The card renders 0 for it rather than
       "Unavailable", so the two cases are coerced here deliberately. */
    averageCustomerValue: {
      ...data.averageCustomerValue,
      value: data.averageCustomerValue.value ?? null,
    } as ReportFigure<Money>,
    totalLeads: data.totalLeads,
    newLeads: data.newLeads,
    wonLeads: data.wonLeads,
    lostLeads: data.lostLeads,
    leadWinRate: data.leadWinRate as ReportFigure<number>,
    followUpCompletion: data.followUpCompletion as ReportFigure<number>,
  };

  const visible = CUSTOMER_LEAD_METRICS.filter(
    (metric) => canSeeFinancial || !metric.financial,
  );

  const customerCards = visible.filter((metric) => metric.group === "customers");
  const leadCards = visible.filter((metric) => metric.group === "leads");

  return (
    <div className="flex flex-col gap-6">
      <ReportPeriodPicker active={range} label={data.rangeLabel} />

      <div
        role="note"
        className="border-border bg-card-hover flex items-start gap-2.5 rounded-lg border px-4 py-3"
      >
        <Info className="text-text-subtle mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="text-body-sm text-text-muted">{COUNTING_NOTE}</p>
      </div>

      {/* =====================================================
          CUSTOMERS — people
      ===================================================== */}

      <section className="flex flex-col gap-4">
        <h2 className="text-h4">Customers</h2>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {customerCards.map((metric, index) => (
            <motion.div key={metric.id} {...fadeUp(index)} className="min-w-0">
              <ReportFigureCard
                label={metric.label}
                definition={metric.definition}
                basis={metric.basis}
                figure={figures[metric.id]}
              />
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ReportCountBreakdown
            title="Where customers came from"
            figure={data.customersBySource}
            nameLabel="Source"
            unit="customers"
            emptyMessage="No customers match this view."
          />
          <ReportCountBreakdown
            title="Customers by showroom"
            figure={data.customersByLocation}
            nameLabel="Showroom"
            unit="customers"
            emptyMessage="No customers match this view."
          />
          <ReportCountBreakdown
            title="Customers by lifecycle"
            description="Set by staff on the customer record, not derived from activity."
            figure={data.customersByLifecycle}
            nameLabel="Status"
            unit="customers"
            emptyMessage="No customers match this view."
          />
        </div>
      </section>

      {/* =====================================================
          LEADS — opportunities
      ===================================================== */}

      <section className="flex flex-col gap-4">
        <h2 className="text-h4">Leads</h2>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {leadCards.map((metric, index) => (
            <motion.div key={metric.id} {...fadeUp(index)} className="min-w-0">
              <ReportFigureCard
                label={metric.label}
                definition={metric.definition}
                basis={metric.basis}
                figure={figures[metric.id]}
                suffix={metric.id === "leadWinRate" || metric.id === "followUpCompletion" ? "%" : undefined}
              />
            </motion.div>
          ))}
        </div>

        {data.followUpsDue.value === 0 && (
          <p className="text-caption text-text-subtle">
            No follow-ups were scheduled to fall in this period, so there is no completion rate to
            report.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ReportCountBreakdown
            title="Leads by stage"
            figure={data.leadsByStage}
            nameLabel="Stage"
            unit="leads"
            emptyMessage="No leads were created in this period."
          />
          <ReportCountBreakdown
            title="Leads by source"
            figure={data.leadsBySource}
            nameLabel="Source"
            unit="leads"
            emptyMessage="No leads were created in this period."
          />
          <ReportCountBreakdown
            title="Leads by staff"
            description="The staff member assigned to the lead."
            figure={data.leadsByStaff}
            nameLabel="Staff"
            unit="leads"
            emptyMessage="No leads were created in this period."
          />
          <ReportCountBreakdown
            title="Leads by temperature"
            figure={data.leadsByTemperature}
            nameLabel="Temperature"
            unit="leads"
            emptyMessage="No leads were created in this period."
          />
        </div>

        <ReportBreakdownTable<LostReasonRow>
          title="Why leads were lost"
          description="Of the leads created in this period that are now lost."
          rows={data.lostReasons.value}
          getRowId={(row) => row.id}
          initialSortId="count"
          shareValue={(row) => row.count}
          emptyMessage="No leads created in this period have been lost."
          failedLabel="the lost reasons breakdown"
          columns={[
            { id: "name", label: "Reason", value: (row) => row.name },
            {
              id: "count",
              label: "Leads",
              align: "right",
              value: (row) => row.count,
              render: (row) => row.count.toLocaleString("en-US"),
            },
            {
              id: "share",
              label: "Share",
              align: "right",
              value: (row) => row.share,
              render: (row) => `${row.share}%`,
            },
          ]}
        />
      </section>

      {!canSeeFinancial && (
        <p className="text-caption text-text-subtle">
          Customer value figures are not shown with your current access.
        </p>
      )}
    </div>
  );
}
