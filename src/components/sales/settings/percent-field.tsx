"use client";

import { useId } from "react";
import { cn } from "@/src/lib/utils/cn";

interface PercentFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helper?: string;
}

const ALLOWED = /^\d{0,3}(\.\d{0,2})?$/;

/** A text field that only accepts a percentage: digits and at most two decimals. */
export function PercentField({ label, value, onChange, error, helper }: PercentFieldProps) {
  const baseId = useId();
  const describedBy =
    [helper ? `${baseId}-helper` : null, error ? `${baseId}-error` : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${baseId}-input`} className="text-label">
        {label}
      </label>
      <div className="relative">
        <input
          id={`${baseId}-input`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            const next = event.target.value.replace(/[,\s]/g, "");
            if (ALLOWED.test(next)) onChange(next);
          }}
          className={cn(
            "bg-card text-body text-text-primary placeholder:text-text-subtle focus-visible:ring-primary h-11 w-full rounded-md border pr-9 pl-3 tabular-nums focus-visible:ring-2 focus-visible:outline-none sm:h-10",
            error ? "border-red-500" : "border-border",
          )}
        />
        <span
          aria-hidden="true"
          className="text-text-subtle pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm"
        >
          %
        </span>
      </div>
      {helper && !error && (
        <p id={`${baseId}-helper`} className="text-caption text-text-subtle">
          {helper}
        </p>
      )}
      {error && (
        <p id={`${baseId}-error`} role="alert" className="text-body-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
