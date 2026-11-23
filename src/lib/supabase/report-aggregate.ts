/*
|--------------------------------------------------------------------------
| AGGREGATES THAT CANNOT LIE ABOUT THEMSELVES
|--------------------------------------------------------------------------
|
| Two failures were possible in the Sprint 6 report, and both produced a
| number that looked like a fact.
|
| ONE: THE CAP.
|
| Every aggregate query ended `.limit(AGGREGATE_LIMIT)` with AGGREGATE_LIMIT
| at 5000, and no query asked for a count. So past five thousand rows in a
| window, "Deals created" reported exactly 5000 and "Completed value" summed
| an arbitrary five thousand rows — with nothing anywhere able to tell that it
| had happened. The table view got this right: it had a limit of 500, a
| comment explaining it, and a message pointing at the export. The aggregates
| never got the same treatment.
|
| TWO: THE FAILURE.
|
| Four queries ran in parallel and only three were checked:
|
|     if (completedResult.error || createdResult.error || openResult.error) {
|       return emptyResult;        // paymentsResult.error is not checked
|     }
|
| So a failed payments query left `data` null, `collected` reduced to 0, and
| the page displayed "Collected: AED 0" beside three correct deal counts that
| made it look healthy.
|
| THE SHAPE THAT FIXES BOTH
|
| A figure carries its own completeness and its own failure:
|
|     { value: T | null, complete: boolean, total: number | null, error }
|
| `value: null` means the lookup failed. It is not zero, it cannot be
| rendered as zero, and the type will not let a caller forget — reading
| `figure.value` gives `T | null`, so the null has to be handled.
|
| `complete: false` means more rows matched than were counted. The UI renders
| a warning, and so does the export, reusing the Sprint 8 truncation pattern.
|
| This is the one rule for every report in Sprint 9: a metric carries its own
| completeness, so "do not silently calculate incorrect totals from only the
| first page" is structurally true rather than something to remember.
*/

/** How many rows any single aggregate query will pull. */
export const AGGREGATE_PAGE = 1000;

/**
 * The ceiling past which a figure is computed in the database instead.
 *
 * Deliberately much lower than the old 5000. Beyond this many rows, summing
 * in JavaScript is both slow and pointless — Postgres can do it in one pass —
 * so crossing it means "use a counted aggregate", not "cap the answer".
 */
export const JS_AGGREGATION_CEILING = 10_000;

export interface CountedRows<TRow> {
  /** Empty on failure. Check `error` before trusting emptiness. */
  rows: TRow[];
  /** Exact count of matching rows, from `count: "exact"`. Null if not asked for. */
  total: number | null;
  /** False when more rows matched than were fetched. */
  complete: boolean;
  /** Non-null when the query failed. `rows` is then meaningless, not empty. */
  error: string | null;
}

interface RawResult {
  data: unknown;
  error: { message?: string } | null;
  count?: number | null;
}

/**
 * Interpret a Supabase result that asked for `count: "exact"`.
 *
 * A pure function on purpose: the truncation arithmetic is the part worth
 * testing, and it should be testable without a database.
 *
 * `label` appears only in the server log, never in a response. Staff should
 * not be shown Postgres error text — the sprint plan says so explicitly — so
 * the caller supplies its own wording for the person.
 */
export function interpretCounted<TRow>(
  result: RawResult,
  limit: number,
  label: string,
): CountedRows<TRow> {
  if (result.error) {
    console.error(`report aggregate "${label}" failed:`, result.error);
    return { rows: [], total: null, complete: false, error: result.error.message ?? "query failed" };
  }

  const rows = (Array.isArray(result.data) ? result.data : []) as TRow[];
  const total = typeof result.count === "number" ? result.count : null;

  /*
   * Completeness, in order of how much we know.
   *
   * With an exact count, the answer is certain: complete when nothing matched
   * beyond what came back.
   *
   * Without one, the only available signal is whether the page came back
   * full. A full page is assumed truncated — which can be wrong by one, when
   * exactly `limit` rows matched. That direction is deliberate: warning
   * unnecessarily on an exactly-full page costs a line of UI, while assuming
   * completeness on a full page is how a capped total gets presented as a
   * final figure.
   */
  const complete = total === null ? rows.length < limit : rows.length >= total;

  return { rows, total, complete, error: null };
}

/*
|--------------------------------------------------------------------------
| A FIGURE
|--------------------------------------------------------------------------
*/

export interface ReportFigure<T> {
  /** **Null means the lookup failed.** Never render null as zero. */
  value: T | null;
  /** False when the figure was computed from fewer rows than matched. */
  complete: boolean;
  /** Exact count of rows behind the figure, when known. */
  total: number | null;
  /** Non-null when `value` is null. For the log, not for the screen. */
  error: string | null;
}

/** A figure derived from counted rows. */
export function figureFrom<TRow, T>(
  counted: CountedRows<TRow>,
  compute: (rows: TRow[]) => T,
): ReportFigure<T> {
  if (counted.error) {
    return { value: null, complete: false, total: counted.total, error: counted.error };
  }

  return {
    value: compute(counted.rows),
    complete: counted.complete,
    total: counted.total,
    error: null,
  };
}

/** A figure that is already known — a count from the database, say. */
export function figureOf<T>(value: T, complete = true, total: number | null = null): ReportFigure<T> {
  return { value, complete, total, error: null };
}

/** A figure whose lookup failed. */
export function figureFailed<T>(error: string): ReportFigure<T> {
  return { value: null, complete: false, total: null, error };
}

/*
|--------------------------------------------------------------------------
| COMBINING
|--------------------------------------------------------------------------
*/

/**
 * Whether a whole set of figures can be trusted, and how far.
 *
 * A KPI row is built from several queries. If any one of them was capped, the
 * row as a whole is incomplete — because a reader comparing "created" against
 * "completed" is making a judgement that a cap on either one invalidates.
 *
 * Failure is reported per figure rather than collapsed, so one broken query
 * does not blank a page of otherwise good numbers. That is the specific
 * improvement over the old behaviour, which took an all-or-nothing approach
 * for three queries and no approach at all for the fourth.
 */
export interface SetCompleteness {
  /** True when every figure came back and none was capped. */
  allComplete: boolean;
  /** Figures whose lookup failed, by name. */
  failed: string[];
  /** Figures that were capped, by name. */
  incomplete: string[];
}

export function completenessOf(figures: Record<string, ReportFigure<unknown>>): SetCompleteness {
  const failed: string[] = [];
  const incomplete: string[] = [];

  for (const [name, figure] of Object.entries(figures)) {
    if (figure.error !== null || figure.value === null) {
      failed.push(name);
      continue;
    }
    if (!figure.complete) incomplete.push(name);
  }

  return {
    allComplete: failed.length === 0 && incomplete.length === 0,
    failed,
    incomplete,
  };
}

/**
 * One sentence a person can act on, or null when everything is fine.
 *
 * Deliberately says what to do, not just what went wrong. "Showing 1,000 of
 * 4,312" tells somebody the number is wrong; "narrow the period" tells them
 * how to get a right one.
 */
export function completenessMessage(state: SetCompleteness, rowCap = AGGREGATE_PAGE): string | null {
  if (state.failed.length > 0) {
    return "Some figures on this report could not be loaded. Refresh the page to try again.";
  }

  if (state.incomplete.length > 0) {
    return `This period holds more than ${rowCap.toLocaleString("en-US")} records, so some totals cover only part of it. Narrow the period for exact figures.`;
  }

  return null;
}
