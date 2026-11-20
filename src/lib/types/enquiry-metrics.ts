/*
|--------------------------------------------------------------------------
| THE NINE FIGURES PHASE 20 PREPARES
|--------------------------------------------------------------------------
|
| The plan asks for these to be prepared, and for the Analytics module
| itself to be built later. So this is the shape the numbers come out in,
| computed and tested, with no dashboard on top of it yet.
|
| Every figure carries the window it was measured over, because a count
| without a period is not a number anybody can act on.
*/

/** A count against a label — by type, by source, by member of staff. */
export interface EnquiryBreakdown {
  label: string;
  count: number;
  /** Share of the total, 0–100, rounded to one place. */
  percent: number;
}

/**
 * How long enquiries wait for a first reply.
 *
 * Measured from arrival to the first *completed contact* — a phone call,
 * WhatsApp or email marked done. Deliberately not measured to assignment:
 * giving an enquiry an owner is not answering the customer, and a metric
 * that counts it as one would report a healthy response time for a showroom
 * that never rings anybody back.
 *
 * Enquiries nobody has replied to yet are counted separately rather than
 * averaged in as zero or dropped. Dropping them is how a response-time
 * figure gets better the longer work is left undone.
 */
export interface EnquiryResponseTime {
  /** Enquiries in the window that have had a first reply. */
  answered: number;
  /** Still waiting, however long they have been waiting. */
  unanswered: number;
  /** Median hours to first reply, of the answered. null when none were. */
  medianHours: number | null;
  /** Mean hours, which one long outlier can move a long way. */
  averageHours: number | null;
  /** Answered within four working hours. */
  withinFourHours: number;
  /** Answered the same day, by the Dubai clock. */
  withinSameDay: number;
}

/** Whether follow-ups actually happen when they were promised. */
export interface EnquiryFollowUpPerformance {
  scheduled: number;
  completed: number;
  missed: number;
  cancelled: number;
  /** Scheduled, still open, and the time has passed. */
  overdue: number;
  /** Completed on or before the time they were scheduled for. */
  completedOnTime: number;
  /** completedOnTime as a share of completed, 0–100. null when none done. */
  onTimePercent: number | null;
}

/** What people are asking for that the showroom hasn't got. */
export interface EnquiryDreamCarDemand {
  requests: number;
  /** Requests a person has linked a car in stock to. */
  matched: number;
  /** The brands asked for most, with how many asked. */
  topBrands: EnquiryBreakdown[];
}

export interface EnquiryMetrics {
  /** Inclusive start and exclusive end of the window, as ISO timestamps. */
  from: string;
  to: string;

  /** Live enquiries received in the window. */
  total: number;

  byType: EnquiryBreakdown[];
  bySource: EnquiryBreakdown[];
  byStaff: EnquiryBreakdown[];

  /**
   * Finished well, as a share of those received in the window, 0–100.
   *
   * Spam is left out of both halves: counting it would make a week of junk
   * look like a week of poor performance.
   */
  completionRate: number | null;
  completed: number;
  stillOpen: number;

  responseTime: EnquiryResponseTime;
  followUps: EnquiryFollowUpPerformance;
  dreamCars: EnquiryDreamCarDemand;

  /** Trade-In and Sell My Car volume, which the showroom buys against. */
  sellAndTradeIn: number;
  financeEnquiries: number;

  /**
   * True when a window held more rows than one read returns, so the figures
   * cover a sample rather than everything.
   *
   * Surfaced rather than hidden: a dashboard that quietly truncates is worse
   * than one that says it did.
   */
  capped: boolean;
}

/** Share of a total as a percentage, to one decimal place. */
export function share(count: number, total: number): number {
  if (total <= 0) return 0;

  return Math.round((count / total) * 1000) / 10;
}

/** The middle value, averaging the two middles of an even-length list. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  const value = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;

  return Math.round(value * 10) / 10;
}
