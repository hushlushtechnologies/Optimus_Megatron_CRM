"use client";

import { motion } from "motion/react";
import { TriangleAlert } from "lucide-react";

import { ReportFigureCard } from "@/src/components/report/report-figure-card";
import { ReportPeriodPicker } from "@/src/components/report/report-period-picker";
import { useMotion } from "@/src/hooks/use-motion";
import { OVERVIEW_METRICS, type OverviewData } from "@/src/lib/types/report-overview";
import { completenessMessage, completenessOf, type ReportFigure } from "@/src/lib/supabase/report-aggregate";
import type { Money } from "@/src/lib/utils/report-money";
import type { ReportRangeId } from "@/src/lib/utils/report-time";

/*
|--------------------------------------------------------------------------
| THE OVERVIEW
|--------------------------------------------------------------------------
|
| Nine figures, each with its definition and the date that put a record in
| the period, and nothing that is not a real figure.
|
| The money figures are absent — not blank, absent — for anybody without
| reports.financial. A host sees how many cars sold and how many drives
| happened; what any of it was worth is a separate permission.
|
| There is one thing on this page that is not a number: the strip at the top
| saying what the figures do not cover. It appears when a figure covers only
| part of the period, or when one failed. Sprint 6's report had neither, which
| is how a capped total and a failed query both rendered as plain numbers.
*/

interface ReportOverviewClientProps {
  data: OverviewData;
  range: ReportRangeId;
  /** False hides every money figure. */
  canSeeFinancial: boolean;
}

export function ReportOverviewClient({ data, range, canSeeFinancial }: ReportOverviewClientProps) {
  /* The shared hook, which already honours prefers-reduced-motion — the
     same one the sales report uses, so the two pages animate alike. */
  const { fadeUp } = useMotion();

  /*
   * The metrics on show, in registry order, minus the money ones this person
   * may not see. Driven by the registry rather than written out here, so a
   * metric added to the query layer appears without a second edit — and
   * cannot appear with no definition attached, because the registry is where
   * the definition lives.
   */
  const visible = OVERVIEW_METRICS.filter((metric) => canSeeFinancial || !metric.financial);

  const figures: Record<string, ReportFigure<number | Money>> = {
    dealsCompleted: data.dealsCompleted,
    completedValue: data.completedValue,
    collected: data.collected,
    netCash: data.netCash,
    outstanding: data.outstanding,
    newLeads: data.newLeads,
    newCustomers: data.newCustomers,
    testDrivesCompleted: data.testDrivesCompleted,
    reservationsCreated: data.reservationsCreated,
  };

  /* Completeness is judged on what is shown. Warning somebody about a capped
     figure they cannot see would be confusing and slightly alarming. */
  const shown = Object.fromEntries(
    visible.map((metric) => [metric.id, figures[metric.id]]),
  ) as Record<string, ReportFigure<unknown>>;

  const notice = completenessMessage(completenessOf(shown));

  return (
    <div className="flex flex-col gap-5">
      <ReportPeriodPicker active={range} label={data.rangeLabel} />

      {notice && (
        <div
          role="status"
          className="border-warning/40 bg-warning/10 flex items-start gap-2.5 rounded-lg border px-4 py-3"
        >
          <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="text-body-sm text-text-primary">{notice}</p>
        </div>
      )}

      <section
        aria-label="Business overview"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {visible.map((metric, index) => (
          <motion.div key={metric.id} {...fadeUp(index)} className="min-w-0">
            <ReportFigureCard
              label={metric.label}
              definition={metric.definition}
              basis={metric.basis}
              figure={figures[metric.id]}
            />
          </motion.div>
        ))}
      </section>

      {!canSeeFinancial && (
        <p className="text-caption text-text-subtle">
          Money figures are not shown with your current access. Ask an administrator if you need them.
        </p>
      )}
    </div>
  );
}
