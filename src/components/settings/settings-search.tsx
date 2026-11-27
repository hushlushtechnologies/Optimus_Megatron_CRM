"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Search, X } from "lucide-react";

import { cn } from "@/src/lib/utils/cn";
import {
  findSettingsCategory,
  searchSettings,
  type SettingsPage,
} from "@/src/lib/types/settings-registry";

/*
|--------------------------------------------------------------------------
| SETTINGS SEARCH
|--------------------------------------------------------------------------
|
| The brief's own examples are the specification:
|
|   "Reservation deposit"  ->  Business Operations -> Reservations
|   "Loyalty points"       ->  Marketing & Loyalty -> Loyalty Points
|   "Discount approval"    ->  Business Operations -> Sales & Pricing
|
| All three work because the registry carries keywords: "deposit" is not in
| the Reservations label or description, so without keywords that first
| example finds nothing. The test asserts all three.
|
| The result shows the path, not just the page, because somebody searching
| "deposit" is also learning where deposits live — and next time they will
| navigate there directly.
|
| A planned page still appears in results, dimmed and not clickable, with
| its reason. Silently omitting it would send somebody looking for a setting
| that genuinely is not there yet round the whole tree before giving up.
|
| Searching is client-side over a list of two dozen entries. There is no
| reason for this to touch the network.
*/

export function SettingsSearch() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchSettings(term), [term]);
  const showResults = focused && term.trim().length > 0;

  const go = (page: SettingsPage) => {
    if (page.status !== "ready") return;
    setTerm("");
    setFocused(false);
    router.push(page.href);
  };

  return (
    <div className="relative w-full sm:max-w-sm">
      <label htmlFor="settings-search" className="sr-only">
        Search settings
      </label>

      <Search
        className="text-text-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden="true"
      />

      <input
        ref={inputRef}
        id="settings-search"
        type="search"
        value={term}
        placeholder="Search settings"
        autoComplete="off"
        role="combobox"
        aria-expanded={showResults}
        aria-controls="settings-search-results"
        onChange={(event) => setTerm(event.target.value)}
        onFocus={() => setFocused(true)}
        /* A click on a result must land before the list unmounts, so the
           blur is deferred rather than immediate. */
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setTerm("");
            inputRef.current?.blur();
          }
          if (event.key === "Enter" && results.length > 0) {
            const first = results.find((page) => page.status === "ready");
            if (first) go(first);
          }
        }}
        className="border-border bg-card text-body-sm text-text-primary placeholder:text-text-subtle focus-visible:ring-primary h-11 w-full rounded-lg border pr-9 pl-9 focus-visible:ring-2 focus-visible:outline-none sm:h-10"
      />

      {term.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setTerm("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="text-text-subtle hover:text-text-primary focus-visible:ring-primary absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}

      {showResults && (
        <div
          id="settings-search-results"
          role="listbox"
          aria-label="Search results"
          className="border-border bg-card absolute top-full right-0 left-0 z-20 mt-1.5 max-h-80 overflow-y-auto rounded-lg border shadow-lg"
        >
          {results.length === 0 ? (
            <p className="text-body-sm text-text-muted px-3 py-3">
              Nothing matches “{term.trim()}”.
            </p>
          ) : (
            <ul className="py-1">
              {results.map((page) => {
                const category = findSettingsCategory(page.category);
                const planned = page.status === "planned";

                return (
                  <li key={page.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      aria-disabled={planned}
                      disabled={planned}
                      onClick={() => go(page)}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left",
                        planned
                          ? "cursor-default opacity-60"
                          : "hover:bg-card-hover focus-visible:bg-card-hover focus-visible:outline-none",
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="text-body-sm text-text-primary font-medium">
                          {page.label}
                        </span>
                        {planned && (
                          <>
                            <Lock className="text-text-subtle size-3" aria-hidden="true" />
                            <span className="sr-only">Not available yet</span>
                          </>
                        )}
                      </span>
                      <span className="text-caption text-text-subtle">
                        {category?.label}
                        {planned && page.note ? ` — ${page.note}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
