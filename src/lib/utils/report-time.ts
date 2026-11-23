/*
|--------------------------------------------------------------------------
| WHAT A REPORTING PERIOD MEANS
|--------------------------------------------------------------------------
|
| One place decides what "this month" is, for every report, every filter and
| every export. Before this file there were two answers in the codebase and
| they disagreed by four hours.
|
| THE BUG THIS REPLACES
|
| resolveRange() built its boundaries with `new Date(y, m, 1)`, which is
| midnight *in the process's own timezone*. On Vercel and Supabase that
| process runs in UTC, so "this month" began at 2026-11-01T00:00:00Z — which
| is 04:00 on 1 November in Dubai. Every deal completed between midnight and
| 04:00 Dubai on the first of a month was reported in the previous month, and
| nothing on the page said so.
|
| Meanwhile payment recording already used getDubaiToday(), and the Sprint 8
| exports already formatted in Asia/Dubai. So a payment recorded "today" in
| Dubai could legitimately fall outside a report window claiming to cover
| today.
|
| HOW THIS FILE IS CORRECT
|
| Dubai is UTC+04:00 all year. There is no daylight saving and there has not
| been since 1990, so the offset is a constant rather than something that
| needs a timezone database at runtime. A Dubai wall-clock time converts to a
| UTC instant by subtracting four hours, exactly, always.
|
| That constant is asserted in test/report-time-test.mts against Intl, so if
| the assumption ever stops holding the tests fail rather than the reports
| quietly drifting.
|
| TWO KINDS OF COLUMN, TWO KINDS OF BOUNDARY
|
| Some columns are timestamps (completed_at, created_at). Some are calendar
| dates (paid_on, written from getDubaiToday()). Comparing a date column
| against a full ISO timestamp makes Postgres coerce one to the other, and
| which way it goes depends on the session timezone — a second boundary error
| on the single most important figure in the module, verified cash.
|
| So every resolved range carries both forms: `fromIso`/`toIso` for timestamp
| columns and `fromDate`/`toDate` for date columns. Use the one that matches
| the column.
|
| HALF-OPEN, ALWAYS
|
| Ranges are [from, to) — inclusive start, exclusive end. The old code built
| the end of last month as `new Date(y, m, 1, 0, 0, 0, -1)`, a millisecond
| before midnight, which both relies on millisecond precision surviving a
| round trip through Postgres and leaves a one-millisecond hole between two
| adjacent periods. An exclusive end has no hole and no edge case: a deal
| completed at exactly midnight on the 1st belongs to the new month, once.
*/

/** Dubai's offset from UTC, in minutes. Fixed: no daylight saving. */
const DUBAI_OFFSET_MINUTES = 4 * 60;

const DUBAI_OFFSET_MS = DUBAI_OFFSET_MINUTES * 60 * 1000;

export const DUBAI_TIME_ZONE = "Asia/Dubai";

/*
|--------------------------------------------------------------------------
| THE TWO PRIMITIVES
|--------------------------------------------------------------------------
*/

/**
 * The UTC instant at which a given Dubai wall-clock time occurs.
 *
 * `dubaiInstant(2026, 11, 1)` is midnight on 1 November in Dubai, which is
 * 2026-10-31T20:00:00Z. Month is 1-based, because every caller here is
 * working from a human date and `month - 1` at eleven call sites is how an
 * off-by-one month gets into a financial report.
 */
export function dubaiInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - DUBAI_OFFSET_MS);
}

/** The Dubai wall-clock date parts of an instant. Month is 1-based. */
export function dubaiParts(at: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  /** 1 = Monday … 7 = Sunday. The UAE business week starts on Monday. */
  weekday: number;
} {
  /* Shifting by the offset lets the UTC getters read Dubai's wall clock. */
  const shifted = new Date(at.getTime() + DUBAI_OFFSET_MS);

  /* getUTCDay is 0 = Sunday; the business week here starts on Monday. */
  const sunday0 = shifted.getUTCDay();

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: sunday0 === 0 ? 7 : sunday0,
  };
}

