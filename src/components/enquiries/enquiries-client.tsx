"use client";

import { CheckCircle2, Clock, Inbox, Plus, Search, TriangleAlert, UserX } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/src/components/shared/empty-state";
import { MetricCard } from "@/src/components/shared/metric-card";
import { Pagination } from "@/src/components/shared/pagination";
import { Input } from "@/src/components/ui/input";

import { EnquiryCard, type EnquiryQuickAction } from "@/src/components/enquiries/enquiry-card";
import { EnquiryFilterBar } from "@/src/components/enquiries/enquiry-filter-bar";

import { assignEnquiryAction, setEnquiryStatusAction } from "@/app/admin/enquiries/actions";

import { useMotion } from "@/src/hooks/use-motion";
import { ENQUIRY_PAGE_SIZE } from "@/src/lib/constants/enquiries";
import {
  ENQUIRY_TAB_EMPTY,
  ENQUIRY_TAB_LABELS,
  ENQUIRY_TABS,
  type EnquiryListResult,
  type EnquiryListRow,
  type EnquirySummary,
  type EnquiryTab,
} from "@/src/lib/types/enquiry";
import { cn } from "@/src/lib/utils/cn";
import {
  writeEnquiryFiltersToParams,
  type EnquiryFilters,
  type EnquirySortId,
} from "@/src/lib/utils/enquiry-filters";
import type { EnquiryPermissions } from "@/src/lib/utils/enquiry-permissions";

/* =========================================================
   TYPES
========================================================= */

interface EnquiriesClientProps {
  summary: EnquirySummary | null;
  /** null means the list couldn't be loaded, which is not the same as no results. */
  data: EnquiryListResult | null;
  tab: EnquiryTab;
  search: string;
  page: number;
  filters: EnquiryFilters;
  sortId: EnquirySortId;
  staff: { id: string; full_name: string }[];
  permissions: EnquiryPermissions;
  currentUserId: string;
}

/* =========================================================
   COMPONENT
========================================================= */

