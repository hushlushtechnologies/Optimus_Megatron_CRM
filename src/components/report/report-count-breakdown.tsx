"use client";

import { ReportBreakdownTable } from "@/src/components/report/report-breakdown-table";
import type { ReportFigure } from "@/src/lib/supabase/report-aggregate";
import type { NamedCount } from "@/src/lib/types/report-customers";

/*
|--------------------------------------------------------------------------
| A COUNT BREAKDOWN
|--------------------------------------------------------------------------
|
| Thin wrapper over ReportBreakdownTable for the commonest shape in Sprint 9:
| a list of names with counts.
|
| It exists for one reason — to turn a ReportFigure into the table's props in
| one place. The table takes `rows: TRow[] | null` where null means the
| lookup failed, and a figure carries `value: T | null` meaning the same
| thing. Writing `figure.value` at a dozen call sites would work until
| somebody wrote `figure.value ?? []` instead, at which point a failed query
| would render as an empty breakdown — the exact failure the figure type
| exists to prevent.
|
| A partial breakdown says so under the title rather than in a banner,
| because a reader comparing two breakdowns needs to know which one of them
| is short.
*/

interface ReportCountBreakdownProps {
  title: string;
  description?: string;
  figure: ReportFigure<NamedCount[]>;
  /** Column heading for the name. "Brand", "Stage", "Source". */
  nameLabel: string;
  /** What is being counted. "vehicles", "leads", "customers". */
  unit: string;
  emptyMessage: string;
}

export function ReportCountBreakdown({
  title,
  description,
  figure,
  nameLabel,
  unit,
  emptyMessage,
}: ReportCountBreakdownProps) {
  const partial = figure.value !== null && !figure.complete;

  const note = partial
    ? figure.total === null
      ? "Covers part of this period."
      : `Covers part of ${figure.total.toLocaleString("en-US")} records.`
    : null;

  return (
    <ReportBreakdownTable<NamedCount>
      title={title}
      description={[description, note].filter(Boolean).join(" ") || undefined}
      /* null when the lookup failed — the table renders its own error line. */
      rows={figure.value}
      getRowId={(row) => row.id}
      initialSortId="count"
      shareValue={(row) => row.count}
      emptyMessage={emptyMessage}
      failedLabel={title.toLowerCase()}
      columns={[
        {
          id: "name",
          label: nameLabel,
          value: (row) => row.name,
        },
        {
          id: "count",
          label: unit.charAt(0).toUpperCase() + unit.slice(1),
          align: "right",
          value: (row) => row.count,
          render: (row) => row.count.toLocaleString("en-US"),
        },
      ]}
    />
  );
}
