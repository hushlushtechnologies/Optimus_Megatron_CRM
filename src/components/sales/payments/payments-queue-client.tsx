"use client";

import {
  ArrowLeft,
  CheckCheck,
  Clock,
  FileSpreadsheet,
  FileText,
  Search,
  ShieldCheck,
  TriangleAlert,
  Undo2,
  Wallet,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/src/components/shared/empty-state";
import { MetricCard } from "@/src/components/shared/metric-card";
import { Pagination } from "@/src/components/shared/pagination";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";

import { PaymentBulkBar } from "@/src/components/sales/payments/payment-bulk-bar";
import { PaymentFilterBar } from "@/src/components/sales/payments/payment-filter-bar";
import { PaymentRow, PaymentRowActions } from "@/src/components/sales/payments/payment-row";
import { PaymentStatusDialog } from "@/src/components/sales/payments/payment-status-dialog";

import { useMotion } from "@/src/hooks/use-motion";
import { PAYMENT_QUEUE_PAGE_SIZE } from "@/src/lib/constants/sales-payments";
import { cn } from "@/src/lib/utils/cn";
import { downloadExportFile } from "@/src/lib/utils/download-export-file";
import { writePaymentFiltersToParams } from "@/src/lib/utils/payment-queue-filters";

import type {
  PaymentQueueFilters,
  PaymentQueueResult,
  PaymentRecorderOption,
  PaymentSortId,
} from "@/src/lib/types/payment-queue";
import type {
  PaymentQueueRow,
  PaymentQueueTab,
  PaymentStatusAction,
  PaymentSummary,
} from "@/src/lib/types/sales-payments";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";

/* =========================================================
   CONSTANTS
========================================================= */

const TABS: { key: PaymentQueueTab; label: string }[] = [
  { key: "awaiting", label: "Awaiting verification" },
  { key: "verified", label: "Verified" },
  { key: "closed", label: "Rejected and reversed" },
  { key: "all", label: "All" },
];

const EMPTY: Record<PaymentQueueTab, string> = {
  awaiting: "Nothing is waiting to be verified.",
  verified: "No verified payments match.",
  closed: "No rejected or reversed payments match.",
  all: "No payments match.",
};

type ExportFormat = "excel" | "pdf";

/* =========================================================
   TYPES
========================================================= */

interface PaymentsQueueClientProps {
  summary: PaymentSummary | null;
  /** null means the list couldn't be loaded, which is not the same as no results. */
  data: PaymentQueueResult | null;
  tab: PaymentQueueTab;
  search: string;
  page: number;
  filters: PaymentQueueFilters;
  sortId: PaymentSortId;
  recorders: PaymentRecorderOption[];
  permissions: SalesPermissions;
  currentUserId: string;
  separateVerifier: boolean | null;
}

/* =========================================================
   COMPONENT
========================================================= */

export function PaymentsQueueClient({
  summary,
  data,
  tab,
  search: urlQuery,
  page,
  filters,
  sortId,
  recorders,
  permissions,
  currentUserId,
  separateVerifier,
}: PaymentsQueueClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { fadeUp, transition } = useMotion();

  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState<{ payment: PaymentQueueRow; action: PaymentStatusAction } | null>(null);
  const [searchValue, setSearchValue] = useState(urlQuery);
  const [selected, setSelected] = useState<Record<string, true>>({});
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

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

     The box is typed into locally and the URL follows after a pause. Each
     value this component sends is remembered, so when the URL catches up the
     box isn't yanked back to a value the person has already typed past.
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
    (next: PaymentQueueTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      params.set("page", "1");

      /*
       * The default order differs by tab — longest wait first in the work
       * queue, newest first in the records — so an explicit sort is dropped
       * when the tab changes rather than carried somewhere it doesn't suit.
       */
      params.delete("sort");

      navigate(params);
    },
    [navigate, searchParams],
  );

  const changeFilters = useCallback(
    (next: PaymentQueueFilters) => {
      const params = new URLSearchParams(searchParams.toString());
      writePaymentFiltersToParams(params, next);
      params.set("page", "1");

      navigate(params);
    },
    [navigate, searchParams],
  );

  const changeSort = useCallback(
    (next: PaymentSortId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sort", next);
      params.set("page", "1");

      navigate(params);
    },
    [navigate, searchParams],
  );

  /* =======================================================
     SELECTION

     Only payments this person could verify one at a time are selectable, so
     the bulk bar can never offer something a single row would refuse.
  ======================================================= */

  const needsOther = separateVerifier !== false;

  const selectable = useMemo(
    () =>
      permissions.paymentsVerify
        ? rows.filter(
            (row) => row.status === "Recorded" && !(needsOther && row.recorded_by === currentUserId),
          )
        : [],
    [rows, permissions.paymentsVerify, needsOther, currentUserId],
  );

  const blockedCount = useMemo(
    () =>
      permissions.paymentsVerify && needsOther
        ? rows.filter((row) => row.status === "Recorded" && row.recorded_by === currentUserId).length
        : 0,
    [rows, permissions.paymentsVerify, needsOther, currentUserId],
  );

  /*
   * Selection is cleared whenever the rows on screen change — a new page, a
   * new filter, or a status that moved under us. Acting on a selection made
   * against rows that are no longer displayed is how bulk tools go wrong.
   */
  const rowsKey = rows.map((row) => `${row.id}:${row.status}`).join(",");
  const [seenRowsKey, setSeenRowsKey] = useState(rowsKey);

  if (seenRowsKey !== rowsKey) {
    setSeenRowsKey(rowsKey);
    setSelected({});
  }

  const selectedRows = useMemo(() => selectable.filter((row) => selected[row.id]), [selectable, selected]);

  const allSelected = selectable.length > 0 && selectedRows.length === selectable.length;
  const someSelected = selectedRows.length > 0 && !allSelected;

  const toggleAll = () => {
    setSelected(allSelected ? {} : Object.fromEntries(selectable.map((row) => [row.id, true as const])));
  };

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  /* =======================================================
     EXPORT

     The export reads the same tab, search, filters and order as the screen,
     so what downloads is what was on display. page is dropped: an export is
     the whole result, not the slice someone happens to be looking at.
  ======================================================= */

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);

    try {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      params.set("tab", tab);
      params.set("sort", sortId);
      params.set("format", format);

      const result = await downloadExportFile(`/admin/sales/payments/export?${params.toString()}`);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.truncated && result.count !== null && result.total !== null
          ? `Exported the first ${result.count} of ${result.total} payments.`
          : `Exported as ${format === "excel" ? "Excel" : "PDF"}.`,
      );
    } finally {
      setExporting(null);
    }
  };

  /* =======================================================
     SUMMARY FALLBACK
  ======================================================= */

  const s = summary ?? {
    awaitingCount: 0,
    awaitingAmount: 0,
    verifiedMonth: 0,
    refundsAwaiting: 0,
    closed30d: 0,
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
        <div className="flex flex-col gap-2">
          <Link
            href="/admin/sales"
            className="text-body-sm text-text-muted hover:text-text-primary focus-visible:ring-primary inline-flex min-h-11 items-center gap-1.5 self-start rounded focus-visible:ring-2 focus-visible:outline-none sm:min-h-0"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Sales
          </Link>

          <div>
            <h1 className="text-h3">Payments</h1>

            <p className="text-body-sm text-text-muted">
              Check that money has arrived, then verify it. Only verified payments count toward a balance.
            </p>
          </div>
        </div>

        {permissions.export && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void handleExport("excel")}
              isLoading={exporting === "excel"}
              disabled={exporting !== null}
              leftIcon={<FileSpreadsheet className="size-4" aria-hidden="true" />}
              className="h-11 sm:h-10"
            >
              Excel
            </Button>

            <Button
              variant="outline"
              onClick={() => void handleExport("pdf")}
              isLoading={exporting === "pdf"}
              disabled={exporting !== null}
              leftIcon={<FileText className="size-4" aria-hidden="true" />}
              className="h-11 sm:h-10"
            >
              PDF
            </Button>
          </div>
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

      <section aria-label="Payment summary" className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <MetricCard
          label="Awaiting verification"
          value={s.awaitingCount}
          icon={<Clock />}
          caption="Recorded, not yet checked"
        />

        <MetricCard
          label="Amount waiting"
          value={s.awaitingAmount}
          prefix="AED "
          icon={<Wallet />}
          caption="Money in, to be verified"
        />

        <MetricCard
          label="Verified this month"
          value={s.verifiedMonth}
          prefix="AED "
          icon={<ShieldCheck />}
          caption="Net of refunds"
        />

        <MetricCard
          label="Refunds waiting"
          value={s.refundsAwaiting}
          icon={<Undo2 />}
          caption="To be verified"
        />

        <MetricCard
          label="Closed in 30 days"
          value={s.closed30d}
          icon={<CheckCheck />}
          caption="Rejected or reversed"
        />
      </section>

      {/* ===================================================
          FILTERS / RESULTS
      =================================================== */}

      <div className={cn("flex flex-col gap-4 transition-opacity", isPending && "opacity-75")}>
        {/* ===============================================
            TABS
        =============================================== */}

        <div
          role="group"
          aria-label="Filter payments"
          className="scrollbar-hidden border-border -mx-1 flex gap-1 overflow-x-auto border-b px-1"
        >
          {TABS.map((item) => {
            const active = tab === item.key;

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

                {item.key === "awaiting" && s.awaitingCount > 0 && (
                  <span className="bg-primary/10 text-primary ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                    {s.awaitingCount}
                  </span>
                )}

                {active && (
                  <motion.span
                    layoutId="payment-queue-underline"
                    transition={transition(0.25)}
                    className="bg-primary absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ===============================================
            SEARCH
        =============================================== */}

        <div className="max-w-md">
          <Input
            aria-label="Search payments"
            placeholder="Search deal, reservation, reference or customer..."
            leftIcon={<Search className="text-text-subtle size-4" aria-hidden="true" />}
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            className="h-11 rounded-lg text-base sm:h-10 sm:text-sm"
          />
        </div>

        {/* ===============================================
            FILTERS AND SORT
        =============================================== */}

        <PaymentFilterBar
          filters={filters}
          sortId={sortId}
          recorders={recorders}
          isPending={isPending}
          onFiltersChange={changeFilters}
          onSortChange={changeSort}
        />

        {/* ===============================================
            RESULTS
        =============================================== */}

        {data === null ? (
          <div role="alert" className="surface-card flex items-start gap-3 p-5">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />

            <div>
              <p className="text-body-sm text-text-primary font-medium">
                The payments couldn&apos;t be loaded.
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
              title={EMPTY[tab]}
              description="Payments appear here as they are recorded on deals and reservations."
              size="compact"
            />
          </div>
        ) : (
          <div className="surface-card overflow-hidden">
            {/* ===========================================
                SELECT ALL
            =========================================== */}

            {selectable.length > 0 && (
              <div className="border-border flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
                <label className="text-body-sm text-text-muted hover:text-text-primary inline-flex min-h-9 cursor-pointer items-center gap-2.5 transition-colors">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(element) => {
                      if (element) element.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="border-border accent-primary size-4 rounded"
                  />
                  Select all {selectable.length} on this page
                </label>

                {blockedCount > 0 && (
                  <p className="text-caption text-text-subtle">
                    {blockedCount} recorded by you {blockedCount === 1 ? "needs" : "need"} another verifier.
                  </p>
                )}
              </div>
            )}

            <ul className="divide-border divide-y">
              {rows.map((row, index) => {
                const canSelect = selectable.some((item) => item.id === row.id);

                return (
                  <PaymentRow
                    key={row.id}
                    payment={row}
                    index={index}
                    isSelected={Boolean(selected[row.id])}
                    selection={
                      selectable.length > 0 ? (
                        canSelect ? (
                          <label className="relative inline-flex size-4 cursor-pointer items-center justify-center before:absolute before:-inset-2.5 before:content-['']">
                            <input
                              type="checkbox"
                              aria-label={`Select the ${row.kind} of ${row.currency} ${row.amount} for ${
                                row.customer_name ?? "an unknown customer"
                              }`}
                              checked={Boolean(selected[row.id])}
                              onChange={() => toggleOne(row.id)}
                              className="border-border accent-primary size-4 rounded"
                            />
                          </label>
                        ) : (
                          <span className="block size-4" aria-hidden="true" />
                        )
                      ) : undefined
                    }
                    context={
                      <div className="text-body-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-text-primary font-medium">
                          {row.customer_name ?? "Unknown customer"}
                        </span>

                        {row.deal_id && row.deal_number && (
                          <Link
                            href={`/admin/sales/${row.deal_id}`}
                            className="text-primary-text hover:text-primary-hover"
                          >
                            {row.deal_number}
                          </Link>
                        )}

                        {!row.deal_id && row.reservation_id && row.reservation_number && (
                          <Link
                            href={`/admin/reservations/${row.reservation_id}`}
                            className="text-primary-text hover:text-primary-hover"
                          >
                            {row.reservation_number}
                          </Link>
                        )}

                        {row.vehicle_title && <span className="text-text-subtle">{row.vehicle_title}</span>}
                      </div>
                    }
                    actions={
                      <PaymentRowActions
                        payment={row}
                        permissions={permissions}
                        currentUserId={currentUserId}
                        separateVerifier={separateVerifier}
                        onAction={(payment, action) =>
                          setOpen({ payment: payment as PaymentQueueRow, action })
                        }
                      />
                    }
                  />
                );
              })}
            </ul>

            {/* ===========================================
                PAGINATION
            =========================================== */}

            <Pagination
              page={page}
              pageSize={PAYMENT_QUEUE_PAGE_SIZE}
              totalItems={data.totalCount}
              onPageChange={(next) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("page", String(next));
                navigate(params);
              }}
              itemLabel={{ singular: "payment", plural: "payments" }}
            />
          </div>
        )}
      </div>

      {/* ===================================================
          BULK BAR
      =================================================== */}

      <PaymentBulkBar
        selected={selectedRows}
        blockedCount={blockedCount}
        onClear={() => setSelected({})}
        onDone={() => {
          setSelected({});
          router.refresh();
        }}
      />

      {/* ===================================================
          STATUS DIALOG
      =================================================== */}

      {open && (
        <PaymentStatusDialog
          payment={open.payment}
          action={open.action}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
