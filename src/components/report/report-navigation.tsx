"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "motion/react";

import { cn } from "@/src/lib/utils/cn";
import type { ReportSection } from "@/src/lib/types/report-sections";

/*
|--------------------------------------------------------------------------
| MOVING BETWEEN REPORTS
|--------------------------------------------------------------------------
|
| Links, not tabs.
|
| There is a Tabs component in the UI library and it is the wrong tool here:
| it holds the active tab in React state, so the chosen report would not
| survive a refresh, could not be bookmarked, and could not be sent to
| somebody. Each report is its own route, so navigation is navigation.
|
| The period and any filters travel with you. Switching from Sales to
| Payments while looking at last quarter should land on last quarter —
| rebuilding the period after every move is the kind of friction that stops
| people cross-checking two reports, which is most of what a reporting
| workspace is for.
|
| Only sections the person may open are passed in. A section they cannot open
| is absent rather than disabled: a row of greyed-out links is a list of
| things to resent.
*/

interface ReportNavigationProps {
  /** Only the sections this person may open, already filtered. */
  sections: readonly ReportSection[];
}

/** Params that mean the same thing in every section and should follow along. */
const PORTABLE_PARAMS = ["range", "from", "to", "location", "staff"];

export function ReportNavigation({ sections }: ReportNavigationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (sections.length <= 1) return null;

  /*
   * Section-specific params are deliberately dropped. Carrying the sales
   * report's `view=table` into Payments would do nothing, and carrying a
   * `brand` filter into a report with no brand column would narrow nothing
   * while showing a chip that says it did.
   */
  const carried = new URLSearchParams();
  for (const key of PORTABLE_PARAMS) {
    const value = searchParams.get(key);
    if (value) carried.set(key, value);
  }

  const suffix = carried.toString() ? `?${carried.toString()}` : "";

  return (
    <nav aria-label="Reports" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex min-w-max items-center gap-1">
        {sections.map((section) => {
          /* Exact match for the overview, prefix match for the rest, so
             /admin/reports/sales does not light up Overview too. */
          const active =
            section.href === "/admin/reports"
              ? pathname === "/admin/reports"
              : pathname.startsWith(section.href);

          return (
            <li key={section.id}>
              <Link
                href={`${section.href}${suffix}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-10 items-center rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors",
                  /* 44px touch target on a phone, where this row scrolls. */
                  "sm:h-9",
                  active ? "text-[#0b1220]" : "text-text-muted hover:text-text-primary",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="report-nav-active"
                    className="bg-primary absolute inset-0 rounded-lg"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative z-10">{section.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
