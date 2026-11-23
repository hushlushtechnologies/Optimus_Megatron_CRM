"use client";

import { motion } from "motion/react";
import { Info } from "lucide-react";

import { ReportBreakdownTable } from "@/src/components/report/report-breakdown-table";
import { ReportFigureCard } from "@/src/components/report/report-figure-card";
import { ReportPeriodPicker } from "@/src/components/report/report-period-picker";
import { useMotion } from "@/src/hooks/use-motion";
import { figureOf, type ReportFigure } from "@/src/lib/supabase/report-aggregate";
import {
  AGEING_BUCKETS,
  AGEING_BASIS_NOTE,
  INVENTORY_METRICS,
  NO_COST_DATA_NOTE,
  type AgeingBucket,
  type InventoryBreakdownRow,
  type InventoryReportData,
} from "@/src/lib/types/report-inventory";
import type { Money } from "@/src/lib/utils/report-money";
import type { ReportRangeId } from "@/src/lib/utils/report-time";

/*
|--------------------------------------------------------------------------
| THE INVENTORY REPORT
|--------------------------------------------------------------------------
|
| Stock by status, by brand, by collection, by showroom, and how long it has
| been sitting.
|
| Two notes appear on this page that are not figures, and both are there
| because leaving them off would make the numbers mean something they do not:
|
|   the ageing basis     ageing runs from the record's creation date,
|                        because this schema has no date-received column
|   the cost note        there is no acquisition cost anywhere, so there is
|                        no profit or margin here and nobody should go
|                        looking for one
|
| Status counts come from the database's own vehicle_statuses lookup, so what
| appears here is whatever statuses the business actually uses.
*/

interface ReportInventoryClientProps {
  data: InventoryReportData;
  range: ReportRangeId;
  canSeeFinancial: boolean;
}

/** Pull one status count out by slug, as a figure the card can render. */
function statusFigure(data: InventoryReportData, slug: string): ReportFigure<number> {
  if (data.byStatus.value === null) {
    return { value: null, complete: false, total: null, error: data.byStatus.error };
  }

  const match = data.byStatus.value.find((status) => status.slug === slug);

  /*
   * A status the business does not use is zero, not a failure: a showroom
   * with no coming-soon stock should see 0, not "Unavailable".
   */
  return figureOf(match?.count ?? 0);
}

export function ReportInventoryClient({
  data,
  range,
  canSeeFinancial,
}: ReportInventoryClientProps) {
  const { fadeUp } = useMotion();

  const cards = INVENTORY_METRICS.filter((metric) => canSeeFinancial || !metric.financial);

  const figures: Record<string, ReportFigure<number | Money>> = {
    total: data.total,
    available: statusFigure(data, "available"),
    reserved: statusFigure(data, "reserved"),
    sold: statusFigure(data, "sold"),
    availableValue: data.availableValue,
    addedInPeriod: data.addedInPeriod,
    slowMoving: data.slowMoving,
  };

  const hiddenColumnIds = canSeeFinancial ? undefined : ["value"];

  /* A breakdown's columns. Shared by brand, collection and showroom so the
     three tables cannot drift apart. */
  const breakdownColumns = (nameLabel: string) => [
    { id: "name", label: nameLabel, value: (row: InventoryBreakdownRow) => row.name },
    {
      id: "count",
      label: "Vehicles",
      align: "right" as const,
      value: (row: InventoryBreakdownRow) => row.count,
      render: (row: InventoryBreakdownRow) => row.count.toLocaleString("en-US"),
    },
    {
      id: "value",
      label: "Listed value",
      align: "right" as const,
      value: (row: InventoryBreakdownRow) => row.value.chart,
      render: (row: InventoryBreakdownRow) => row.value.display,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ReportPeriodPicker active={range} label={data.rangeLabel} />

      {/* The period only affects "Added in period". Everything else is a
          picture of stock right now, and saying so prevents somebody
          reading "Available: 42" as "42 became available this month". */}
      <div
        role="note"
        className="border-border bg-card-hover flex items-start gap-2.5 rounded-lg border px-4 py-3"
      >
        <Info className="text-text-subtle mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="text-body-sm text-text-muted">
          Stock figures describe inventory as it stands now. Only “Added in period” uses the selected
          period. {canSeeFinancial ? NO_COST_DATA_NOTE : ""}
        </p>
      </div>

      <section
        aria-label="Stock levels"
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4"
      >
        {cards.map((metric, index) => (
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

      {/* Draft is a PUBLISHING status, not an availability one, so a car can
          be both available and draft. It sits apart from the row above for
          that reason — adding it in would double-count. */}
      {data.draft.value !== null && data.draft.value > 0 && (
        <p className="text-caption text-text-subtle">
          {data.draft.value.toLocaleString("en-US")} of these are still unpublished drafts. Publishing
          status is separate from availability, so a draft may also be counted as available above.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ReportBreakdownTable<InventoryBreakdownRow>
          title="By brand"
          rows={data.byBrand.value}
          getRowId={(row) => row.id}
          initialSortId="count"
          shareValue={(row) => row.count}
          emptyMessage="No vehicles match this view."
          failedLabel="the brand breakdown"
          columns={breakdownColumns("Brand")}
          hiddenColumnIds={hiddenColumnIds}
        />

        <ReportBreakdownTable<InventoryBreakdownRow>
          title="By collection"
          rows={data.byCollection.value}
          getRowId={(row) => row.id}
          initialSortId="count"
          shareValue={(row) => row.count}
          emptyMessage="No vehicles match this view."
          failedLabel="the collection breakdown"
          columns={breakdownColumns("Collection")}
          hiddenColumnIds={hiddenColumnIds}
        />

        <ReportBreakdownTable<InventoryBreakdownRow>
          title="By showroom"
          rows={data.byLocation.value}
          getRowId={(row) => row.id}
          initialSortId="count"
          shareValue={(row) => row.count}
          emptyMessage="No vehicles match this view."
          failedLabel="the showroom breakdown"
          columns={breakdownColumns("Showroom")}
          hiddenColumnIds={hiddenColumnIds}
        />

        <ReportBreakdownTable<AgeingBucket>
          title="How long available stock has been listed"
          description={AGEING_BASIS_NOTE}
          rows={data.ageing.value}
          getRowId={(row) => row.id}
          initialSortId="bucket"
          shareValue={(row) => row.count}
          emptyMessage="No available vehicles to age."
          failedLabel="the ageing breakdown"
          columns={[
            {
              id: "bucket",
              label: "In stock",
              /*
               * Sorted on the bucket's position, not its label. Sorting on
               * the text puts "Over 90 days" before "Under 30 days", which
               * reads as a broken table rather than a sorted one.
               *
               * The table defaults to descending, so the oldest stock lands
               * at the top — which is the right default for an ageing
               * report: the stale vehicles are the ones worth looking at.
               */
              value: (row) => AGEING_BUCKETS.findIndex((bucket) => bucket.id === row.id),
              render: (row) => row.label,
            },
            {
              id: "count",
              label: "Vehicles",
              align: "right",
              value: (row) => row.count,
              render: (row) => row.count.toLocaleString("en-US"),
            },
            {
              id: "value",
              label: "Listed value",
              align: "right",
              value: (row) => row.value.chart,
              render: (row) => row.value.display,
            },
          ]}
          hiddenColumnIds={hiddenColumnIds}
        />
      </div>

      {!canSeeFinancial && (
        <p className="text-caption text-text-subtle">
          Listed values are not shown with your current access.
        </p>
      )}
    </div>
  );
}
