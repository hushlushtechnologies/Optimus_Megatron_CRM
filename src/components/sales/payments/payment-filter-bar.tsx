"use client";

import { ArrowDownUp, Filter, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { useMotion } from "@/src/hooks/use-motion";
import type {
  PaymentQueueFilters,
  PaymentRecorderOption,
  PaymentSortId,
} from "@/src/lib/types/payment-queue";
import { EMPTY_PAYMENT_FILTERS, PAYMENT_SORTS } from "@/src/lib/types/payment-queue";
import type { PaymentKind } from "@/src/lib/types/sales";
import { cn } from "@/src/lib/utils/cn";
import { countActivePaymentFilters } from "@/src/lib/utils/payment-queue-filters";
import { PAYMENT_METHODS } from "@/src/lib/utils/sales-payments";
import { formatDay } from "@/src/lib/utils/test-drive-format";

/* =========================================================
   CONSTANTS
========================================================= */

const KIND_OPTIONS: PaymentKind[] = ["Reservation Deposit", "Deposit", "Instalment", "Balance", "Refund"];

/*
 * "Any" is a real option rather than a disabled placeholder, because a filter
 * someone can set but not unset is worse than no filter at all.
 */
const ANY = { value: "", label: "Any" };

/* =========================================================
   TYPES
========================================================= */

interface PaymentFilterBarProps {
  filters: PaymentQueueFilters;
  sortId: PaymentSortId;
  recorders: PaymentRecorderOption[];
  /** Pending means a navigation is in flight, so the controls dim but stay usable. */
  isPending: boolean;
  onFiltersChange: (next: PaymentQueueFilters) => void;
  onSortChange: (next: PaymentSortId) => void;
}

/* =========================================================
   CHIPS
========================================================= */

interface Chip {
  key: keyof PaymentQueueFilters;
  label: string;
}

function describe(filters: PaymentQueueFilters, recorders: PaymentRecorderOption[]): Chip[] {
  const chips: Chip[] = [];

  if (filters.direction) {
    chips.push({
      key: "direction",
      label: filters.direction === "in" ? "Money in" : "Refunds out",
    });
  }

  if (filters.kind) chips.push({ key: "kind", label: filters.kind });
  if (filters.method) chips.push({ key: "method", label: filters.method });

  if (filters.recordedBy) {
    const name = recorders.find((item) => item.id === filters.recordedBy)?.name;
    chips.push({ key: "recordedBy", label: `Recorded by ${name ?? "someone"}` });
  }

  if (filters.from) chips.push({ key: "from", label: `Paid from ${formatDay(filters.from)}` });
  if (filters.to) chips.push({ key: "to", label: `Paid up to ${formatDay(filters.to)}` });

  if (filters.minAmount) chips.push({ key: "minAmount", label: `From ${filters.minAmount}` });
  if (filters.maxAmount) chips.push({ key: "maxAmount", label: `Up to ${filters.maxAmount}` });

  return chips;
}

/* =========================================================
   COMPONENT
========================================================= */

/**
 * The filter and sort controls for the payments queue.
 *
 * Changes are applied as they are made rather than behind an Apply button: the
 * URL is the state, so every narrowing of the list is a place someone can link
 * to, go back from, or leave open on a second screen.
 */
export function PaymentFilterBar({
  filters,
  sortId,
  recorders,
  isPending,
  onFiltersChange,
  onSortChange,
}: PaymentFilterBarProps) {
  const panelId = useId();
  const { transition } = useMotion();

  const activeCount = countActivePaymentFilters(filters);
  const [open, setOpen] = useState(activeCount > 0);

  const chips = describe(filters, recorders);

  const set = <K extends keyof PaymentQueueFilters>(key: K, value: PaymentQueueFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  /* =======================================================
     AMOUNT DEBOUNCE

     A select or a date picker commits once, so those navigate immediately.
     The amount boxes are typed into a digit at a time, which would be one
     request per keystroke, so they settle first.
  ======================================================= */

  const [amounts, setAmounts] = useState({ min: filters.minAmount, max: filters.maxAmount });

  /*
   * When the URL's amounts change under us — a chip removed, "Clear all", the
   * back button — the boxes follow. React's own way to do this is to adjust
   * state during render on a changed prop rather than in an effect, which
   * would render once with the stale value and then again with the new one.
   */
  const [syncedAmounts, setSyncedAmounts] = useState({
    min: filters.minAmount,
    max: filters.maxAmount,
  });

  if (syncedAmounts.min !== filters.minAmount || syncedAmounts.max !== filters.maxAmount) {
    setSyncedAmounts({ min: filters.minAmount, max: filters.maxAmount });
    setAmounts({ min: filters.minAmount, max: filters.maxAmount });
  }

  useEffect(() => {
    if (amounts.min === filters.minAmount && amounts.max === filters.maxAmount) return;

    const timer = window.setTimeout(() => {
      onFiltersChange({ ...filters, minAmount: amounts.min, maxAmount: amounts.max });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [amounts, filters, onFiltersChange]);

  return (
    <div className="flex flex-col gap-3">
      {/* ===================================================
          BAR
      =================================================== */}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={activeCount > 0 ? "secondary" : "outline"}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          leftIcon={<Filter className="size-4" aria-hidden="true" />}
          className="h-11 sm:h-9"
        >
          Filters
          {activeCount > 0 && (
            <span className="bg-primary/15 text-primary ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
              {activeCount}
            </span>
          )}
        </Button>

        <div className="flex items-center gap-2">
          <ArrowDownUp className="text-text-subtle size-4 shrink-0" aria-hidden="true" />

          <Select
            aria-label="Sort payments"
            options={PAYMENT_SORTS.map((option) => ({ value: option.id, label: option.label }))}
            value={sortId}
            onChange={(event) => onSortChange(event.target.value as PaymentSortId)}
            className="h-11 w-auto min-w-52 sm:h-9"
          />
        </div>

        {activeCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onFiltersChange(EMPTY_PAYMENT_FILTERS)}
            className="h-11 sm:h-9"
          >
            Clear all
          </Button>
        )}
      </div>

      {/* ===================================================
          ACTIVE CHIPS

          Each one removes just itself, which is the fastest way back out of a
          filter someone set by accident.
      =================================================== */}

      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <li key={`${chip.key}-${chip.label}`}>
              <button
                type="button"
                onClick={() => set(chip.key, "")}
                className="border-border bg-card hover:bg-card-hover text-body-sm text-text-primary focus-visible:ring-primary inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                {chip.label}
                <X className="text-text-subtle size-3.5" aria-hidden="true" />
                <span className="sr-only">Remove this filter</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ===================================================
          PANEL
      =================================================== */}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={transition(0.22)}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "surface-card grid grid-cols-1 gap-4 p-4 transition-opacity sm:grid-cols-2 xl:grid-cols-4",
                isPending && "opacity-70",
              )}
            >
              <Select
                label="Direction"
                options={[
                  { ...ANY, label: "Any direction" },
                  { value: "in", label: "Money in" },
                  { value: "out", label: "Refunds out" },
                ]}
                value={filters.direction}
                onChange={(event) => set("direction", event.target.value as PaymentQueueFilters["direction"])}
              />

              <Select
                label="What it is for"
                options={[
                  { ...ANY, label: "Any kind" },
                  ...KIND_OPTIONS.map((item) => ({ value: item, label: item })),
                ]}
                value={filters.kind}
                onChange={(event) => set("kind", event.target.value as PaymentQueueFilters["kind"])}
              />

              <Select
                label="How it was paid"
                options={[
                  { ...ANY, label: "Any method" },
                  ...PAYMENT_METHODS.map((item) => ({ value: item, label: item })),
                ]}
                value={filters.method}
                onChange={(event) => set("method", event.target.value as PaymentQueueFilters["method"])}
              />

              <Select
                label="Recorded by"
                options={[
                  { ...ANY, label: "Anyone" },
                  ...recorders.map((item) => ({ value: item.id, label: item.name })),
                ]}
                value={filters.recordedBy}
                onChange={(event) => set("recordedBy", event.target.value)}
                hint={recorders.length === 0 ? "No one has recorded a payment yet." : undefined}
              />

              <Input
                label="Paid from"
                type="date"
                max={filters.to || undefined}
                value={filters.from}
                onChange={(event) => set("from", event.target.value)}
              />

              <Input
                label="Paid up to"
                type="date"
                min={filters.from || undefined}
                value={filters.to}
                onChange={(event) => set("to", event.target.value)}
              />

              <Input
                label="Smallest amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amounts.min}
                onChange={(event) =>
                  setAmounts((current) => ({
                    ...current,
                    min: event.target.value.replace(/[^\d.]/g, "").slice(0, 15),
                  }))
                }
              />

              <Input
                label="Largest amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amounts.max}
                onChange={(event) =>
                  setAmounts((current) => ({
                    ...current,
                    max: event.target.value.replace(/[^\d.]/g, "").slice(0, 15),
                  }))
                }
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
