import { formatDay } from "@/src/lib/utils/test-drive-format";

/*
|--------------------------------------------------------------------------
| WHERE A CAMPAIGN IS IN ITS WINDOW
|--------------------------------------------------------------------------
|
| All the date reasoning for a campaign's dates, in one place and out of the
| component — so it can be checked against a worked example instead of a
| rendered screen, and so `Date.now()` is not called during a render.
|
| Dubai is UTC+04:00 all year, so a day bucket needs no DST handling.
*/

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** The Dubai calendar day a timestamp falls on. */
export function dubaiDay(iso: string): string {
  return new Date(Date.parse(iso) + 4 * HOUR).toISOString().slice(0, 10);
}

export interface CampaignWindow {
  /** The dates as a phrase, including the no-dates case. */
  label: string;
  /**
   * How far through, 0–100. Null when there is nothing to measure — a
   * campaign with no end has no proportion, and a bar at an invented 50%
   * would be a lie with a shape.
   */
  progress: number | null;
  /** "3 days left", "ends today", "ended", or null when there is no end. */
  remaining: string | null;
  /** True once the end has passed. */
  hasEnded: boolean;
  /** True while the start is still ahead. */
  notStarted: boolean;
}

/**
 * `now` is a parameter so a test does not depend on the clock, and so the
 * impure call sits here rather than inside a component's render.
 */
export function describeCampaignWindow(
  startsAt: string | null,
  endsAt: string | null,
  now: number = Date.now(),
): CampaignWindow {
  const start = startsAt ? Date.parse(startsAt) : null;
  const end = endsAt ? Date.parse(endsAt) : null;

  const bounded = start !== null && end !== null && end > start;

  const progress = bounded
    ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))
    : null;

  const remaining = (() => {
    if (end === null) return null;
    if (end <= now) return "ended";

    const days = Math.ceil((end - now) / DAY);

    if (days <= 1) return "ends today";
    if (days < 14) return `${days} days left`;
    if (days < 60) return `${Math.round(days / 7)} weeks left`;
    return `${Math.round(days / 30)} months left`;
  })();

  const label =
    start === null && end === null
      ? "No dates set — runs until paused"
      : start !== null && end !== null
        ? `${formatDay(dubaiDay(startsAt!))} to ${formatDay(dubaiDay(endsAt!))}`
        : start !== null
          ? `From ${formatDay(dubaiDay(startsAt!))}`
          : `Until ${formatDay(dubaiDay(endsAt!))}`;

  return {
    label,
    progress,
    remaining,
    hasEnded: end !== null && end <= now,
    notStarted: start !== null && start > now,
  };
}
