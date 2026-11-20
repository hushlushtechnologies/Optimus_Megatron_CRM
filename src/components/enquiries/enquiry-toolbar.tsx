"use client";

import { useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { FilterBar } from "@/src/components/shared/filter-bar";
import { SortControl } from "@/src/components/shared/sort-control";
import {
  EnquiryFilterDrawer,
  type FilterOption,
} from "@/src/components/enquiries/enquiry-filter-drawer";

import { cn } from "@/src/lib/utils/cn";
import {
  EMPTY_ENQUIRY_FILTERS,
  ENQUIRY_FOLLOW_UP_LABELS,
  ENQUIRY_SORTS,
  UNASSIGNED,
  countActiveEnquiryFilters,
  type EnquiryFilters,
  type EnquiryFollowUpState,
  type EnquirySortId,
} from "@/src/lib/utils/enquiry-filters";
import { formatDay } from "@/src/lib/utils/test-drive-format";

export type { FilterOption };

/*
|--------------------------------------------------------------------------
| THE ENQUIRY TOOLBAR
|--------------------------------------------------------------------------
|
| Search, a Filters button that opens the drawer, sort, the result count and
| the applied-filter chips — laid out the way Sales, Leads, Customers,
| Inventory and Test Drives lay theirs out, and built from the same shared
| FilterBar and SortControl they use.
|
| This module previously hand-rolled all of it: its own chip markup, its own
| "Clear all", its own sort menu. Three copies of a thing is three places a
| design change has to be remembered, and it had already drifted.
*/

interface EnquiryToolbarProps {
  filters: EnquiryFilters;
  sortId: EnquirySortId;
  search: string;
  resultCount: number;
  staff: { id: string; full_name: string }[];
  /** Only the statuses that belong to the tab in view. */
  statuses: FilterOption[];
  sources: FilterOption[];
  locations: { id: string; name: string }[];
  isPending: boolean;
  onSearchChange: (next: string) => void;
  onFiltersChange: (next: EnquiryFilters) => void;
  onSortChange: (next: EnquirySortId) => void;
}

/* =========================================================
   CHIPS
========================================================= */

interface Chip {
  key: string;
  label: string;
}

function labelOf(options: FilterOption[], value: string): string {
  return options.find((option) => option.key === value)?.label ?? value;
}

/**
 * The applied filters, in words.
 *
 * A chip says what it is as well as what it holds — "Priority: Urgent", not
 * "Urgent" — because four bare values in a row tell you nothing about which
 * is which.
 */
function buildChips(
  filters: EnquiryFilters,
  staff: { id: string; full_name: string }[],
  statuses: FilterOption[],
  sources: FilterOption[],
  locations: { id: string; name: string }[],
): Chip[] {
  const chips: Chip[] = [];

  if (filters.status) {
    chips.push({ key: "status", label: `Status: ${labelOf(statuses, filters.status)}` });
  }

  if (filters.priority) {
    chips.push({ key: "priority", label: `Priority: ${filters.priority}` });
  }

  if (filters.source) {
    chips.push({ key: "source", label: `Source: ${labelOf(sources, filters.source)}` });
  }

  if (filters.assignedTo) {
    const name =
      filters.assignedTo === UNASSIGNED
        ? "Nobody yet"
        : (staff.find((member) => member.id === filters.assignedTo)?.full_name ?? "Selected");

    chips.push({ key: "assignedTo", label: `With: ${name}` });
  }

  if (filters.location) {
    const name = locations.find((item) => item.id === filters.location)?.name ?? "Selected";
    chips.push({ key: "location", label: `Showroom: ${name}` });
  }

  if (filters.followUp) {
    chips.push({
      key: "followUp",
      label: `Follow-up: ${ENQUIRY_FOLLOW_UP_LABELS[filters.followUp as Exclude<EnquiryFollowUpState, "">]}`,
    });
  }

  /* One chip for a range, because two halves of one idea read as one thing. */
  if (filters.from || filters.to) {
    chips.push({
      key: "dates",
      label:
        filters.from && filters.to
          ? `Received: ${formatDay(filters.from)} to ${formatDay(filters.to)}`
          : filters.from
            ? `Received: from ${formatDay(filters.from)}`
            : `Received: until ${formatDay(filters.to)}`,
    });
  }

  return chips;
}

/* =========================================================
   TOOLBAR
========================================================= */

export function EnquiryToolbar({
  filters,
  sortId,
  search,
  resultCount,
  staff,
  statuses,
  sources,
  locations,
  isPending,
  onSearchChange,
  onFiltersChange,
  onSortChange,
}: EnquiryToolbarProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeCount = countActiveEnquiryFilters(filters);

  const chips = useMemo(
    () => buildChips(filters, staff, statuses, sources, locations),
    [filters, staff, statuses, sources, locations],
  );

  const sortOptions = useMemo(
    () => ENQUIRY_SORTS.map((option) => ({ value: option.id, label: option.label })),
    [],
  );

  const removeFilter = (key: string) => {
    if (key === "dates") {
      onFiltersChange({ ...filters, from: "", to: "" });
      return;
    }

    onFiltersChange({ ...filters, [key]: "" });
  };

  return (
    <>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-3 transition-opacity duration-200",
          isPending && "opacity-75",
        )}
      >
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1 lg:max-w-[460px]">
            <Input
              aria-label="Search enquiries"
              placeholder="Search name, number, email, phone or message..."
              leftIcon={<Search className="text-text-subtle size-4" aria-hidden="true" />}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-11 rounded-lg text-base sm:h-10 sm:text-sm"
            />
          </div>

          <div className="scrollbar-hidden flex min-w-0 items-center gap-2 max-sm:overflow-x-auto">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Filter className="size-3.5" aria-hidden="true" />}
              onClick={() => setIsFilterOpen(true)}
              className={cn(
                "h-11 shrink-0 rounded-lg px-3 text-xs font-medium sm:h-10",
                activeCount > 0 && ["border-primary/30", "text-primary"],
              )}
            >
              Filters
              {activeCount > 0 && (
                <span className="bg-primary/10 text-primary ml-1 inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                  {activeCount}
                </span>
              )}
            </Button>

            <SortControl options={sortOptions} value={sortId} onChange={(value) => onSortChange(value as EnquirySortId)} />
          </div>

          <div
            className="flex shrink-0 items-center gap-2 lg:ml-auto"
            role="status"
            aria-live="polite"
          >
            <span
              aria-hidden="true"
              className="bg-success size-1.5 rounded-full shadow-[0_0_8px_rgba(50,183,105,0.4)]"
            />

            <span className="text-text-subtle text-xs whitespace-nowrap">
              <strong className="text-text-primary font-semibold tabular-nums">
                {resultCount.toLocaleString()}
              </strong>{" "}
              {resultCount === 1 ? "enquiry" : "enquiries"}
            </span>
          </div>
        </div>

        {chips.length > 0 && (
          <FilterBar
            activeFilters={chips}
            onRemoveFilter={removeFilter}
            onClearAll={() => onFiltersChange({ ...EMPTY_ENQUIRY_FILTERS, type: filters.type })}
          >
            {null}
          </FilterBar>
        )}
      </div>

      <EnquiryFilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onApply={onFiltersChange}
        staff={staff}
        statuses={statuses}
        sources={sources}
        locations={locations}
      />
    </>
  );
}
