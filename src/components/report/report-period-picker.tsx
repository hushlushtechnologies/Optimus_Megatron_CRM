"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarRange } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { cn } from "@/src/lib/utils/cn";
import {
  REPORT_RANGE_OPTIONS,
  dubaiToday,
  type ReportRangeId,
} from "@/src/lib/utils/report-time";

/*
|--------------------------------------------------------------------------
| CHOOSING A PERIOD
|--------------------------------------------------------------------------
|
| Eleven periods, one of which opens a date picker.
|
| The period lives in the URL, so a chosen period can be bookmarked, shared
| and refreshed. It is also why this is a set of links rather than a select
| with an onChange: the browser's back button should step back through
| periods, because stepping through periods is exactly what people do when
| comparing them.
|
| WHAT THIS DOES NOT DECIDE
|
| What "this month" means is not decided here. report-time.ts owns that, in
| Dubai time, for reports, filters and exports alike. This component only
| names periods and puts the chosen id in the address bar — which is why the
| four-hour timezone bug that the audit found could not be fixed in a
| component, and was not.
|
| CUSTOM RANGES
|
| Validated here for immediate feedback and again in report-time.ts, which
| does not trust it: a backwards range is swapped, and an impossible date
| falls back to this month rather than to all of time. The validation here is
| courtesy; the validation there is the rule.
*/

interface ReportPeriodPickerProps {
  active: ReportRangeId;
  /** Shown beside the control: "November 2026". */
  label: string;
}

/** Periods that fit on a phone without scrolling the row off-screen. */
const QUICK_PERIODS: ReportRangeId[] = ["today", "this-week", "this-month", "last-month", "year"];

export function ReportPeriodPicker({ active, label }: ReportPeriodPickerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");

  const today = dubaiToday();

  const hrefFor = (range: ReportRangeId): string => {
    const next = new URLSearchParams(searchParams.toString());

    if (range === "this-month") next.delete("range");
    else next.set("range", range);

    /* A non-custom period has no custom bounds, so they are cleared rather
       than left to reappear if somebody picks Custom again later. */
    if (range !== "custom") {
      next.delete("from");
      next.delete("to");
    }

    /* Changing the period resets to the first page of any table. */
    next.delete("page");

    const text = next.toString();
    return text ? `?${text}` : "?";
  };

  const applyCustom = () => {
    if (!from || !to) return;

    const next = new URLSearchParams(searchParams.toString());
    next.set("range", "custom");
    /* Swapped here too, so the address bar reads the way the report does. */
    next.set("from", from <= to ? from : to);
    next.set("to", from <= to ? to : from);
    next.delete("page");

    startTransition(() => {
      router.push(`?${next.toString()}`);
      setCustomOpen(false);
    });
  };

  const rangesWithLabels = REPORT_RANGE_OPTIONS.filter(
    (option) => option.id !== "custom" && QUICK_PERIODS.includes(option.id),
  );

  const moreRanges = REPORT_RANGE_OPTIONS.filter(
    (option) => option.id !== "custom" && !QUICK_PERIODS.includes(option.id),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Reporting period"
          className="border-border bg-card-hover flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5"
        >
          {[...rangesWithLabels, ...moreRanges].map((option) => {
            const isActive = option.id === active;

            return (
              <a
                key={option.id}
                href={hrefFor(option.id)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-primary text-[#0b1220]"
                    : "text-text-muted hover:text-text-primary",
                )}
              >
                {option.label}
              </a>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          leftIcon={<CalendarRange className="size-3.5" aria-hidden="true" />}
          onClick={() => setCustomOpen(true)}
          className={cn("h-10 shrink-0 rounded-lg px-3 text-xs sm:h-9", active === "custom" && "border-primary")}
        >
          {active === "custom" ? label : "Custom"}
        </Button>
      </div>

      {/* The resolved period, in words. "Last 90 days" is a name; "21 Aug
          2026 to 18 Nov 2026" is what it covers, and the two are not the
          same thing to somebody checking a figure. */}
      <p className="text-caption text-text-subtle">Showing {label}</p>

      <Modal
        isOpen={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Custom period"
        description="Both dates are included. Times are Dubai business hours."
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <Input
            type="date"
            label="From"
            value={from}
            max={today}
            onChange={(event) => setFrom(event.target.value)}
          />
          <Input
            type="date"
            label="To"
            value={to}
            max={today}
            onChange={(event) => setTo(event.target.value)}
            error={from && to && to < from ? "The end date is before the start date." : undefined}
            hint={from && to && to < from ? undefined : "Leave both set to apply the period."}
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCustomOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={applyCustom} disabled={!from || !to || isPending}>
              {isPending ? "Applying…" : "Apply"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
