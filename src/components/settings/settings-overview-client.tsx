"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Lock } from "lucide-react";

import { useMotion } from "@/src/hooks/use-motion";
import {
  SETTINGS_CATEGORIES,
  type SettingsPage,
} from "@/src/lib/types/settings-registry";

/*
|--------------------------------------------------------------------------
| THE SETTINGS OVERVIEW
|--------------------------------------------------------------------------
|
| One card per category, each listing the pages under it. The brief asks for
| "clear entry cards for each main category", and for settings to be
| understandable by non-technical showroom staff — which mostly means the
| first screen should answer "where would I find…?" without a click.
|
| So the card lists its pages rather than just naming the category. A card
| saying "Business Operations — how each module behaves" tells somebody
| almost nothing; the same card listing Inventory, Customers & Leads, Test
| Drives, Reservations, Enquiries, Sales, Payments and Reports tells them
| exactly where to go.
|
| Pages that are not built yet are listed in the same place, greyed, with a
| lock. Leaving them out would make the information architecture look
| complete when it is not, and would send somebody hunting for a setting
| that genuinely does not exist.
*/

interface SettingsOverviewClientProps {
  /** Already filtered to what this person may open. */
  pages: readonly SettingsPage[];
}

export function SettingsOverviewClient({ pages }: SettingsOverviewClientProps) {
  const { fadeUp } = useMotion();

  const categories = SETTINGS_CATEGORIES.filter((category) =>
    pages.some((page) => page.category === category.id),
  );

  if (categories.length === 0) {
    return (
      <p
        role="status"
        className="surface-card text-body-sm text-text-muted max-w-2xl p-5"
      >
        You don&apos;t have permission to view any settings. If you think you should,
        ask an administrator which areas you need.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {categories.map((category, index) => {
        const categoryPages = pages.filter((page) => page.category === category.id);
        const ready = categoryPages.filter((page) => page.status === "ready");
        const Icon = category.icon;

        return (
          <motion.section
            key={category.id}
            {...fadeUp(index)}
            aria-label={category.label}
            className="surface-card flex min-w-0 flex-col gap-4 p-5"
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start gap-2.5">
                <span className="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="text-primary-text size-4" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <h2 className="text-h4">{category.label}</h2>
                  <p className="text-caption text-text-subtle">
                    {ready.length} of {categoryPages.length} available
                  </p>
                </div>
              </div>
              <p className="text-body-sm text-text-muted">{category.description}</p>
            </div>

            <ul className="flex flex-col gap-0.5">
              {categoryPages.map((page) => {
                if (page.status === "planned") {
                  return (
                    <li key={page.id}>
                      <span
                        title={page.note}
                        aria-disabled="true"
                        className="text-body-sm text-text-subtle/70 flex min-h-9 items-center gap-2 rounded-lg px-2"
                      >
                        <span className="truncate">{page.label}</span>
                        <Lock className="size-3 shrink-0" aria-hidden="true" />
                        <span className="sr-only">Not available yet. {page.note}</span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={page.id}>
                    <Link
                      href={page.href}
                      className="text-body-sm text-text-muted hover:bg-card-hover hover:text-text-primary focus-visible:ring-primary group flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none sm:min-h-9"
                    >
                      <span className="truncate">{page.label}</span>
                      <ArrowRight
                        className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </motion.section>
        );
      })}
    </div>
  );
}
