import Link from "next/link";
import { LayoutGrid, List, Plus, Tag, TriangleAlert } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { OffersOverview } from "@/src/components/offers/offers-overview";
import { OffersListClient } from "@/src/components/offers/offers-list-client";
import { currentUserOfferPermissions } from "@/src/lib/supabase/offer-permissions";
import { getOfferList, getOfferLookups, getOfferSummary } from "@/src/lib/supabase/offer-queries";
import {
  parseOfferFilters,
  parseOfferPage,
  parseOfferSearch,
  parseOfferSort,
  parseOfferTab,
} from "@/src/lib/utils/offer-list-params";
import { cn } from "@/src/lib/utils/cn";

export const metadata = {
  title: "Offers & Promotions",
};

const PAGE_SIZE = 25;

/*
|--------------------------------------------------------------------------
| TWO VIEWS, ONE ROUTE
|--------------------------------------------------------------------------
|
| Overview answers "what's happening" — running now, starting soon, what
| needs a look. All Campaigns is the workhorse: search, filter, sort, bulk.
|
| One route rather than two, because the sidebar is flat: a second route
| would be reachable only from a link on this page, and the management table
| is too central to hide behind one. The view lives in the URL, so a filtered
| list can be linked to and bookmarked.
*/

type Params = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function OffersPage({ searchParams }: { searchParams: Params }) {
  const permissions = await currentUserOfferPermissions();

  if (!permissions.view) {
    return (
      <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="text-warning mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-body-sm text-text-primary font-medium">
            You don&apos;t have permission to view offers.
          </p>
          <p className="text-body-sm text-text-muted mt-1">
            Ask an administrator if you need access.
          </p>
          <Link
            href="/admin"
            className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block"
          >
            Back to the dashboard
          </Link>
        </div>
      </div>
    );
  }

  const params = await searchParams;

  const view = one(params.view) === "all" ? "all" : "overview";

  /* ---- Header, shared by both views ---- */

  const header = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h2 text-text-primary flex items-center gap-2">
            <Tag className="text-primary size-5" aria-hidden="true" />
            Offers &amp; Promotions
          </h1>
          <p className="text-body-sm text-text-muted mt-1">
            Campaigns, private customer offers and the loyalty program.
          </p>
        </div>

        {permissions.manage && (
          <Link href="/admin/offers/new">
            <Button
              variant="gradient"
              size="sm"
              leftIcon={<Plus className="size-4" aria-hidden="true" />}
            >
              New Promotion
            </Button>
          </Link>
        )}
      </div>

      {/*
        Two views, as links rather than buttons: they are two addresses, so
        they can be opened in a new tab, bookmarked and shared, and they work
        before any JavaScript has loaded.
      */}
      <div
        role="group"
        aria-label="Switch view"
        className="border-border inline-flex w-fit gap-1 rounded-lg border p-1"
      >
        {(
          [
            { key: "overview", label: "Overview", icon: LayoutGrid },
            { key: "all", label: "All Campaigns", icon: List },
          ] as const
        ).map((item) => {
          const active = view === item.key;
          const Icon = item.icon;

          return (
            <Link
              key={item.key}
              href={item.key === "overview" ? "/admin/offers" : "/admin/offers?view=all"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-body-sm inline-flex min-h-9 items-center gap-2 rounded-md px-3 font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:text-text-primary hover:bg-card-hover",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );

  /* =======================================================
     OVERVIEW
  ======================================================= */

  if (view === "overview") {
    const summary = await getOfferSummary();

    return (
      <div className="flex flex-col gap-6">
        {header}
        <OffersOverview summary={summary} permissions={permissions} />
      </div>
    );
  }

  /* =======================================================
     ALL CAMPAIGNS
  ======================================================= */

  /*
   * Phase 24: parsed by the shared helpers rather than inline here, so the
   * export route reads the URL exactly as this page does. A file that claims
   * to hold "the campaigns on screen" stops being true the moment there are
   * two copies of this parsing — a filter added here and missed there is a
   * file with more rows in it than the person was looking at.
   */
  const tab = parseOfferTab(params.tab);
  const sortId = parseOfferSort(params.sort);
  const search = parseOfferSearch(params.q);
  const page = parseOfferPage(params.page);
  const filters = parseOfferFilters(params);

  const [data, lookups] = await Promise.all([
    getOfferList({ tab, search, filters, sortId, page, pageSize: PAGE_SIZE }),
    getOfferLookups(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {header}

      <OffersListClient
        data={data}
        tab={tab}
        search={search}
        page={page}
        pageSize={PAGE_SIZE}
        filters={filters}
        sortId={sortId}
        staff={lookups.staff}
        permissions={permissions}
      />
    </div>
  );
}
