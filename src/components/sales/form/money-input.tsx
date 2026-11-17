"use client";

import { useId } from "react";
import { cn } from "@/src/lib/utils/cn";

interface MoneyInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  currency: string;
  error?: string;
  helper?: string;
  required?: boolean;
}

const ALLOWED = /^\d{0,12}(\.\d{0,2})?$/;

/** A text field that only accepts a valid amount: digits and at most two decimals. */
export function MoneyInput({ label, value, onChange, currency, error, helper, required }: MoneyInputProps) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const helperId = `${baseId}-helper`;
  const errorId = `${baseId}-error`;
  const describedBy = [helper ? helperId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-label">
        {label}
        {required && (
          <span className="ml-0.5 text-red-400" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="text-text-subtle pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm"
        >
          {currency}
        </span>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            // Pasted "1,234.50" works: commas and spaces are dropped, anything else invalid is ignored.
            const next = event.target.value.replace(/[,\s]/g, "");
            if (ALLOWED.test(next)) onChange(next);
          }}
          className={cn(
            "bg-card text-body text-text-primary placeholder:text-text-subtle focus-visible:ring-primary h-11 w-full rounded-md border pr-3 pl-14 tabular-nums focus-visible:ring-2 focus-visible:outline-none sm:h-10",
            error ? "border-red-500" : "border-border",
          )}
        />
      </div>
      {helper && !error && (
        <p id={helperId} className="text-caption text-text-subtle">
          {helper}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-body-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}