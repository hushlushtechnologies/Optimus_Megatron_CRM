"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarDays,
  ChevronDown,
  Filter,
  Flag,
  RotateCcw,
  SlidersHorizontal,
  Tag,
  UserRound,
  X,
} from "lucide-react";

import { useFocusTrap } from "@/src/hooks/use-focus-trap";
import { useMotion } from "@/src/hooks/use-motion";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";

import { ENQUIRY_PRIORITIES } from "@/src/lib/types/enquiry";
import {
  EMPTY_ENQUIRY_FILTERS,
  ENQUIRY_FOLLOW_UP_LABELS,
  ENQUIRY_FOLLOW_UP_STATES,
  UNASSIGNED,
  countActiveEnquiryFilters,
  type EnquiryFilters,
} from "@/src/lib/utils/enquiry-filters";

/*
|--------------------------------------------------------------------------
| THE ENQUIRY FILTER DRAWER
|--------------------------------------------------------------------------
|
| The same drawer every other module uses — Sales, Leads, Customers,
| Inventory and Test Drives all have one of these, and this module was the
| only one expanding its filters inline instead.
|
| Three things the drawer gives that an inline panel does not: the list stays
| where it was while you choose, a half-finished set of choices can be
| cancelled without applying anything, and on a phone it is a full-height
| sheet rather than a panel pushing the table off the screen.
|
| Choices are a draft until Apply. Closing with unsaved changes asks first,
| because losing six choices to a stray click on the backdrop is worse than
| one extra confirmation.
*/

/**
 * A filter choice as the page builds it.
 *
 * `key` rather than `value` because that is the shape the enquiry workflow
 * lookups already return; it is mapped to Select's own shape below.
 */
export interface FilterOption {
  key: string;
  label: string;
}

const toSelectOptions = (options: FilterOption[]) =>
  options.map((option) => ({ value: option.key, label: option.label }));

interface EnquiryFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: EnquiryFilters;
  onApply: (next: EnquiryFilters) => void;
  staff: { id: string; full_name: string }[];
  /** Only the statuses that belong to the tab in view. */
  statuses: FilterOption[];
  sources: FilterOption[];
  locations: { id: string; name: string }[];
}

/* =========================================================
   A COLLAPSIBLE GROUP
========================================================= */

function Section({
  title,
  icon,
  count = 0,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="border-border bg-card-hover/40 group rounded-lg border"
      ref={(node) => {
        /* Set once, so re-rendering doesn't fold a group the person opened. */
        if (node && !node.dataset.initialized) {
          node.open = defaultOpen;
          node.dataset.initialized = "true";
        }
      }}
    >
      <summary className="focus-visible:outline-primary flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
        <span className="text-primary">{icon}</span>
        <span className="text-text-primary flex-1 text-sm font-semibold">{title}</span>

        {count > 0 && (
          <span className="bg-primary/10 text-primary rounded-md px-2 py-0.5 text-xs font-semibold">
            {count}
          </span>
        )}

        <ChevronDown
          aria-hidden="true"
          className="text-text-muted size-4 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>

      <div className="border-border space-y-4 border-t px-4 py-4">{children}</div>
    </details>
  );
}

/* =========================================================
   DRAWER
========================================================= */

export function EnquiryFilterDrawer(props: EnquiryFilterDrawerProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {props.isOpen && <EnquiryFilterDrawerContent key="enquiry-filters" {...props} />}
    </AnimatePresence>,
    document.body,
  );
}

/*
 * Mounted only while open, so the draft starts from the applied filters each
 * time rather than holding a stale set from last time.
 */
