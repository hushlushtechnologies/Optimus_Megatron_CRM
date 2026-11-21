"use client";

import { motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/src/components/shared/empty-state";
import { Pagination } from "@/src/components/shared/pagination";

import { OfferCard } from "@/src/components/offers/offer-card";
import { OfferTable } from "@/src/components/offers/offer-table";
import { OfferToolbar } from "@/src/components/offers/offer-toolbar";
import type { OfferRowAction } from "@/src/components/offers/offer-columns";

import {
  archiveOfferAction,
  duplicateOfferAction,
  setOfferStatusAction,
} from "@/app/admin/offers/actions";

import { useMotion } from "@/src/hooks/use-motion";
import type { OfferListResult } from "@/src/lib/supabase/offer-queries";
import {
  OFFER_TAB_LABELS,
  OFFER_TAB_STATUSES,
  OFFER_TABS,
  type OfferFilters,
  type OfferListRow,
  type OfferSortId,
  type OfferTab,
} from "@/src/lib/types/offer-list";
import { cn } from "@/src/lib/utils/cn";
import type { OfferPermissions } from "@/src/lib/utils/offer-permissions";

/* =========================================================
   TYPES
========================================================= */

interface OffersListClientProps {
  /** null means the list couldn't be loaded, which is not the same as no results. */
  data: OfferListResult | null;
  tab: OfferTab;
  search: string;
  page: number;
  pageSize: number;
  filters: OfferFilters;
  sortId: OfferSortId;
  staff: { id: string; full_name: string }[];
  permissions: OfferPermissions;
}

const EMPTY_BY_TAB: Record<OfferTab, string> = {
  all: "No campaigns yet",
  active: "Nothing is running right now",
  scheduled: "Nothing is scheduled",
  ended: "Nothing has finished yet",
  drafts: "No drafts",
};

/* =========================================================
   COMPONENT
========================================================= */

export function OffersListClient({
  data,
  tab,
  search: urlQuery,
  page,
  pageSize,
  filters,
  sortId,
  staff,
  permissions,
}: OffersListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { transition } = useMotion();

  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(urlQuery);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => data?.rows ?? [], [data]);

  /* A tab that pins the status takes the status control out of the filters. */
  const statusLocked = OFFER_TAB_STATUSES[tab] !== null;

  /*
   * Whether the person has narrowed the list themselves. The tab doesn't
   * count: landing on an empty Drafts tab means there are no drafts, not
   * that a filter hid them.
   */
  const isSearching =
    urlQuery.trim() !== "" || Object.values(filters).some((value) => value !== "");

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
    (next: OfferTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      params.set("page", "1");

      /*
       * A status chosen by hand would fight the tab's own statuses, so it is
       * dropped when the tab changes. Ticks go too: they belong to rows that
       * are about to be replaced.
       */
      params.delete("status");

      setRowSelection({});
      navigate(params);
    },
    [navigate, searchParams],
  );

  const changeFilters = useCallback(
    (next: OfferFilters) => {
      const params = new URLSearchParams(searchParams.toString());

      const entries: [keyof OfferFilters, string][] = [
        ["type", next.type],
        ["status", next.status],
        ["discountType", next.discountType],
        ["createdBy", next.createdBy],
        ["from", next.from],
        ["to", next.to],
      ];

      for (const [key, value] of entries) {
        if (value) params.set(key, value);
        else params.delete(key);
      }

      params.set("page", "1");
      navigate(params);
    },
    [navigate, searchParams],
  );

  const changeSort = useCallback(
    (next: OfferSortId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sort", next);
      params.set("page", "1");

      navigate(params);
    },
    [navigate, searchParams],
  );

  /* =======================================================
     ROW ACTIONS

     Pausing and resuming are one click, because both are reversible and
     neither changes a deal that has already been done. Archiving and
     duplicating go through the row menu for the same reason they do
     elsewhere: one is heavier, the other creates something.
  ======================================================= */

  const runRowAction = async (offer: OfferListRow, action: OfferRowAction) => {
    setBusyId(offer.id);

    try {
      if (action === "duplicate") {
        const result = await duplicateOfferAction({ id: offer.id });

        if (result.error) {
          toast.error(result.error);
          return;
        }

        toast.success(`Copied "${offer.name}" as a draft.`);

        if (result.id) {
          router.push(`/admin/offers/${result.id}/edit`);
          return;
        }

        router.refresh();
        return;
      }

      if (action === "archive") {
        const result = await archiveOfferAction({ id: offer.id, archived: true });

        if (result.error) {
          toast.error(result.error);
          return;
        }

        toast.success(`"${offer.name}" archived. Completed sales keep their discount.`);
        router.refresh();
        return;
      }

      const status = action === "pause" ? "paused" : "active";

      const result = await setOfferStatusAction({ id: offer.id, status, reason: "" });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        action === "pause"
          ? `"${offer.name}" paused. It stops applying to new deals straight away.`
          : `"${offer.name}" is running again.`,
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
    <div className={cn("flex flex-col gap-4 transition-opacity", isPending && "opacity-75")}>
      {/* ===================================================
          STATUS TABS
      =================================================== */}

      <div
        role="group"
        aria-label="Filter campaigns by status"
        className="scrollbar-hidden border-border -mx-1 flex gap-1 overflow-x-auto border-b px-1"
      >
        {OFFER_TABS.map((key) => {
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
              {OFFER_TAB_LABELS[key]}

              {active && (
                <motion.span
                  layoutId="offer-tab-underline"
                  transition={transition(0.25)}
                  className="bg-primary absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ===================================================
          SEARCH, FILTERS, SORT
      =================================================== */}

      <OfferToolbar
        filters={filters}
        sortId={sortId}
        search={searchValue}
        resultCount={data?.totalCount ?? 0}
        staff={staff}
        statusLocked={statusLocked}
        isPending={isPending}
        onSearchChange={setSearchValue}
        onFiltersChange={changeFilters}
        onSortChange={changeSort}
      />

      {/* ===================================================
          RESULTS
      =================================================== */}

      {data === null ? (
        <div role="alert" className="surface-card flex items-start gap-3 p-5">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />

          <div>
            <p className="text-body-sm text-text-primary font-medium">
              The campaigns couldn&apos;t be loaded.
            </p>

            <p className="text-body-sm text-text-muted mt-0.5">
              Nothing has been lost. Refresh the page to try again, and let someone know if it keeps
              happening.
            </p>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card">
          {/*
            Two different empties, because they need two different answers. A
            search or a filter that matched nothing is not the same as having
            no campaigns, and telling somebody with four filters on that they
            have "no campaigns yet" sends them looking for missing data.
          */}
          {isSearching ? (
            <EmptyState
              icon="SearchX"
              title="No campaigns match"
              description="Nothing here fits the search and filters in use. Clearing one of them should bring results back."
              size="compact"
            />
          ) : (
            <EmptyState
              icon="Tag"
              title={EMPTY_BY_TAB[tab]}
              description={
                permissions.manage
                  ? "Campaigns you create appear here. A campaign stays a draft until you publish it, so nothing goes live by accident."
                  : "Campaigns appear here once somebody creates them."
              }
              size="compact"
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/*
            Thirteen columns don't fit a phone, and a horizontal scrollbar is
            not a design. Below the large breakpoint the same rows are the
            same cards the dashboard uses, which read down a narrow screen
            properly.
          */}
          <div className="hidden lg:block">
            <OfferTable
              rows={rows}
              canManage={permissions.manage}
              canPublish={permissions.publish}
              busyId={busyId}
              onRowAction={(offer, action) => void runRowAction(offer, action)}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              onChanged={() => router.refresh()}
            />
          </div>

          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {rows.map((row, index) => (
              <OfferCard
                key={row.id}
                offer={row}
                canPublish={permissions.publish}
                busy={busyId === row.id}
                index={index}
                onPause={() => void runRowAction(row, "pause")}
                onResume={() => void runRowAction(row, "resume")}
              />
            ))}
          </ul>

          <Pagination
            page={page}
            pageSize={pageSize}
            totalItems={data.totalCount}
            onPageChange={(next) => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(next));

              setRowSelection({});
              navigate(params);
            }}
            itemLabel={{ singular: "campaign", plural: "campaigns" }}
          />
        </div>
      )}
    </div>
  );
}
