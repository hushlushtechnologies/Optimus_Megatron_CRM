"use client";

import { Info } from "lucide-react";

import { ReportBreakdownTable } from "@/src/components/report/report-breakdown-table";
import { ReportPeriodPicker } from "@/src/components/report/report-period-picker";
import {
  STAFF_ATTRIBUTION_NOTE,
  STAFF_COHORT_NOTE,
  type StaffPerformanceRow,
  type StaffReportData,
} from "@/src/lib/types/report-staff";
import type { ReportRangeId } from "@/src/lib/utils/report-time";

/*
|--------------------------------------------------------------------------
| STAFF PERFORMANCE
|--------------------------------------------------------------------------
|
| One sortable table, and two notes that change how every number in it should
| be read.
|
| The attribution note is the important one. Every figure comes from the
| assignment on the record itself, never the customer's relationship manager —
| because a customer has one relationship manager and can buy three cars from
| three different salespeople.
|
| DELIBERATELY NOT A LEAGUE TABLE
|
| There is no score, no ranking column and no highlighting of a top performer.
| People carry different mixes of work in different showrooms, and a table
| that crowns whoever sold the most expensive car is measuring the stock
| allocation rather than the person.
|
| It sorts by deals owned to begin with and every column is sortable, so a
| reader chooses the comparison they actually want to make.
*/

interface ReportStaffClientProps {
  data: StaffReportData;
  range: ReportRangeId;
  canSeeFinancial: boolean;
}

export function ReportStaffClient({ data, range, canSeeFinancial }: ReportStaffClientProps) {
  const count = data.staffCount.value;

  return (
    <div className="flex flex-col gap-5">
      <ReportPeriodPicker active={range} label={data.rangeLabel} />

      <div
        role="note"
        className="border-border bg-card-hover flex items-start gap-2.5 rounded-lg border px-4 py-3"
      >
        <Info className="text-text-subtle mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="text-body-sm text-text-muted">{STAFF_ATTRIBUTION_NOTE}</p>
          <p className="text-caption text-text-subtle">{STAFF_COHORT_NOTE}</p>
        </div>
      </div>

      <ReportBreakdownTable<StaffPerformanceRow>
        title="By staff member"
        description={
          count === null
            ? undefined
            : `${count.toLocaleString("en-US")} ${count === 1 ? "person" : "people"} with work in this period.`
        }
        rows={data.rows.value}
        getRowId={(row) => row.staffId}
        initialSortId="dealsOwned"
        emptyMessage="Nobody had work assigned in this period."
        failedLabel="the staff breakdown"
        /* No shareValue: a proportion tint would turn this into exactly the
           league table the report is trying not to be. */
        hiddenColumnIds={canSeeFinancial ? undefined : ["completedValue"]}
        columns={[
          { id: "staffName", label: "Staff", value: (row) => row.staffName },
          {
            id: "leadsAssigned",
            label: "Leads",
            align: "right",
            value: (row) => row.leadsAssigned,
            render: (row) => `${row.leadsWon} / ${row.leadsAssigned}`,
          },
          {
            id: "testDrivesAssigned",
            label: "Test drives",
            align: "right",
            value: (row) => row.testDrivesAssigned,
            render: (row) => `${row.testDrivesCompleted} / ${row.testDrivesAssigned}`,
          },
          {
            id: "reservationsOwned",
            label: "Reservations",
            align: "right",
            value: (row) => row.reservationsOwned,
            render: (row) => row.reservationsOwned.toLocaleString("en-US"),
          },
          {
            id: "dealsOwned",
            label: "Deals",
            align: "right",
            value: (row) => row.dealsOwned,
            render: (row) => `${row.dealsCompleted} / ${row.dealsOwned}`,
          },
          {
            id: "enquiriesHandled",
            label: "Enquiries",
            align: "right",
            value: (row) => row.enquiriesHandled,
            render: (row) => `${row.enquiriesCompleted} / ${row.enquiriesHandled}`,
          },
          {
            id: "completedValue",
            label: "Completed value",
            align: "right",
            value: (row) => row.completedValue.chart,
            render: (row) => row.completedValue.display,
          },
        ]}
      />

      {/* The paired columns read "done / assigned", which is compact but not
          self-explanatory, so it is spelled out once underneath rather than
          repeated in six column headers. */}
      <p className="text-caption text-text-subtle">
        Paired figures read as finished out of assigned — so “3 / 8” under Deals means three of
        eight have completed. Sort by any column.
      </p>

      {!canSeeFinancial && (
        <p className="text-caption text-text-subtle">
          Deal values are not shown with your current access.
        </p>
      )}
    </div>
  );
}
