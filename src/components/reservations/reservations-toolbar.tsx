"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Search, TriangleAlert } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Button } from "@/src/components/ui/button";
import { SortControl } from "@/src/components/shared/sort-control";
import { useMotion } from "@/src/hooks/use-motion";
import {
  RESERVATION_SOURCE_LABELS,
  UNASSIGNED_RESERVATION_OWNER,
  effectiveReservationSort,
  parseReservationParams,
} from "@/src/lib/utils/reservation-params";
import type { ReservationLookups, ReservationSummary, ReservationTab } from "@/src/lib/types/reservations";
import { cn } from "@/src/lib/utils/cn";

const SORT_OPTIONS = [
  { value: "expiry", label: "Expiring soonest" },
  { value: "oldest", label: "Waiting longest" },
  { value: "newest", label: "Newest first" },
  { value: "recently-updated", label: "Recently updated" },
];

const TABS: { key: ReservationTab; label: string }[] = [
  { key: "requests", label: "Requests" },
  { key: "active", label: "Active holds" },
  { key: "history", label: "History" },
  { key: "all", label: "All" },
];

interface ReservationsToolbarProps {
  resultCount: number;
  lookups: ReservationLookups;
  lookupsFailed: boolean;
  summary: ReservationSummary | null;
}

export function ReservationsToolbar({
  resultCount,
  lookups,
  lookupsFailed,
  summary,
}: ReservationsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { transition } = useMotion();
  const [isPending, startTransition] = useTransition();

  const parsed = useMemo(
    () => parseReservationParams(Object.fromEntries(searchParams.entries())),
    [searchParams],
  );
  const { tab, search: urlQuery } = parsed;
  const sort = effectiveReservationSort(tab, parsed.sort);
  const hasFilters = !!(parsed.showroom || parsed.owner || parsed.source);

  const [searchValue, setSearchValue] = useState(urlQuery);

  const navigate = useCallback(
    (params: URLSearchParams) => {
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router],
  );

  // Searches we sent that the URL hasn't caught up with yet. Anything else in the URL
  // came from outside (the Back button), so the box follows it.
  const pendingQueries = useRef<string[]>([]);

  useEffect(() => {
    const index = pendingQueries.current.indexOf(urlQuery);
    if (index >= 0) {
      pendingQueries.current = pendingQueries.current.slice(index + 1);
      return;
    }
    pendingQueries.current = [];
    setSearchValue(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const next = searchValue.trim().slice(0, 100);
    const current = (new URLSearchParams(window.location.search).get("q") ?? "").trim();
    if (next === current) return; // keeps the first render from resetting the page

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (next) params.set("q", next);
      else params.delete("q");
      params.set("page", "1");
      pendingQueries.current.push(next);
      navigate(params);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchValue, navigate]);

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    navigate(params);
  };

  const selectTab = (next: ReservationTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    params.delete("sort"); // each tab has its own best order
    params.set("page", "1");
    navigate(params);
  };

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    ["showroom", "owner", "source", "q"].forEach((key) => params.delete(key));
    params.set("page", "1");
    navigate(params);
  };

  const countFor = (key: ReservationTab): number | null =>
    !summary
      ? null
      : key === "requests"
        ? summary.requestsWaiting
        : key === "active"
          ? summary.activeHolds
          : null;

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-3 transition-opacity duration-200", isPending && "opacity-75")}
    >
      <div
        role="group"
        aria-label="Filter by stage"
        className="scrollbar-hidden border-border -mx-1 flex gap-1 overflow-x-auto border-b px-1"
      >
        {TABS.map((item) => {
          const active = tab === item.key;
          const count = countFor(item.key);
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() => selectTab(item.key)}
              className={cn(
                "text-body-sm relative min-h-11 shrink-0 px-3.5 font-medium transition-colors",
                active ? "text-text-primary" : "text-text-muted hover:text-text-primary",
              )}
            >
              {item.label}
              {count !== null && count > 0 && (
                <span className="bg-primary/10 text-primary ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                  {count}
                </span>
              )}
              {active && (
                <motion.span
                  layoutId="reservation-tab-underline"
                  transition={transition(0.25)}
                  className="bg-primary absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1 lg:max-w-[460px]">
          <Input
            aria-label="Search reservations"
            placeholder="Search reservation, customer, phone, vehicle or stock ID..."
            leftIcon={<Search className="text-text-subtle size-4" aria-hidden="true" />}
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            className="h-11 rounded-lg text-base sm:h-10 sm:text-sm"
          />
        </div>

        <div className="scrollbar-hidden flex min-w-0 items-center gap-2 max-sm:overflow-x-auto">
          <SortControl options={SORT_OPTIONS} value={sort} onChange={(value) => setParam("sort", value)} />
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
            {resultCount === 1 ? "reservation" : "reservations"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select
          aria-label="Showroom"
          options={[
            { value: "", label: "All showrooms" },
            ...lookups.showrooms.map((s) => ({ value: s.id, label: s.name })),
          ]}
          value={parsed.showroom ?? ""}
          onChange={(event) => setParam("showroom", event.target.value || null)}
        />
        <Select
          aria-label="Owner"
          options={[
            { value: "", label: "Any owner" },
            { value: UNASSIGNED_RESERVATION_OWNER, label: "Unassigned" },
            ...lookups.owners.map((o) => ({ value: o.id, label: o.name })),
          ]}
          value={parsed.owner ?? ""}
          onChange={(event) => setParam("owner", event.target.value || null)}
        />
        <Select
          aria-label="Source"
          options={[
            { value: "", label: "Any source" },
            ...Object.entries(RESERVATION_SOURCE_LABELS).map(([value, label]) => ({ value, label })),
          ]}
          value={parsed.source ?? ""}
          onChange={(event) => setParam("source", event.target.value || null)}
        />
      </div>

      {(hasFilters || urlQuery) && (
        <div>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear search and filters
          </Button>
        </div>
      )}

      {lookupsFailed && (
        <p
          role="status"
          className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
          Some options couldn&apos;t be loaded, so those lists may be incomplete. Search and sorting still
          work. Refresh the page to try again.
        </p>
      )}
    </div>
  );
}