/** Today's date in Dubai, as `YYYY-MM-DD`. */
export function dubaiToday(at: Date = new Date()): string {
  const { year, month, day } = dubaiParts(at);
  return toDateString(year, month, day);
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The `YYYY-MM-DD` Dubai calendar date an instant falls on. */
export function dubaiDateOf(at: Date): string {
  const { year, month, day } = dubaiParts(at);
  return toDateString(year, month, day);
}

/*
|--------------------------------------------------------------------------
| RANGES
|--------------------------------------------------------------------------
*/

/**
 * The periods a report can cover.
 *
 * The first five ids are Sprint 6's and keep their exact spelling, because
 * they appear in URLs people have bookmarked and in links already sent
 * around. "year" is this year, not a rolling twelve months, as it always was.
 */
export type ReportRangeId =
  | "today"
  | "yesterday"
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "last-90"
  | "year"
  | "last-year"
  | "all"
  | "custom";

export const REPORT_RANGE_OPTIONS: { id: ReportRangeId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this-week", label: "This week" },
  { id: "last-week", label: "Last week" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "last-90", label: "Last 90 days" },
  { id: "year", label: "This year" },
  { id: "last-year", label: "Last year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom range" },
];

export interface ResolvedRange {
  id: ReportRangeId;
  /** Human label for headers and exports. */
  label: string;
  /** Inclusive start, for timestamp columns. Null means "from the beginning". */
  fromIso: string | null;
  /** **Exclusive** end, for timestamp columns. */
  toIso: string;
  /** Inclusive start, for date columns (`paid_on`). Null means no lower bound. */
  fromDate: string | null;
  /** **Inclusive** end, for date columns. Date columns have no "exclusive" day. */
  toDate: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The day before a `YYYY-MM-DD`, as a `YYYY-MM-DD`. */
function previousDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day));
  instant.setUTCDate(instant.getUTCDate() - 1);
  return toDateString(instant.getUTCFullYear(), instant.getUTCMonth() + 1, instant.getUTCDate());
}

/**
 * Turn a period id into the boundaries a query needs.
 *
 * `at` is injectable so the tests can pin "now" rather than being a different
 * test on the first of the month.
 */
