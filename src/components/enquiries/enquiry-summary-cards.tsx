"use client";

import { CalendarClock, CheckCircle2, Flame, Inbox, Layers, Loader } from "lucide-react";

import { MetricCard } from "@/src/components/shared/metric-card";
import type { EnquirySummary } from "@/src/lib/types/enquiry";

/* =========================================================
   EMPTY SUMMARY

   What the cards show when the figures couldn't be read. Zeros with a
   warning above them, rather than an empty space where six cards were:
   the layout stays put and the message says why they are all zero.
========================================================= */

const EMPTY: EnquirySummary = {
  total: 0,
  newCount: 0,
  inProgress: 0,
  followUpsDue: 0,
  followUpsOverdue: 0,
  completed: 0,
  urgent: 0,
  last30: null,
  previous30: null,
  trend: null,
};

/* =========================================================
   HELPERS
========================================================= */

/**
 * The change between two equal windows, as a percentage.
 *
 * undefined when there is nothing honest to say: either half is missing, or
 * the earlier window was empty, in which case the increase is not a
 * percentage of anything. The card falls back to its caption.
 */
function percentChange(current: number | null, previous: number | null): number | undefined {
  if (current === null || previous === null || previous === 0) return undefined;

  return Math.round(((current - previous) / previous) * 100);
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/* =========================================================
   COMPONENT
========================================================= */

interface EnquirySummaryCardsProps {
  /** null means the figures couldn't be read. */
  summary: EnquirySummary | null;
}

/**
 * The six figures above the enquiry list.
 *
 * Each card says what it counts in its caption, because "Completed" and
 * "In Progress" mean whatever a dealership decides they mean, and a number
 * nobody can define is a number nobody trusts.
 *
 * Only Total carries a comparison and a sparkline. The other five are queue
 * depths — how many are sitting there right now — and a queue depth has no
 * history to compare against unless somebody snapshots it nightly, which
 * nothing here does. Inventing one would make the dashboard look better and
 * be worth less.
 */
export function EnquirySummaryCards({ summary }: EnquirySummaryCardsProps) {
  const s = summary ?? EMPTY;

  const change = percentChange(s.last30, s.previous30);

  /* A share of the whole is a real figure, not a trend. */
  const completionRate = s.total > 0 ? Math.round((s.completed / s.total) * 100) : null;

  return (
    <section aria-label="Enquiry summary" className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      <MetricCard
        label="Total Enquiries"
        value={s.total}
        icon={<Layers />}
        accent="primary"
        change={change}
        comparisonLabel="vs previous 30 days"
        trend={s.trend ?? undefined}
        caption={s.last30 === null ? "All time" : `${s.last30} in the last 30 days`}
      />

      <MetricCard
        label="New Requests"
        value={s.newCount}
        icon={<Inbox />}
        accent="info"
        caption="Nobody has picked these up"
      />

      <MetricCard
        label="In Progress"
        value={s.inProgress}
        icon={<Loader />}
        accent="muted"
        caption="Open, with someone on it"
      />

      <MetricCard
        label="Pending Follow-Ups"
        value={s.followUpsDue}
        icon={<CalendarClock />}
        accent="warning"
        caption={
          s.followUpsOverdue > 0
            ? `${s.followUpsOverdue} ${plural(s.followUpsOverdue, "is", "are")} already due`
            : "All still ahead of time"
        }
      />

      <MetricCard
        label="Completed"
        value={s.completed}
        icon={<CheckCircle2 />}
        accent="success"
        caption={completionRate === null ? "Finished or converted" : `${completionRate}% of every enquiry`}
      />

      <MetricCard
        label="Urgent Requests"
        value={s.urgent}
        icon={<Flame />}
        accent="danger"
        caption="Open, marked Urgent or High"
      />
    </section>
  );
}
