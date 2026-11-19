"use client";

import { ArrowDownUp, Filter, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { useMotion } from "@/src/hooks/use-motion";
import { ENQUIRY_SOURCES, ENQUIRY_TYPES } from "@/src/lib/types/enquiry";
import { cn } from "@/src/lib/utils/cn";
import {
  countActiveEnquiryFilters,
  EMPTY_ENQUIRY_FILTERS,
  ENQUIRY_SORTS,
  UNASSIGNED,
  type EnquiryFilters,
  type EnquirySortId,
} from "@/src/lib/utils/enquiry-filters";
import { formatDay } from "@/src/lib/utils/test-drive-format";

interface EnquiryFilterBarProps {
  filters: EnquiryFilters;
  sortId: EnquirySortId;
  staff: { id: string; full_name: string }[];
  isPending: boolean;
  onFiltersChange: (next: EnquiryFilters) => void;
  onSortChange: (next: EnquirySortId) => void;
}

/* =========================================================
   CHIPS
========================================================= */

interface Chip {
  key: keyof EnquiryFilters;
  label: string;
}

function describe(filters: EnquiryFilters, staff: { id: string; full_name: string }[]): Chip[] {
  const chips: Chip[] = [];

  if (filters.type) chips.push({ key: "type", label: filters.type });
  if (filters.source) chips.push({ key: "source", label: `From ${filters.source}` });

  if (filters.assignedTo === UNASSIGNED) {
    chips.push({ key: "assignedTo", label: "Unassigned" });
  } else if (filters.assignedTo) {
    const name = staff.find((person) => person.id === filters.assignedTo)?.full_name;
    chips.push({ key: "assignedTo", label: `With ${name ?? "someone"}` });
  }

  if (filters.from) chips.push({ key: "from", label: `From ${formatDay(filters.from)}` });
  if (filters.to) chips.push({ key: "to", label: `Up to ${formatDay(filters.to)}` });

  return chips;
}

/* =========================================================
   COMPONENT
========================================================= */

/**
 * Filter and sort controls for the enquiries list.
 *
 * Applied as they are changed rather than behind an Apply button: the URL is
 * the state, so every narrowing of the list is somewhere a person can link
 * to, go back from, or leave open on a second screen.
 */
export function EnquiryFilterBar({
  filters,
  sortId,
  staff,
  isPending,
  onFiltersChange,
  onSortChange,
}: EnquiryFilterBarProps) {
  const panelId = useId();
  const { transition } = useMotion();

  const activeCount = countActiveEnquiryFilters(filters);
  const [open, setOpen] = useState(activeCount > 0);

  const chips = describe(filters, staff);

  const set = <K extends keyof EnquiryFilters>(key: K, value: EnquiryFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="flex flex-col gap-3">
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
            aria-label="Sort enquiries"
            options={ENQUIRY_SORTS.map((option) => ({ value: option.id, label: option.label }))}
            value={sortId}
            onChange={(event) => onSortChange(event.target.value as EnquirySortId)}
            className="h-11 w-auto min-w-48 sm:h-9"
          />
        </div>

        {activeCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onFiltersChange(EMPTY_ENQUIRY_FILTERS)}
            className="h-11 sm:h-9"
          >
            Clear all
          </Button>
        )}
      </div>

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
                "surface-card grid grid-cols-1 gap-4 p-4 transition-opacity sm:grid-cols-2 xl:grid-cols-5",
                isPending && "opacity-70",
              )}
            >
              <Select
                label="What it is about"
                options={[
                  { value: "", label: "Any kind" },
                  ...ENQUIRY_TYPES.map((item) => ({ value: item, label: item })),
                ]}
                value={filters.type}
                onChange={(event) => set("type", event.target.value as EnquiryFilters["type"])}
              />

              <Select
                label="Where it came from"
                options={[
                  { value: "", label: "Anywhere" },
                  ...ENQUIRY_SOURCES.map((item) => ({ value: item, label: item })),
                ]}
                value={filters.source}
                onChange={(event) => set("source", event.target.value as EnquiryFilters["source"])}
              />

              <Select
                label="Who has it"
                options={[
                  { value: "", label: "Anyone" },
                  { value: UNASSIGNED, label: "Nobody yet" },
                  ...staff.map((person) => ({ value: person.id, label: person.full_name })),
                ]}
                value={filters.assignedTo}
                onChange={(event) => set("assignedTo", event.target.value)}
              />

              <Input
                label="Received from"
                type="date"
                max={filters.to || undefined}
                value={filters.from}
                onChange={(event) => set("from", event.target.value)}
              />

              <Input
                label="Received up to"
                type="date"
                min={filters.from || undefined}
                value={filters.to}
                onChange={(event) => set("to", event.target.value)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