export function EnquiriesClient({
  summary,
  data,
  tab,
  search: urlQuery,
  page,
  filters,
  sortId,
  staff,
  permissions,
  currentUserId,
}: EnquiriesClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { fadeUp, transition } = useMotion();

  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(urlQuery);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  /* =======================================================
     NAVIGATION
  ======================================================= */

  const navigate = useCallback(
    (params: URLSearchParams) => {
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router],
  );

  /* =======================================================
     SEARCH SYNC

     Typed into locally, with the URL following after a pause. Each value sent
     is remembered, so when the URL catches up the box isn't yanked back to
     something the person has already typed past.
  ======================================================= */

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

    if (next === current) return;

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

  /* =======================================================
     TAB, FILTERS, SORT
  ======================================================= */

  const selectTab = useCallback(
    (next: EnquiryTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      params.set("page", "1");

      /*
       * Needs attention is ordered by longest wait, the rest by newest, so an
       * explicit sort is dropped when the tab changes rather than carried
       * somewhere it doesn't suit.
       */
      params.delete("sort");

      navigate(params);
    },
    [navigate, searchParams],
  );

  const changeFilters = useCallback(
    (next: EnquiryFilters) => {
      const params = new URLSearchParams(searchParams.toString());
      writeEnquiryFiltersToParams(params, next);
      params.set("page", "1");

      navigate(params);
    },
    [navigate, searchParams],
  );

  const changeSort = useCallback(
    (next: EnquirySortId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sort", next);
      params.set("page", "1");

      navigate(params);
    },
    [navigate, searchParams],
  );

  /* =======================================================
     QUICK ACTIONS

     Taking an enquiry on and flagging junk are the two things worth doing
     without opening a record. Both are reversible, so neither asks twice.
  ======================================================= */

  const runQuickAction = async (enquiry: EnquiryListRow, action: EnquiryQuickAction) => {
    setBusyId(enquiry.id);

    try {
      const result =
        action === "claim"
          ? await assignEnquiryAction({ id: enquiry.id, assignedTo: currentUserId })
          : await setEnquiryStatusAction({ id: enquiry.id, status: "Spam", reason: "" });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        action === "claim"
          ? `${enquiry.enquiry_number} is yours. It is now in review.`
          : `${enquiry.enquiry_number} moved to Spam. You can put it back from the Spam tab.`,
      );

      router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setBusyId(null);
    }
  };

  /* =======================================================
     SUMMARY FALLBACK
  ======================================================= */

  const s = summary ?? {
    newCount: 0,
    inReviewCount: 0,
    unassignedCount: 0,
    convertedMonth: 0,
    staleCount: 0,
  };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="flex flex-col gap-6">
      {/* ===================================================
          HEADER
      =================================================== */}

      <motion.div {...fadeUp(0)} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-h3">Enquiry requests</h1>

          <p className="text-body-sm text-text-muted mt-1 max-w-2xl">
            Everything that comes in from the website, the phone and the showroom door. Reply, then convert
            the real ones into leads.
          </p>
        </div>

        {permissions.manage && (
          <Link
            href="/admin/enquiries/new"
            className="border-primary bg-primary focus-visible:ring-primary inline-flex min-h-11 items-center gap-1.5 rounded-md border px-4 text-sm font-medium text-[#0b1220] transition-colors hover:brightness-105 focus-visible:ring-2 focus-visible:outline-none"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add an enquiry
          </Link>
        )}
      </motion.div>

      {/* ===================================================
          SUMMARY ERROR
      =================================================== */}

      {!summary && (
        <p
          role="alert"
          className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
          The summary numbers couldn&apos;t be loaded, so the cards show zeros for now. Refresh the page to
          try again.
        </p>
      )}

      {/* ===================================================
          SUMMARY
      =================================================== */}

      <section aria-label="Enquiry summary" className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <MetricCard label="New" value={s.newCount} icon={<Inbox />} caption="Nobody has replied yet" />

        <MetricCard label="In review" value={s.inReviewCount} icon={<Clock />} caption="Someone is on it" />

        <MetricCard
          label="Unassigned"
          value={s.unassignedCount}
          icon={<UserX />}
          caption="Open, with no owner"
        />

        <MetricCard
          label="Waiting over a day"
          value={s.staleCount}
          icon={<TriangleAlert />}
          caption="New and still untouched"
        />

        <MetricCard
          label="Converted this month"
          value={s.convertedMonth}
          icon={<CheckCircle2 />}
          caption="Became leads"
        />
      </section>

      {/* ===================================================
          FILTERS / RESULTS
      =================================================== */}

      <div className={cn("flex flex-col gap-4 transition-opacity", isPending && "opacity-75")}>
        {/* ---- Tabs ---- */}

        <div
          role="group"
          aria-label="Filter enquiries"
          className="scrollbar-hidden border-border -mx-1 flex gap-1 overflow-x-auto border-b px-1"
        >
          {ENQUIRY_TABS.map((key) => {
            const active = tab === key;

            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => selectTab(key)}
                className={cn(
                  "text-body-sm relative min-h-11 shrink-0 px-3.5 font-medium transition-colors",
                  active ? "text-text-primary" : "text-text-muted hover:text-text-primary",
                )}
              >
                {ENQUIRY_TAB_LABELS[key]}

                {key === "open" && s.newCount + s.inReviewCount > 0 && (
                  <span className="bg-primary/10 text-primary ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                    {s.newCount + s.inReviewCount}
                  </span>
                )}

                {active && (
                  <motion.span
                    layoutId="enquiry-tab-underline"
                    transition={transition(0.25)}
                    className="bg-primary absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ---- Search ---- */}

        <div className="max-w-md">
          <Input
            aria-label="Search enquiries"
            placeholder="Search name, number, email, phone or message..."
            leftIcon={<Search className="text-text-subtle size-4" aria-hidden="true" />}
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            className="h-11 rounded-lg text-base sm:h-10 sm:text-sm"
          />
        </div>

        {/* ---- Filters ---- */}

        <EnquiryFilterBar
          filters={filters}
          sortId={sortId}
          staff={staff}
          isPending={isPending}
          onFiltersChange={changeFilters}
          onSortChange={changeSort}
        />

        {/* ---- Results ---- */}

        {data === null ? (
          <div role="alert" className="surface-card flex items-start gap-3 p-5">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />

            <div>
              <p className="text-body-sm text-text-primary font-medium">
                The enquiries couldn&apos;t be loaded.
              </p>

              <p className="text-body-sm text-text-muted mt-0.5">
                Nothing has been lost. Refresh the page to try again, and let someone know if it keeps
                happening.
              </p>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="surface-card">
            <EmptyState
              icon="Inbox"
              title={ENQUIRY_TAB_EMPTY[tab]}
              description="Enquiries arrive here from the website form, and from anything a colleague enters by hand."
              size="compact"
            />
          </div>
        ) : (
          <div className="surface-card overflow-hidden">
            <ul className="divide-border divide-y">
              {rows.map((row, index) => (
                <EnquiryCard
                  key={row.id}
                  enquiry={row}
                  index={index}
                  currentUserId={currentUserId}
                  canManage={permissions.manage}
                  isBusy={busyId === row.id}
                  onQuickAction={(enquiry, action) => void runQuickAction(enquiry, action)}
                />
              ))}
            </ul>

            <Pagination
              page={page}
              pageSize={ENQUIRY_PAGE_SIZE}
              totalItems={data.totalCount}
              onPageChange={(next) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("page", String(next));
                navigate(params);
              }}
              itemLabel={{ singular: "enquiry", plural: "enquiries" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
