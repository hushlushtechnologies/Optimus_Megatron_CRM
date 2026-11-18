"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Banknote, CircleDot, FileText, History, Tag, TriangleAlert, UserRound } from "lucide-react";

import { useMotion } from "@/src/hooks/use-motion";
import { cn } from "@/src/lib/utils/cn";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import { AUDIT_KIND_LABEL, buildDealAudit, type AuditKind } from "@/src/lib/utils/sales-audit";

import type {
  DealActivityItem,
  DealPayment,
  DealPriceChange,
  DealStatusChange,
} from "@/src/lib/types/sales-detail";
import type { AssignmentHistoryItem } from "@/src/lib/types/sales-owner";
import type { SalesDocumentItem } from "@/src/lib/types/sales-documents";

interface DealAuditTabProps {
  statusChanges: DealStatusChange[] | null;
  priceHistory: DealPriceChange[] | null;
  payments: DealPayment[] | null;
  documents: SalesDocumentItem[] | null;
  assignments: AssignmentHistoryItem[] | null;
  timeline: DealActivityItem[] | null;
  currency: string;
}

const KIND_STYLE: Record<AuditKind, { icon: typeof CircleDot; className: string }> = {
  status: { icon: CircleDot, className: "bg-primary/15 text-primary" },
  pricing: { icon: Tag, className: "bg-info/15 text-info" },
  payment: { icon: Banknote, className: "bg-success/15 text-success" },
  document: { icon: FileText, className: "bg-warning/15 text-warning" },
  owner: { icon: UserRound, className: "bg-card-hover text-text-muted" },
  activity: { icon: History, className: "bg-card-hover text-text-subtle" },
};

const FILTERS: (AuditKind | "all")[] = [
  "all",
  "status",
  "pricing",
  "payment",
  "document",
  "owner",
  "activity",
];

/**
 * One ordered history of everything that happened to a deal.
 *
 * Built from the records the page has already loaded, so it costs no extra
 * queries and can never contradict the individual tabs. When a source failed
 * to load it says so, rather than quietly showing a shorter history.
 */
export function DealAuditTab(props: DealAuditTabProps) {
  const { fadeUp } = useMotion();
  const [filter, setFilter] = useState<AuditKind | "all">("all");

  const { entries, unavailable } = useMemo(() => buildDealAudit(props), [props]);

  const counts = useMemo(() => {
    const result = new Map<AuditKind, number>();
    entries.forEach((entry) => result.set(entry.kind, (result.get(entry.kind) ?? 0) + 1));
    return result;
  }, [entries]);

  const visible = filter === "all" ? entries : entries.filter((entry) => entry.kind === filter);

  return (
    <section aria-label="Audit history" className="surface-card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label">Audit history</p>
          <p className="text-caption text-text-subtle mt-1">
            Every recorded change to this deal, newest first.
          </p>
        </div>

        <p className="text-caption text-text-subtle tabular-nums">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </p>
      </div>

      {unavailable.length > 0 && (
        <p
          role="alert"
          className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span>
            This history is incomplete: {unavailable.join(", ")} couldn&apos;t be loaded. Refresh the page to
            try again.
          </span>
        </p>
      )}

      {/* Filter */}
      <div role="group" aria-label="Filter history" className="flex flex-wrap gap-1.5">
        {FILTERS.map((option) => {
          const isSelected = filter === option;
          const count = option === "all" ? entries.length : (counts.get(option) ?? 0);

          if (option !== "all" && count === 0) return null;

          return (
            <button
              key={option}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setFilter(option)}
              className={cn(
                "text-caption focus-visible:ring-primary inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none",
                isSelected
                  ? "border-primary/60 bg-primary/10 text-primary-text"
                  : "border-border text-text-muted hover:text-text-primary",
              )}
            >
              {option === "all" ? "Everything" : AUDIT_KIND_LABEL[option]}
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-10 text-center">
          {entries.length === 0 ? "Nothing has been recorded on this deal yet." : "No entries of that kind."}
        </p>
      ) : (
        <ol className="flex flex-col">
          {visible.map((entry, index) => {
            const { icon: Icon, className } = KIND_STYLE[entry.kind];
            const isLast = index === visible.length - 1;

            return (
              <motion.li key={entry.id} {...fadeUp(index)} className="relative flex gap-3 pb-4 last:pb-0">
                {/* Spine */}
                {!isLast && (
                  <span aria-hidden="true" className="bg-border absolute top-8 bottom-0 left-[15px] w-px" />
                )}

                <span
                  className={cn(
                    "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
                    className,
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-body-sm text-text-primary font-medium">{entry.title}</p>

                  {entry.detail && (
                    <p className="text-body-sm text-text-muted mt-0.5 break-words">{entry.detail}</p>
                  )}

                  <p className="text-caption text-text-subtle mt-1">
                    {entry.actor} · <time dateTime={entry.at}>{formatDateTimeFull(entry.at)}</time>
                  </p>
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
