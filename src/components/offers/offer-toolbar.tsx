"use client";

import { useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { FilterBar } from "@/src/components/shared/filter-bar";
import { SortControl } from "@/src/components/shared/sort-control";
import { OfferExportMenu } from "@/src/components/offers/offer-export-menu";
import { OfferFilterDrawer } from "@/src/components/offers/offer-filter-drawer";

import { cn } from "@/src/lib/utils/cn";
import { PROMOTION_TYPE_LABELS, type PromotionType } from "@/src/lib/types/offers";
import {
  EMPTY_OFFER_FILTERS,
  OFFER_SORTS,
  countActiveOfferFilters,
  type OfferFilters,
  type OfferSortId,
} from "@/src/lib/types/offer-list";
import { formatDay } from "@/src/lib/utils/test-drive-format";

/*
|--------------------------------------------------------------------------
| THE OFFER TOOLBAR
|--------------------------------------------------------------------------
|
| Search, a Filters button that opens the drawer, sort, the result count and
| the applied-filter chips — the same shape every other module uses, built
| from the same shared FilterBar and SortControl.
*/

interface OfferToolbarProps {
  filters: OfferFilters;
  sortId: OfferSortId;
  search: string;
  resultCount: number;
  staff: { id: string; full_name: string }[];
  /** True when the tab in view already pins the status. */
  statusLocked: boolean;
  /** Phase 24: offers.export, which is not offers.view. */
  canExport: boolean;
  isPending: boolean;
  onSearchChange: (next: string) => void;
  onFiltersChange: (next: OfferFilters) => void;
  onSortChange: (next: OfferSortId) => void;
}

/* =========================================================
   CHIPS
========================================================= */

interface Chip {
  key: string;
  label: string;
}

/**
 * The applied filters, in words.
 *
 * A chip says what it is as well as what it holds — "Type: Promo code", not
 * "Promo code" — because four bare values in a row tell you nothing about
 * which is which.
 */
function buildChips(
  filters: OfferFilters,
  staff: { id: string; full_name: string }[],
  statusLocked: boolean,
): Chip[] {
  const chips: Chip[] = [];

  if (filters.type) {
    chips.push({
      key: "type",
      label: `Type: ${PROMOTION_TYPE_LABELS[filters.type as PromotionType] ?? filters.type}`,
    });
  }

  /*
   * No chip for a status the tab already decided. A chip the person can
   * remove, which then changes nothing visible, reads as a broken control.
   */
  if (filters.status && !statusLocked) {
    chips.push({
      key: "status",
      label: `Status: ${filters.status.charAt(0).toUpperCase() + filters.status.slice(1)}`,
    });
  }

  if (filters.discountType) {
    chips.push({
      key: "discountType",
      label: `Discount: ${filters.discountType === "percentage" ? "Percentage" : "Fixed amount"}`,
    });
  }

  if (filters.createdBy) {
    const name = staff.find((member) => member.id === filters.createdBy)?.full_name ?? "Selected";
    chips.push({ key: "createdBy", label: `By: ${name}` });
  }

  /* One chip for a range, because two halves of one idea read as one thing. */
  if (filters.from || filters.to) {
    chips.push({
      key: "dates",
      label:
        filters.from && filters.to
          ? `Created: ${formatDay(filters.from)} to ${formatDay(filters.to)}`
          : filters.from
            ? `Created: from ${formatDay(filters.from)}`
            : `Created: until ${formatDay(filters.to)}`,
    });
  }

  return chips;
}

/* =========================================================
   TOOLBAR
========================================================= */

export function OfferToolbar({
  filters,
  sortId,
  search,
  resultCount,
  staff,
  statusLocked,
  canExport,
  isPending,
  onSearchChange,
  onFiltersChange,
  onSortChange,
}: OfferToolbarProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  /* A pinned status isn't a filter the person chose, so it isn't counted. */
  const activeCount =
    countActiveOfferFilters(filters) - (statusLocked && filters.status ? 1 : 0);

  const chips = useMemo(() => buildChips(filters, staff, statusLocked), [filters, staff, statusLocked]);

  const sortOptions = useMemo(
    () => OFFER_SORTS.map((option) => ({ value: option.id, label: option.label })),
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
              aria-label="Search campaigns"
              placeholder="Search name, reference or description..."
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

            <SortControl
              options={sortOptions}
              value={sortId}
              onChange={(value) => onSortChange(value as OfferSortId)}
            />

            {/* Phase 24. Hidden without offers.export rather than shown
                disabled: a control that refuses everybody who can see it is
                worse than no control. The route checks the same key again. */}
            {canExport && <OfferExportMenu />}
          </div>

          <div className="flex shrink-0 items-center gap-2 lg:ml-auto" role="status" aria-live="polite">
            <span
              aria-hidden="true"
              className="bg-success size-1.5 rounded-full shadow-[0_0_8px_rgba(50,183,105,0.4)]"
            />

            <span className="text-text-subtle text-xs whitespace-nowrap">
              <strong className="text-text-primary font-semibold tabular-nums">
                {resultCount.toLocaleString()}
              </strong>{" "}
              {resultCount === 1 ? "campaign" : "campaigns"}
            </span>
          </div>
        </div>

        {chips.length > 0 && (
          <FilterBar
            activeFilters={chips}
            onRemoveFilter={removeFilter}
            onClearAll={() =>
              /* A pinned status belongs to the tab, so clearing leaves it alone. */
              onFiltersChange({
                ...EMPTY_OFFER_FILTERS,
                status: statusLocked ? filters.status : "",
              })
            }
          >
            {null}
          </FilterBar>
        )}
      </div>

      <OfferFilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onApply={onFiltersChange}
        staff={staff}
        statusLocked={statusLocked}
      />
    </>
  );
}
