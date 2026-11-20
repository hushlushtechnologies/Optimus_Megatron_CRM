"use client";

import { motion } from "motion/react";

import { useMotion } from "@/src/hooks/use-motion";
import type { EnquiryTypeCounts } from "@/src/lib/types/enquiry";
import { cn } from "@/src/lib/utils/cn";

interface EnquiryTypeTabsProps {
  /** The active types, in the order the workflow defines. */
  types: { key: string; label: string }[];
  /** "" is All Enquiries. */
  value: string;
  /** null when the counts couldn't be read — the tabs then show no numbers. */
  counts: EnquiryTypeCounts | null;
  onChange: (next: string) => void;
}

/**
 * What kind of request to show.
 *
 * The top-level split, above the status tabs, because "show me the trade-in
 * requests" is the question people arrive with. It writes the same `type`
 * URL parameter the filters used to own, so a link to a filtered list still
 * works and the tab lights up to match.
 *
 * Counts are of the rows clicking would produce — the current status tab,
 * search and filters all applied — so a tab never promises twelve and then
 * shows nine.
 */
export function EnquiryTypeTabs({ types, value, counts, onChange }: EnquiryTypeTabsProps) {
  const { transition } = useMotion();

  const tabs = [{ key: "", label: "All Enquiries" }, ...types];

  return (
    <div
      role="group"
      aria-label="Filter by what the enquiry is about"
      className="scrollbar-hidden -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
    >
      {tabs.map((tab) => {
        const active = value === tab.key;
        const count = tab.key === "" ? counts?.all : counts?.byType[tab.key];

        return (
          <button
            key={tab.key || "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.key)}
            className={cn(
              "text-body-sm relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3.5 font-medium transition-colors",
              active ? "text-primary-text" : "text-text-muted hover:text-text-primary",
            )}
          >
            {/*
              The fill sits behind the label and slides between tabs, so the
              eye follows the selection rather than re-finding it.
            */}
            {active && (
              <motion.span
                layoutId="enquiry-type-pill"
                transition={transition(0.25)}
                aria-hidden="true"
                className="bg-primary/12 border-primary/25 absolute inset-0 rounded-lg border"
              />
            )}

            <span className="relative z-10 whitespace-nowrap">{tab.label}</span>

            {count !== undefined && (
              <span
                className={cn(
                  "relative z-10 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                  active ? "bg-primary/20 text-primary-text" : "bg-card-hover text-text-muted",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
