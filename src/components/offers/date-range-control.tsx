"use client";

import { CalendarClock, Info } from "lucide-react";

import { Input } from "@/src/components/ui/input";
import { cn } from "@/src/lib/utils/cn";

interface DateRangeControlProps {
  /** `datetime-local` values: "YYYY-MM-DDTHH:mm", or "" for none. */
  startsAt: string;
  endsAt: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  startLabel?: string;
  endLabel?: string;
  /** Shown under the end field when the range is the wrong way round. */
  error?: string;
  disabled?: boolean;
  className?: string;
}

/** The Dubai wall clock as a `datetime-local` value. UTC+04:00, no DST. */
export function dubaiLocalNow(offsetMinutes = 0): string {
  const dubai = new Date(Date.now() + 4 * 60 * 60 * 1000 + offsetMinutes * 60 * 1000);
  return dubai.toISOString().slice(0, 16);
}

/**
 * When a campaign runs.
 *
 * Both fields are optional on purpose, and the hint says what leaving each
 * blank means — a campaign with no end date is a real thing people want, and
 * an empty field with no explanation reads as a mistake.
 *
 * Times are the Dubai wall clock. The value is given the +04:00 offset when
 * it is validated, so a campaign set to end at midnight ends at midnight in
 * Dubai rather than 4am.
 */
export function DateRangeControl({
  startsAt,
  endsAt,
  onStartChange,
  onEndChange,
  startLabel = "Starts",
  endLabel = "Ends",
  error,
  disabled,
  className,
}: DateRangeControlProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label={startLabel}
          type="datetime-local"
          value={startsAt}
          max={endsAt || undefined}
          disabled={disabled}
          onChange={(event) => onStartChange(event.target.value)}
          hint="Leave blank to start as soon as it is activated."
          leftIcon={<CalendarClock className="size-4" aria-hidden="true" />}
        />

        <Input
          label={endLabel}
          type="datetime-local"
          value={endsAt}
          min={startsAt || undefined}
          disabled={disabled}
          onChange={(event) => onEndChange(event.target.value)}
          hint="Leave blank to run until somebody pauses it."
          error={error}
        />
      </div>

      <p className="text-caption text-text-subtle flex items-start gap-1.5">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Dubai time. A campaign stops being usable the moment its end time passes — it does not need
        anybody to switch it off.
      </p>
    </div>
  );
}