export function resolveReportRange(
  id: ReportRangeId,
  options: { at?: Date; customFrom?: string; customTo?: string } = {},
): ResolvedRange {
  const at = options.at ?? new Date();
  const { year, month, day, weekday } = dubaiParts(at);

  /* The exclusive end of any period ending "now" is the start of tomorrow in
     Dubai, so a deal completed an hour ago is inside the window. */
  const startOfTomorrow = dubaiInstant(year, month, day + 1);
  const today = toDateString(year, month, day);

  const build = (
    rangeId: ReportRangeId,
    label: string,
    from: Date | null,
    toExclusive: Date,
    fromDate: string | null,
    toDate: string,
  ): ResolvedRange => ({
    id: rangeId,
    label,
    fromIso: from?.toISOString() ?? null,
    toIso: toExclusive.toISOString(),
    fromDate,
    toDate,
  });

  switch (id) {
    case "today":
      return build("today", "Today", dubaiInstant(year, month, day), startOfTomorrow, today, today);

    case "yesterday": {
      const start = dubaiInstant(year, month, day - 1);
      const yesterday = dubaiDateOf(start);
      return build(
        "yesterday",
        "Yesterday",
        start,
        dubaiInstant(year, month, day),
        yesterday,
        yesterday,
      );
    }

    case "this-week": {
      /* Monday. The UAE working week has started on Monday since January
         2022, when the weekend moved to Saturday and Sunday. */
      const start = dubaiInstant(year, month, day - (weekday - 1));
      return build("this-week", "This week", start, startOfTomorrow, dubaiDateOf(start), today);
    }

    case "last-week": {
      const thisMonday = dubaiInstant(year, month, day - (weekday - 1));
      const lastMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
      return build(
        "last-week",
        "Last week",
        lastMonday,
        thisMonday,
        dubaiDateOf(lastMonday),
        previousDate(dubaiDateOf(thisMonday)),
      );
    }

    case "this-month": {
      const start = dubaiInstant(year, month, 1);
      return build(
        "this-month",
        `${MONTH_NAMES[month - 1]} ${year}`,
        start,
        startOfTomorrow,
        toDateString(year, month, 1),
        today,
      );
    }

    case "last-month": {
      const start = dubaiInstant(year, month - 1, 1);
      const end = dubaiInstant(year, month, 1);
      const startDate = dubaiDateOf(start);
      const parts = dubaiParts(start);
      return build(
        "last-month",
        `${MONTH_NAMES[parts.month - 1]} ${parts.year}`,
        start,
        end,
        startDate,
        previousDate(toDateString(year, month, 1)),
      );
    }

    case "last-90": {
      /* 90 whole days up to and including today, so the window is 90 days of
         business rather than 89 days and some hours. */
      const start = dubaiInstant(year, month, day - 89);
      return build("last-90", "Last 90 days", start, startOfTomorrow, dubaiDateOf(start), today);
    }

    case "year": {
      const start = dubaiInstant(year, 1, 1);
      return build("year", String(year), start, startOfTomorrow, `${year}-01-01`, today);
    }

    case "last-year": {
      const start = dubaiInstant(year - 1, 1, 1);
      const end = dubaiInstant(year, 1, 1);
      return build(
        "last-year",
        String(year - 1),
        start,
        end,
        `${year - 1}-01-01`,
        `${year - 1}-12-31`,
      );
    }

    case "custom": {
      const from = normaliseDate(options.customFrom);
      const to = normaliseDate(options.customTo);

      /* A custom range missing either end is not a custom range. Falling back
         to this month is better than reporting on all of time by accident. */
      if (!from || !to) return resolveReportRange("this-month", { at });

      /* Backwards dates are swapped rather than refused: somebody picking the
         end first is making a typing mistake, not a request for no data. */
      const [lo, hi] = from <= to ? [from, to] : [to, from];

      const [fy, fm, fd] = lo.split("-").map(Number);
      const [ty, tm, td] = hi.split("-").map(Number);

      return build(
        "custom",
        lo === hi ? lo : `${lo} to ${hi}`,
        dubaiInstant(fy, fm, fd),
        /* Exclusive end: the start of the day after the chosen last day. */
        dubaiInstant(ty, tm, td + 1),
        lo,
        hi,
      );
    }

    case "all":
    default:
      return build("all", "All time", null, startOfTomorrow, null, today);
  }
}

/** `YYYY-MM-DD` or nothing. Anything else is nothing. */
function normaliseDate(value: string | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const [year, month, day] = trimmed.split("-").map(Number);

  /* Rejects 2026-02-31: the round trip through a real date changes it. */
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return trimmed;
}

/** Whatever arrived in the URL, as a period id. */
export function parseReportRangeId(value: string | string[] | undefined): ReportRangeId {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  return REPORT_RANGE_OPTIONS.some((option) => option.id === raw)
    ? (raw as ReportRangeId)
    : "this-month";
}

/*
|--------------------------------------------------------------------------
| MONTH BUCKETS, FOR TRENDS
|--------------------------------------------------------------------------
*/

/**
 * Which `YYYY-MM` bucket a timestamp belongs to, in Dubai terms.
 *
 * A deal completed at 01:00 Dubai on 1 November belongs to November. Bucketed
 * on the raw UTC string it would land in October, which is how a trend chart
 * ends up disagreeing with the KPI card above it.
 */
export function dubaiMonthKey(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

  const { year, month } = dubaiParts(parsed);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "Nov 2026" from "2026-11". */
export function formatMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return key;
  return `${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`;
}

/*
|--------------------------------------------------------------------------
| DISPLAY
|--------------------------------------------------------------------------
*/

/** A timestamp as a Dubai day: "21 Nov 2026". */
export function formatDubaiDate(iso: string | null): string {
  if (!iso) return "—";

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: DUBAI_TIME_ZONE,
  }).format(parsed);
}

/** A timestamp as a Dubai day and minute: "21 Nov 2026, 14:05". */
export function formatDubaiDateTime(iso: string | null): string {
  if (!iso) return "—";

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: DUBAI_TIME_ZONE,
  }).format(parsed);
}
