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
  POINTS_NOTE,
  PROMOTIONS_METRICS,
  REVERSAL_NOTE,
  type CampaignPerformanceRow,
  type PointsMovementRow,
  type PromotionsReportData,
} from "@/src/lib/types/report-promotions";
import type { Money } from "@/src/lib/utils/report-money";
import type { ReportRangeId } from "@/src/lib/utils/report-time";

/*
|--------------------------------------------------------------------------
| PROMOTIONS AND LOYALTY
|--------------------------------------------------------------------------
|
| Campaigns, discounts and points, in that order, because that is the order
| in which somebody asks about them: what are we running, what did it cost,
| what do we owe.
|
| Two notes on this page are written rather than computed, and both earn
| their space. The reversal note explains why discount given is lower than
| the sum of the redemption rows — without it the figure looks wrong to
| anybody who checks it against the raw list. The points note explains why
| there are four points figures rather than one, which is the question the
| layout invites.
*/

interface ReportPromotionsClientProps {
  data: PromotionsReportData;
  range: ReportRangeId;
  canSeeFinancial: boolean;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="note"
      className="border-border bg-card-hover flex items-start gap-2.5 rounded-lg border px-4 py-3"
    >
      <Info className="text-text-subtle mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="text-body-sm text-text-muted">{children}</p>
    </div>
  );
}

export function ReportPromotionsClient({
  data,
  range,
  canSeeFinancial,
}: ReportPromotionsClientProps) {
  const { fadeUp } = useMotion();

  const figures: Record<string, ReportFigure<number | Money>> = {
    liveCampaigns: data.liveCampaigns,
    pausedCampaigns: data.pausedCampaigns,
    campaignsInPeriod: data.campaignsInPeriod,
    redemptions: data.redemptions,
    reversals: data.reversals,
    discountGiven: data.discountGiven,
    discountReversed: data.discountReversed,
    /* averageDiscount is ReportFigure<Money | null>: null inside a
       successful figure means there were no redemptions to average, which
       the card renders as nothing rather than as AED 0.00. */
    averageDiscount: {
      ...data.averageDiscount,
      value: data.averageDiscount.value ?? null,
    } as ReportFigure<Money>,
    pointsEarned: data.pointsEarned,
    pointsRedeemed: data.pointsRedeemed,
    pointsExpired: data.pointsExpired,
    pointsNet: data.pointsNet,
    walletsWithBalance: data.walletsWithBalance,
  };

  const visible = PROMOTIONS_METRICS.filter((metric) => canSeeFinancial || !metric.financial);

  const renderCards = (group: "campaigns" | "redemptions" | "loyalty") => (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {visible
        .filter((metric) => metric.group === group)
        .map((metric, index) => (
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
  );

  return (
    <div className="flex flex-col gap-6">
      <ReportPeriodPicker active={range} label={data.rangeLabel} />

      {/* =====================================================
          CAMPAIGNS
      ===================================================== */}

      <section className="flex flex-col gap-4">
        <h2 className="text-h4">Campaigns</h2>

        {renderCards("campaigns")}

        <ReportCountBreakdown
          title="Campaigns by discount type"
          figure={data.byDiscountType}
          nameLabel="Discount type"
          unit="campaigns"
          emptyMessage="No campaigns have been created yet."
        />
      </section>

      {/* =====================================================
          DISCOUNTS
      ===================================================== */}

      <section className="flex flex-col gap-4">
        <h2 className="text-h4">Discounts given</h2>

        {renderCards("redemptions")}

        <Note>{REVERSAL_NOTE}</Note>

        <ReportBreakdownTable<CampaignPerformanceRow>
          title="Campaign take-up"
          description="Campaigns with activity in this period, by discount given."
          rows={data.byCampaign.value}
          columns={[
            { id: "name", label: "Campaign", value: (row) => row.name },
            {
              id: "reference",
              label: "Reference",
              value: (row) => row.reference ?? "",
              render: (row) => row.reference ?? "—",
            },
            {
              id: "redemptions",
              label: "Redemptions",
              align: "right",
              value: (row) => row.redemptions,
              render: (row) => row.redemptions.toLocaleString("en-US"),
            },
            {
              id: "reversals",
              label: "Reversals",
              align: "right",
              value: (row) => row.reversals,
              render: (row) => row.reversals.toLocaleString("en-US"),
            },
            {
              id: "discount",
              label: "Discount given",
              align: "right",
              /* Sorted on chart, which is lossy, and displayed from
                 display, which is not. Sorting on a rounded number only
                 ever misorders two rows that are a fraction of a fils
                 apart; displaying one would be a wrong figure. */
              value: (row) => row.discount.chart,
              render: (row) => row.discount.display,
            },
          ]}
          getRowId={(row) => row.id}
          initialSortId="discount"
          /* The money column is removed outright rather than blanked: a
             column of dashes looks like missing data, not withheld data. */
          hiddenColumnIds={canSeeFinancial ? undefined : ["discount"]}
          emptyMessage="No campaign was redeemed in this period."
          failedLabel="Campaign take-up could not be loaded."
        />
      </section>

      {/* =====================================================
          LOYALTY
      ===================================================== */}

      <section className="flex flex-col gap-4">
        <h2 className="text-h4">Loyalty points</h2>

        {renderCards("loyalty")}

        <Note>{POINTS_NOTE}</Note>

        <ReportBreakdownTable<PointsMovementRow>
          title="Points movement"
          description="Every kind of ledger entry written in this period."
          rows={data.pointsMovement.value}
          columns={[
            { id: "label", label: "Entry type", value: (row) => row.label },
            {
              id: "entries",
              label: "Entries",
              align: "right",
              value: (row) => row.entries,
              render: (row) => row.entries.toLocaleString("en-US"),
            },
            {
              id: "points",
              label: "Points",
              align: "right",
              /* The ledger's own sign is kept here, unlike the summary
                 cards. This table is the reconciliation view: the column
                 adds up to net movement, and it only does that if the
                 negatives stay negative. */
              value: (row) => row.points,
              render: (row) => row.points.toLocaleString("en-US"),
            },
          ]}
          getRowId={(row) => row.id}
          initialSortId="points"
          emptyMessage="No points moved in this period."
          failedLabel="Points movement could not be loaded."
        />
      </section>
    </div>
  );
}
