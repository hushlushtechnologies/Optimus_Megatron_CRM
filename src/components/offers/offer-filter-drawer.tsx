"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarDays,
  ChevronDown,
  Percent,
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

import {
  PROMOTION_STATUSES,
  PROMOTION_TYPES,
  PROMOTION_TYPE_LABELS,
} from "@/src/lib/types/offers";
import {
  EMPTY_OFFER_FILTERS,
  countActiveOfferFilters,
  type OfferFilters,
} from "@/src/lib/types/offer-list";

/*
|--------------------------------------------------------------------------
| THE OFFER FILTER DRAWER
|--------------------------------------------------------------------------
|
| The same drawer Sales, Leads, Customers, Inventory, Test Drives and
| Enquiries use. Choices are a draft until Apply, closing with unsaved
| changes asks first, and on a phone it is a full-height sheet rather than a
| panel pushing the table off the screen.
|
| Built on the shared Input, Select, Button and ConfirmDialog, with the same
| collapsible Section as the enquiry drawer — not a second implementation of
| the same idea.
*/

interface OfferFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: OfferFilters;
  onApply: (next: OfferFilters) => void;
  staff: { id: string; full_name: string }[];
  /** True when the tab in view already pins the status, so the control is hidden. */
  statusLocked: boolean;
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

export function OfferFilterDrawer(props: OfferFilterDrawerProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {props.isOpen && <OfferFilterDrawerContent key="offer-filters" {...props} />}
    </AnimatePresence>,
    document.body,
  );
}

/*
 * Mounted only while open, so the draft starts from the applied filters each
 * time rather than holding a stale set from last time.
 */
function OfferFilterDrawerContent({
  onClose,
  filters,
  onApply,
  staff,
  statusLocked,
}: OfferFilterDrawerProps) {
  const { reduce, transition } = useMotion();

  const [draft, setDraft] = useState<OfferFilters>(filters);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const key = (value: OfferFilters) => JSON.stringify(value);
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

  const patch = (change: Partial<OfferFilters>) => setDraft((prev) => ({ ...prev, ...change }));

  const selectedCount = countActiveOfferFilters(draft);
  const invalidDates = Boolean(draft.from && draft.to && draft.from > draft.to);

  const apply = () => {
    if (invalidDates) return;
    onApply(draft);
    onClose();
  };

  /* How many choices sit inside each group, for the badge on its header. */
  const campaignCount = [draft.type, statusLocked ? "" : draft.status].filter(Boolean).length;
  const discountCount = [draft.discountType].filter(Boolean).length;
  const peopleCount = [draft.createdBy].filter(Boolean).length;
  const timingCount = [draft.from, draft.to].filter(Boolean).length;

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
              <SlidersHorizontal className="size-3.5" aria-hidden="true" /> Campaign workspace
            </div>

            <h2 id={titleId} className="text-text-primary text-xl font-semibold tracking-tight">
              Filter campaigns
            </h2>

            <p className="text-text-muted mt-1 text-xs">Narrow the list without losing your place.</p>
          </div>

          <button
            type="button"
            onClick={requestClose}
            aria-label="Close filters"
            className="text-text-muted hover:text-text-primary hover:bg-card-hover focus-visible:outline-primary -mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          {/* ---- Campaign ---- */}

          <Section
            title="Campaign"
            icon={<Tag className="size-4" aria-hidden="true" />}
            count={campaignCount}
            defaultOpen
          >
            <Select
              label="Type"
              value={draft.type}
              onChange={(event) => patch({ type: event.target.value })}
              options={[
                { value: "", label: "Any type" },
                ...PROMOTION_TYPES.map((type) => ({
                  value: type,
                  label: PROMOTION_TYPE_LABELS[type],
                })),
              ]}
            />

            {/*
              Hidden while a status tab is in view. Offering a status filter
              that the tab above has already decided is how somebody picks
              "Draft" on the Running tab and gets an empty list with no
              explanation.
            */}
            {!statusLocked && (
              <Select
                label="Status"
                value={draft.status}
                onChange={(event) => patch({ status: event.target.value })}
                options={[
                  { value: "", label: "Any status" },
                  ...PROMOTION_STATUSES.map((status) => ({
                    value: status,
                    label: status.charAt(0).toUpperCase() + status.slice(1),
                  })),
                ]}
              />
            )}
          </Section>

          {/* ---- Discount ---- */}

          <Section
            title="Discount"
            icon={<Percent className="size-4" aria-hidden="true" />}
            count={discountCount}
          >
            <Select
              label="Discount type"
              value={draft.discountType}
              onChange={(event) => patch({ discountType: event.target.value })}
              options={[
                { value: "", label: "Any" },
                { value: "percentage", label: "Percentage off" },
                { value: "fixed", label: "Fixed amount off" },
              ]}
            />
          </Section>

          {/* ---- People ---- */}

          <Section
            title="People"
            icon={<UserRound className="size-4" aria-hidden="true" />}
            count={peopleCount}
          >
            <Select
              label="Created by"
              value={draft.createdBy}
              onChange={(event) => patch({ createdBy: event.target.value })}
              options={[
                { value: "", label: "Anyone" },
                ...staff.map((person) => ({ value: person.id, label: person.full_name })),
              ]}
            />
          </Section>

          {/* ---- Timing ---- */}

          <Section
            title="Timing"
            icon={<CalendarDays className="size-4" aria-hidden="true" />}
            count={timingCount}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Created from"
                type="date"
                value={draft.from}
                max={draft.to || undefined}
                onChange={(event) => patch({ from: event.target.value })}
              />

              <Input
                label="Created until"
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
              onClick={() => setDraft(EMPTY_OFFER_FILTERS)}
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
