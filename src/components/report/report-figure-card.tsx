"use client";

import { CircleHelp, TriangleAlert } from "lucide-react";

import { Tooltip } from "@/src/components/ui/tooltip";
import type { ReportFigure } from "@/src/lib/supabase/report-aggregate";
import type { Money } from "@/src/lib/utils/report-money";

/*
|--------------------------------------------------------------------------
| ONE FIGURE ON A CARD
|--------------------------------------------------------------------------
|
| A report figure has four states, and the whole point of this component is
| that they are visibly different:
|
|   a complete value      the number, plainly
|   a partial value       the number, with a warning that it covers only
|                         part of the period
|   a failed lookup       "Unavailable", and never a zero
|   not permitted         nothing at all — the card is not rendered
|
| The third is why this exists. Sprint 6's report rendered a failed payments
| query as "Collected: AED 0" beside three correct deal counts, and nothing
| on the page could tell the difference between no money and no answer. Here
| they cannot look the same, because null and zero take different branches.
|
| The fourth is the `reports.financial` gate. A figure the person may not see
| is absent rather than blanked: a card reading "Hidden" tells somebody what
| they are missing and invites them to ask for it, which is a worse experience
| than a page that simply shows what they can use.
|
| The definition tooltip is not decoration. The sprint plan asks for metric
| descriptions explaining the calculations, and the date basis belongs with
| them: "deals completed" and "deals created" differ only by which column put
| a record in the period, and that difference is the single most common way a
| reader misreads a report.
*/

interface ReportFigureCardProps {
  label: string;
  /** What this counts, in one line. Shown in the tooltip. */
  definition: string;
  /** Which date put a record in this period. Shown under the label. */
  basis?: string;
  /** The figure. Null value means the lookup failed. */
  figure: ReportFigure<number | Money>;
  /** Rendered when the figure is a plain count rather than money. */
  suffix?: string;
}

function isMoney(value: number | Money): value is Money {
  return typeof value === "object" && value !== null && "display" in value;
}

export function ReportFigureCard({
  label,
  definition,
  basis,
  figure,
  suffix,
}: ReportFigureCardProps) {
  const failed = figure.value === null;

  return (
    <div className="surface-card flex min-w-0 flex-col gap-1 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-label truncate">{label}</p>

        <Tooltip
          content={
            <span className="block max-w-[14rem] text-left">
              {definition}
              {basis ? <span className="text-text-subtle block pt-1">Counted by: {basis}</span> : null}
            </span>
          }
        >
          <button
            type="button"
            /* A real button, so the definition is reachable by keyboard and
               announced by a screen reader rather than being hover-only. */
            className="text-text-subtle hover:text-text-primary focus-visible:ring-primary/50 -m-1 rounded p-1 focus-visible:ring-2 focus-visible:outline-none"
            aria-label={`What "${label}" counts`}
          >
            <CircleHelp className="size-3.5" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>

      {failed ? (
        <>
          <p className="text-text-muted mt-0.5 text-[20px] font-semibold">Unavailable</p>
          <p className="text-caption text-text-subtle">
            This figure could not be loaded. Refresh to try again.
          </p>
        </>
      ) : (
        <>
          <p className="text-text-primary mt-0.5 truncate text-[20px] font-semibold tabular-nums">
            {isMoney(figure.value!)
              ? (figure.value as Money).display
              : `${(figure.value as number).toLocaleString("en-US")}${suffix ?? ""}`}
          </p>

          {figure.complete ? (
            basis ? <p className="text-caption text-text-subtle">By {basis}</p> : null
          ) : (
            /*
              A partial figure says so on the card, not only in the page
              banner. Somebody screenshotting one number for a meeting should
              be carrying the caveat with it.
            */
            <p className="text-warning text-caption flex items-center gap-1">
              <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
              {figure.total === null
                ? "Covers part of this period"
                : `Part of ${figure.total.toLocaleString("en-US")} records`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