function EnquiryFilterDrawerContent({
  onClose,
  filters,
  onApply,
  staff,
  statuses,
  sources,
  locations,
}: EnquiryFilterDrawerProps) {
  const { reduce, transition } = useMotion();

  const [draft, setDraft] = useState<EnquiryFilters>(filters);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const key = (value: EnquiryFilters) => JSON.stringify(value);
  const dirty = key(draft) !== key(filters);

  const requestClose = useCallback(() => {
    if (dirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onClose();
  }, [dirty, onClose]);

  useFocusTrap(panelRef, true, requestClose);

  /* The page behind must not scroll while a full-height sheet is over it. */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const patch = (change: Partial<EnquiryFilters>) => setDraft((prev) => ({ ...prev, ...change }));

  const selectedCount = countActiveEnquiryFilters(draft);
  const invalidDates = Boolean(draft.from && draft.to && draft.from > draft.to);

  const apply = () => {
    if (invalidDates) return;
    onApply(draft);
    onClose();
  };

  /* How many choices sit inside each group, for the badge on its header. */
  const statusCount = [draft.status, draft.priority].filter(Boolean).length;
  const peopleCount = [draft.assignedTo, draft.location].filter(Boolean).length;
  const timingCount = [draft.followUp, draft.from, draft.to].filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-black/65 backdrop-blur-[3px]"
        onClick={requestClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transition(0.2)}
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ x: reduce ? 0 : "100%", opacity: reduce ? 0 : 1 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: reduce ? 0 : "100%", opacity: reduce ? 0 : 1 }}
        transition={transition(0.28)}
        className="border-border bg-card relative z-10 flex h-dvh w-full max-w-[460px] flex-col overflow-hidden border-l shadow-2xl"
      >
        <div className="bg-gradient-primary h-1 shrink-0" />

        <header className="border-border flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <div>
            <div className="text-primary mb-1 flex items-center gap-2 text-xs font-semibold tracking-[0.15em] uppercase">
              <SlidersHorizontal className="size-3.5" aria-hidden="true" /> Enquiry workspace
            </div>

            <h2 id={titleId} className="text-text-primary text-xl font-semibold tracking-tight">
              Filter enquiries
            </h2>

            <p className="text-text-muted mt-1 text-xs">Narrow the list without losing your place.</p>
          </div>

          <button
            type="button"
            onClick={requestClose}
            aria-label="Close enquiry filters"
            className="border-border text-text-muted hover:border-primary/40 hover:bg-card-hover hover:text-text-primary flex size-11 shrink-0 items-center justify-center rounded-md border transition-colors sm:size-9"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 scrollbar-none flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
          <div className="border-border bg-base/60 flex items-center justify-between rounded-lg border px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <Filter className="text-primary size-4" aria-hidden="true" />
              <span className="text-text-primary text-sm font-medium">
                {selectedCount === 0
                  ? "No filters chosen"
                  : `${selectedCount} ${selectedCount === 1 ? "filter" : "filters"} chosen`}
              </span>
            </div>

            {dirty && <span className="text-primary text-xs font-semibold">Not applied yet</span>}
          </div>

          {/* ---- Status and priority ---- */}

          <Section
            title="Status and priority"
            icon={<Tag className="size-4" aria-hidden="true" />}
            count={statusCount}
            defaultOpen
          >
            <Select
              label="Status"
              value={draft.status}
              onChange={(event) => patch({ status: event.target.value })}
              options={[{ value: "", label: "Any status" }, ...toSelectOptions(statuses)]}
              hint="Only the statuses that belong to the tab you are on."
            />

            <Select
              label="Priority"
              value={draft.priority}
              onChange={(event) => patch({ priority: event.target.value })}
              options={[
                { value: "", label: "Any priority" },
                ...ENQUIRY_PRIORITIES.map((value) => ({ value, label: value })),
              ]}
            />
          </Section>

          {/* ---- Where it came from ---- */}

          <Section
            title="Source"
            icon={<Flag className="size-4" aria-hidden="true" />}
            count={draft.source ? 1 : 0}
          >
            <Select
              label="Source"
              value={draft.source}
              onChange={(event) => patch({ source: event.target.value })}
              options={[{ value: "", label: "Anywhere" }, ...toSelectOptions(sources)]}
            />
          </Section>

          {/* ---- Who and where ---- */}

          <Section
            title="Staff and showroom"
            icon={<UserRound className="size-4" aria-hidden="true" />}
            count={peopleCount}
          >
            <Select
              label="Assigned to"
              value={draft.assignedTo}
              onChange={(event) => patch({ assignedTo: event.target.value })}
              options={[
                { value: "", label: "Anyone" },
                { value: UNASSIGNED, label: "Nobody yet" },
                ...staff.map((member) => ({ value: member.id, label: member.full_name })),
              ]}
            />

            <Select
              label="Showroom"
              value={draft.location}
              onChange={(event) => patch({ location: event.target.value })}
              options={[
                { value: "", label: "Every showroom" },
                ...locations.map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          </Section>

          {/* ---- Timing ---- */}

          <Section
            title="Follow-up and dates"
            icon={<CalendarDays className="size-4" aria-hidden="true" />}
            count={timingCount}
          >
            <Select
              label="Follow-up"
              value={draft.followUp}
              onChange={(event) =>
                patch({ followUp: event.target.value as EnquiryFilters["followUp"] })
              }
              options={[
                { value: "", label: "Any" },
                ...ENQUIRY_FOLLOW_UP_STATES.map((state) => ({
                  value: state,
                  label: ENQUIRY_FOLLOW_UP_LABELS[state],
                })),
              ]}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Received from"
                type="date"
                value={draft.from}
                max={draft.to || undefined}
                onChange={(event) => patch({ from: event.target.value })}
              />

              <Input
                label="Received until"
                type="date"
                value={draft.to}
                min={draft.from || undefined}
                onChange={(event) => patch({ to: event.target.value })}
                error={invalidDates ? "This is before the start date." : undefined}
              />
            </div>
          </Section>
        </div>

        <footer className="border-border bg-card shrink-0 border-t px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              /* Type comes from the tabs above, so clearing must not move them. */
              onClick={() => setDraft({ ...EMPTY_ENQUIRY_FILTERS, type: filters.type })}
              disabled={selectedCount === 0}
              className="text-text-muted hover:text-primary inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" /> Clear all
            </button>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={requestClose}>
                Cancel
              </Button>

              <Button onClick={apply} disabled={invalidDates}>
                Apply{selectedCount ? ` (${selectedCount})` : " filters"}
              </Button>
            </div>
          </div>
        </footer>
      </motion.div>

      <ConfirmDialog
        isOpen={confirmDiscardOpen}
        onClose={() => setConfirmDiscardOpen(false)}
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          onClose();
        }}
        title="Discard these filters?"
        description="You have chosen filters but not applied them. Closing now loses those choices."
        confirmLabel="Discard"
        cancelLabel="Keep choosing"
      />
    </div>
  );
}
