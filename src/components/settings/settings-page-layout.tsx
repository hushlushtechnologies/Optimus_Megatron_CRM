import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";

import {
  findSettingsCategory,
  SETTINGS_ROOT,
  type SettingsPage,
} from "@/src/lib/types/settings-registry";

/*
|--------------------------------------------------------------------------
| THE SHAPE EVERY SETTINGS PAGE TAKES
|--------------------------------------------------------------------------
|
| Breadcrumb, title, description, an optional link to the module being
| configured, then the content. One component so twenty-four pages cannot
| drift into twenty-four slightly different headers.
|
| The breadcrumb is Settings > Category > Page. The category is not a link:
| there is no category index page, and a crumb that does nothing is worse
| than a crumb that is plainly just context.
|
| The module link matters more than it looks. Somebody who has just changed
| the discount threshold usually wants to go and look at a deal. Without it
| they go back through the sidebar, and the settings page feels like a
| cul-de-sac.
*/

interface SettingsPageLayoutProps {
  page: SettingsPage;
  /**
   * Shown under the description when this person may read but not change.
   * The controls themselves are disabled by the page; this explains why.
   */
  readOnlyNote?: string;
  children: React.ReactNode;
}

export function SettingsPageLayout({
  page,
  readOnlyNote,
  children,
}: SettingsPageLayoutProps) {
  const category = findSettingsCategory(page.category);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-3">
        <nav aria-label="Breadcrumb">
          <ol className="text-caption text-text-subtle flex flex-wrap items-center gap-1.5">
            <li>
              <Link
                href={SETTINGS_ROOT}
                className="hover:text-text-primary focus-visible:ring-primary rounded focus-visible:ring-2 focus-visible:outline-none"
              >
                Settings
              </Link>
            </li>
            {category && (
              <>
                <li aria-hidden="true">
                  <ChevronRight className="size-3" />
                </li>
                <li>{category.label}</li>
              </>
            )}
            <li aria-hidden="true">
              <ChevronRight className="size-3" />
            </li>
            <li aria-current="page" className="text-text-muted">
              {page.label}
            </li>
          </ol>
        </nav>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-h2">{page.label}</h1>
            <p className="text-body-sm text-text-muted">{page.description}</p>
          </div>

          {page.moduleHref && (
            <Link
              href={page.moduleHref}
              className="text-body-sm text-primary-text hover:text-primary-hover focus-visible:ring-primary inline-flex shrink-0 items-center gap-1 rounded focus-visible:ring-2 focus-visible:outline-none"
            >
              Go to the module
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>

        {readOnlyNote && (
          <p
            role="note"
            className="border-border bg-card-hover text-body-sm text-text-muted rounded-lg border px-4 py-3"
          >
            {readOnlyNote}
          </p>
        )}
      </header>

      {children}
    </div>
  );
}
