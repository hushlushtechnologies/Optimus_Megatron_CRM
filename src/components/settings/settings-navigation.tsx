"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Lock } from "lucide-react";

import { cn } from "@/src/lib/utils/cn";
import {
  SETTINGS_CATEGORIES,
  type SettingsPage,
} from "@/src/lib/types/settings-registry";

/*
|--------------------------------------------------------------------------
| SETTINGS NAVIGATION
|--------------------------------------------------------------------------
|
| The brief asks for category navigation that works on a desktop, collapses
| on a tablet and becomes a list on a phone, and warns against squeezing a
| desktop panel beside a mobile form.
|
| So this is one component with two layouts rather than two components:
|
|   lg and up    a column beside the content, categories as headings
|   below lg     accordions, collapsed by default, with the open one
|                expanded — so a phone shows a short list of categories
|                and opens one at a time, which is what the brief describes
|
| WHY NOT A SECOND SIDEBAR
|
| The main application sidebar is permanently dark and fixed. Repeating that
| treatment here would give the page two competing navigation rails. This one
| is quiet by design: no panel, no border, just a column of links that reads
| as part of the content.
|
| PLANNED PAGES ARE SHOWN; UNAUTHORISED ONES ARE NOT
|
| A page that does not exist yet is listed, dimmed, with its reason in a
| tooltip — the same convention the main sidebar uses for "soon" modules.
| The absence is ours, and hiding it would just make people hunt for it.
|
| A page this person lacks permission to open is not listed at all. That
| absence is about them, there is nothing they can do about it, and a locked
| row would only advertise something they cannot have. The filtering happens
| on the server, in the layout.
*/

interface SettingsNavigationProps {
  /** Already filtered to what this person may open. */
  pages: readonly SettingsPage[];
}

export function SettingsNavigation({ pages }: SettingsNavigationProps) {
  const pathname = usePathname() ?? "";

  const categories = SETTINGS_CATEGORIES.filter((category) =>
    pages.some((page) => page.category === category.id),
  );

  /* On a phone the category containing the current page starts open and the
     rest start closed. On desktop the accordion state is ignored. */
  const currentCategory = pages.find((page) => pathname.startsWith(page.href))?.category;
  const [open, setOpen] = useState<string | null>(currentCategory ?? categories[0]?.id ?? null);

  return (
    <nav aria-label="Settings" className="flex flex-col gap-1 lg:gap-6">
      {categories.map((category) => {
        const categoryPages = pages.filter((page) => page.category === category.id);
        const isOpen = open === category.id;
        const Icon = category.icon;

        return (
          <div key={category.id} className="flex flex-col">
            {/* Phone and tablet: a button that opens the category. */}
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : category.id)}
              aria-expanded={isOpen}
              className="border-border hover:bg-card-hover focus-visible:ring-primary flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 text-left focus-visible:ring-2 focus-visible:outline-none lg:hidden"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon className="text-text-subtle size-4 shrink-0" aria-hidden="true" />
                <span className="text-body-sm text-text-primary truncate font-medium">
                  {category.label}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "text-text-subtle size-4 shrink-0 transition-transform motion-reduce:transition-none",
                  isOpen && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>

            {/* Desktop: a plain heading, always visible. */}
            <p className="text-caption text-text-subtle hidden items-center gap-2 px-3 pb-2 font-medium tracking-wide uppercase lg:flex">
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              {category.label}
            </p>

            <ul
              className={cn(
                "flex flex-col gap-0.5 py-1 lg:py-0",
                /* Collapsed on small screens, always open on desktop. */
                isOpen ? "flex" : "hidden lg:flex",
              )}
            >
              {categoryPages.map((page) => {
                const active = pathname === page.href || pathname.startsWith(`${page.href}/`);
                const planned = page.status === "planned";

                if (planned) {
                  return (
                    <li key={page.id}>
                      <span
                        title={page.note}
                        aria-disabled="true"
                        className="text-body-sm text-text-subtle/70 flex min-h-11 items-center gap-2 rounded-lg px-3 lg:min-h-9"
                      >
                        <span className="truncate">{page.label}</span>
                        <Lock className="size-3 shrink-0" aria-hidden="true" />
                        <span className="sr-only">
                          Not available yet. {page.note}
                        </span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={page.id}>
                    <Link
                      href={page.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "text-body-sm focus-visible:ring-primary flex min-h-11 items-center rounded-lg px-3 transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none lg:min-h-9",
                        active
                          ? "bg-primary/10 text-primary-text font-medium"
                          : "text-text-muted hover:bg-card-hover hover:text-text-primary",
                      )}
                    >
                      <span className="truncate">{page.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
