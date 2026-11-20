import { median, share, type EnquiryBreakdown, type EnquiryMetrics } from "@/src/lib/types/enquiry-metrics";

/*
|--------------------------------------------------------------------------
| WORKING THE NINE FIGURES OUT
|--------------------------------------------------------------------------
|
| Pure arithmetic, separated from the three reads that feed it, so each
| definition can be checked against a worked example instead of against a
| database. These are numbers somebody would make a decision on — how fast
| the showroom replies, whether follow-ups actually happen — and a quiet
| off-by-one in any of them is worse than no figure at all.
*/

/** Four working hours, in milliseconds. */
const FOUR_HOURS = 4 * 60 * 60 * 1000;

const HOUR = 60 * 60 * 1000;

/** Contact that counts as replying to the customer. */
const CONTACT_TYPES = new Set(["Phone Call", "WhatsApp", "Email"]);

export interface MetricsEnquiryRow {
  id: string;
  enquiry_type: string | null;
  source: string | null;
  status: string;
  assigned_to_name: string | null;
  created_at: string;
  status_is_open: boolean;
}

export interface MetricsFollowUpRow {
  enquiry_id: string;
  type: string;
  status: string;
  scheduled_at: string;
  completed_at: string | null;
}

export interface MetricsDreamRow {
  enquiry_id: string;
  brand_other: string | null;
  matched_car_id: string | null;
  brandName: string | null;
}

/** Count by key, biggest first, with each one's share of the total. */
export function breakdown(values: (string | null)[], fallback: string, limit?: number): EnquiryBreakdown[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    const label = value?.trim() || fallback;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const total = values.length;

  const rows = [...counts.entries()]
    .map(([label, count]) => ({ label, count, percent: share(count, total) }))
    /* Count first, then name, so equal counts come out in a stable order. */
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return limit === undefined ? rows : rows.slice(0, limit);
}

/** The Dubai calendar day a timestamp falls on. Dubai is UTC+4 all year. */
export function dubaiDay(iso: string): string {
  return new Date(Date.parse(iso) + 4 * HOUR).toISOString().slice(0, 10);
}

interface ComputeInput {
  from: string;
  to: string;
  enquiries: MetricsEnquiryRow[];
  followUps: MetricsFollowUpRow[];
  dreamCars: MetricsDreamRow[];
  /** Status keys the workflow calls finished. */
  closedStatuses: Set<string>;
  /** True when any read hit its ceiling. */
  capped: boolean;
  /** Taken as "now" for overdue counts. Passed in so a test can fix it. */
  now?: number;
}

export function computeEnquiryMetrics(input: ComputeInput): EnquiryMetrics {
  const { enquiries, followUps, dreamCars, closedStatuses } = input;
  const now = input.now ?? Date.now();

  const total = enquiries.length;

  /* =======================================================
     BREAKDOWNS
  ======================================================= */

  const byType = breakdown(
    enquiries.map((row) => row.enquiry_type),
    "Unknown",
  );

  const bySource = breakdown(
    enquiries.map((row) => row.source),
    "Unknown",
  );

  const byStaff = breakdown(
    enquiries.map((row) => row.assigned_to_name),
    "Unassigned",
  );

  /* =======================================================
     COMPLETION
  ======================================================= */

  const completed = enquiries.filter((row) => closedStatuses.has(row.status)).length;
  const stillOpen = enquiries.filter((row) => row.status_is_open).length;

  /* =======================================================
     RESPONSE TIME

     First completed contact per enquiry — a reply to the customer, not
     somebody taking ownership of the row.
  ======================================================= */

  const firstReply = new Map<string, number>();

  for (const followUp of followUps) {
    if (followUp.status !== "Completed" || !followUp.completed_at) continue;
    if (!CONTACT_TYPES.has(followUp.type)) continue;

    const at = Date.parse(followUp.completed_at);
    const existing = firstReply.get(followUp.enquiry_id);

    if (existing === undefined || at < existing) firstReply.set(followUp.enquiry_id, at);
  }

  const waits: number[] = [];
  let withinFourHours = 0;
  let withinSameDay = 0;

  for (const row of enquiries) {
    const replied = firstReply.get(row.id);
    if (replied === undefined) continue;

    const received = Date.parse(row.created_at);

    /*
     * A reply logged as happening before the enquiry arrived is somebody
     * back-dating a call about something else. It still counts as answered,
     * but it must not pull the average below zero.
     */
    const wait = Math.max(replied - received, 0);

    waits.push(Math.round((wait / HOUR) * 10) / 10);

    if (wait <= FOUR_HOURS) withinFourHours += 1;
    if (dubaiDay(row.created_at) === dubaiDay(new Date(replied).toISOString())) withinSameDay += 1;
  }

  const averageHours =
    waits.length === 0
      ? null
      : Math.round((waits.reduce((sum, value) => sum + value, 0) / waits.length) * 10) / 10;

  /* =======================================================
     FOLLOW-UP PERFORMANCE
  ======================================================= */

  let scheduled = 0;
  let followUpsCompleted = 0;
  let missed = 0;
  let cancelled = 0;
  let overdue = 0;
  let completedOnTime = 0;

  for (const followUp of followUps) {
    switch (followUp.status) {
      case "Scheduled":
      case "Rescheduled":
        scheduled += 1;
        if (Date.parse(followUp.scheduled_at) < now) overdue += 1;
        break;

      case "Completed":
        followUpsCompleted += 1;
        if (followUp.completed_at && Date.parse(followUp.completed_at) <= Date.parse(followUp.scheduled_at)) {
          completedOnTime += 1;
        }
        break;

      case "Missed":
        missed += 1;
        break;

      case "Cancelled":
        cancelled += 1;
        break;
    }
  }

  /* =======================================================
     DREAM CARS, SELL / TRADE-IN, FINANCE
  ======================================================= */

  const countType = (...types: string[]) =>
    enquiries.filter((row) => row.enquiry_type !== null && types.includes(row.enquiry_type)).length;

  return {
    from: input.from,
    to: input.to,
    total,
    byType,
    bySource,
    byStaff,
    completionRate: total === 0 ? null : share(completed, total),
    completed,
    stillOpen,
    responseTime: {
      answered: waits.length,
      unanswered: total - waits.length,
      medianHours: median(waits),
      averageHours,
      withinFourHours,
      withinSameDay,
    },
    followUps: {
      scheduled,
      completed: followUpsCompleted,
      missed,
      cancelled,
      overdue,
      completedOnTime,
      onTimePercent: followUpsCompleted === 0 ? null : share(completedOnTime, followUpsCompleted),
    },
    dreamCars: {
      requests: dreamCars.length,
      matched: dreamCars.filter((row) => row.matched_car_id !== null).length,
      topBrands: breakdown(
        dreamCars.map((row) => row.brandName ?? row.brand_other),
        "Not said",
        5,
      ),
    },
    sellAndTradeIn: countType("Trade-In", "Sell My Car"),
    financeEnquiries: countType("Finance"),
    capped: input.capped,
  };
}
