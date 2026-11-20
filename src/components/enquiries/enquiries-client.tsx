"use client";

import { Plus, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/src/components/shared/empty-state";
import { Pagination } from "@/src/components/shared/pagination";

import { EnquiryCard, type EnquiryQuickAction } from "@/src/components/enquiries/enquiry-card";
import { Button } from "@/src/components/ui/button";
import { EnquiryToolbar, type FilterOption } from "@/src/components/enquiries/enquiry-toolbar";
import { EnquirySummaryCards } from "@/src/components/enquiries/enquiry-summary-cards";
import { EnquiryTable } from "@/src/components/enquiries/enquiry-table";
import { EnquiryTypeTabs } from "@/src/components/enquiries/enquiry-type-tabs";

import { assignEnquiryAction, setEnquiryStatusAction } from "@/app/admin/enquiries/actions";
import { ExportMenu } from "@/src/components/shared/export-menu";
import { triggerDownloadFromUrl } from "@/src/lib/utils/trigger-download";

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
  type EnquiryTypeCounts,
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
  /** Only the statuses that belong to the tab in view. */
  statuses: FilterOption[];
  sources: FilterOption[];
  locations: { id: string; name: string }[];
  permissions: EnquiryPermissions;
  currentUserId: string;
  /** The active enquiry types, in workflow order, for the top-level tabs. */
  types: { key: string; label: string }[];
  /** null means the tab counts couldn't be read. The tabs still work. */
  typeCounts: EnquiryTypeCounts | null;
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
  statuses,
  sources,
  locations,
  permissions,
  currentUserId,
  types,
  typeCounts,
}: EnquiriesClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { fadeUp, transition } = useMotion();

  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(urlQuery);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => data?.rows ?? [], [data]);

  /* Everything still waiting on somebody, for the badge on the Open tab. */
  const openCount = summary ? summary.newCount + summary.inProgress : 0;

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
     EXPORT
  ======================================================= */

  /*
   * Throws rather than toasting, because the shared ExportMenu owns the
   * spinner, the success toast and the error toast. Reporting it here too
   * would show the person two toasts for one click.
   */
  const exportEnquiries = useCallback(
    async (format: "pdf" | "excel") => {
      const params = new URLSearchParams(searchParams.toString());

      /* Paging is about the screen, not about the file. */
      params.delete("page");
      params.delete("pageSize");

      params.set("format", format);
      params.set("scope", "current");
      params.set("tab", tab);

      if (urlQuery) params.set("q", urlQuery);

      const result = await triggerDownloadFromUrl(`/admin/enquiries/export?${params.toString()}`);

      if (result.error) throw new Error(result.error);
    },
    [searchParams, tab, urlQuery],
  );

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

      setRowSelection({});
      navigate(params);
    },
    [navigate, searchParams],
  );

  /*
   * The type tabs write the same `type` parameter the filters used to own,
   * so an old link to a filtered list still works and lights up the matching
   * tab. Changing it clears the selection: ticks belong to rows that are
   * about to be replaced.
   */
  const changeType = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next) params.set("type", next);
      else params.delete("type");

      params.set("page", "1");

      setRowSelection({});
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
          ? `${enquiry.enquiry_number} is yours.`
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
     RENDER
  ======================================================= */

  return (
    <div className="flex flex-col gap-6">
      {/* ===================================================
          HEADER
      =================================================== */}

      <motion.div {...fadeUp(0)} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-h3">Enquiry Requests</h1>

          <p className="text-body-sm text-text-muted mt-1 max-w-2xl">
            Manage customer finance, trade-in, selling, dream car and general requests — everything that comes
            in from the website, the phone and the showroom door.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            Gated on export, not view: looking at one customer's details on
            screen and taking every customer's details away in a file are
            different acts, so they get different permissions.
          */}
          {/*
            The shared ExportMenu, which already existed for exactly this and
            was going unused. Scope is the current view: the filters it sends
            include the type tab, so "current" on the Trade-In tab is Trade-In.
            Exporting a ticked selection lives on the bulk bar, where a
            selection actually exists.
          */}
          {permissions.export && (
            <ExportMenu
              onExportPDF={() => exportEnquiries("pdf")}
              onExportExcel={() => exportEnquiries("excel")}
            />
          )}

          {permissions.manage && (
            <Link href="/admin/enquiries/new">
              <Button
                variant="gradient"
                size="sm"
                leftIcon={<Plus className="size-4" aria-hidden="true" />}
              >
                New Enquiry
              </Button>
            </Link>
          )}
        </div>
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

      <EnquirySummaryCards summary={summary} />

      {/* ===================================================
          FILTERS / RESULTS
      =================================================== */}

      <div className={cn("flex flex-col gap-4 transition-opacity", isPending && "opacity-75")}>
        {/* ---- Type tabs ---- */}

        <EnquiryTypeTabs types={types} value={filters.type} counts={typeCounts} onChange={changeType} />

        {/* ---- Status tabs ---- */}

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

                {key === "open" && openCount > 0 && (
                  <span className="bg-primary/10 text-primary ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                    {openCount}
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

        {/* ---- Search, filters, sort ---- */}

        <EnquiryToolbar
          filters={filters}
          sortId={sortId}
          search={searchValue}
          resultCount={data?.totalCount ?? 0}
          staff={staff}
          statuses={statuses}
          sources={sources}
          locations={locations}
          isPending={isPending}
          onSearchChange={setSearchValue}
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
          <div className="flex flex-col gap-4">
            {/*
              Thirteen columns don't fit a phone, and a horizontal scrollbar
              is not a design. Below the large breakpoint the same rows are
              cards, which read down a narrow screen properly.
            */}
            <div className="hidden lg:block">
              <EnquiryTable
                rows={rows}
                currentUserId={currentUserId}
                canManage={permissions.manage}
                canExport={permissions.export}
                busyId={busyId}
                onRowAction={(enquiry, action) => void runQuickAction(enquiry, action)}
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                staff={staff}
                onChanged={() => router.refresh()}
              />
            </div>

            <div className="surface-card overflow-hidden lg:hidden">
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
            </div>

            <Pagination
              page={page}
              pageSize={ENQUIRY_PAGE_SIZE}
              totalItems={data.totalCount}
              onPageChange={(next) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("page", String(next));

                setRowSelection({});
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
