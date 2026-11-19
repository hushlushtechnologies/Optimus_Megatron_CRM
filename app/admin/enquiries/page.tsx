import Link from "next/link";
import { redirect } from "next/navigation";

import { TriangleAlert } from "lucide-react";

import { getMyEnquiryPermissions } from "@/src/lib/supabase/enquiry-permissions";
import { getEnquiryList, getEnquiryLookups, getEnquirySummary } from "@/src/lib/supabase/enquiry-queries";
import { createClient } from "@/src/lib/supabase/server";

import { ENQUIRY_PAGE_SIZE } from "@/src/lib/constants/enquiries";
import {
  parseEnquiryFilters,
  parseEnquirySort,
  parseEnquiryTab,
  writeEnquiryFiltersToParams,
} from "@/src/lib/utils/enquiry-filters";
import { readParam } from "@/src/lib/utils/test-drive-list-filters";

import { EnquiriesClient } from "@/src/components/enquiries/enquiries-client";

interface EnquiriesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EnquiriesPage({ searchParams }: EnquiriesPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const permissions = user ? await getMyEnquiryPermissions(supabase) : null;

  /* =======================================================
     PERMISSION CHECK
  ======================================================= */

  if (!user || !permissions || !permissions.view) {
    return (
      <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />

        <div>
          <p className="text-body-sm text-text-primary font-medium">
            You don&apos;t have permission to view enquiries.
          </p>

          <p className="text-body-sm text-text-muted mt-1">
            Enquiries hold the contact details of people who have written in, so access is granted by role.
            Ask an administrator if you need it.
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

  /* =======================================================
     QUERY PARAMS
  ======================================================= */

  const params = await searchParams;

  const tab = parseEnquiryTab(readParam(params, "tab"));
  const search = readParam(params, "q").slice(0, 100);
  const page = Math.max(1, Math.floor(Number(readParam(params, "page"))) || 1);

  const filters = parseEnquiryFilters(params);
  const sort = parseEnquirySort(readParam(params, "sort"), tab === "open");

  /* =======================================================
     DATA
  ======================================================= */

  const [data, summary, lookups] = await Promise.all([
    getEnquiryList({ tab, search, page, filters, sort }),
    getEnquirySummary(),
    getEnquiryLookups(),
  ]);

  /* =======================================================
     INVALID PAGE REDIRECT

     A filter that shrinks the result set can leave someone on page 7 of 3.
     Rather than show an empty list, send them to the last real page and keep
     everything else about their view intact.
  ======================================================= */

  if (data && data.totalCount > 0) {
    const lastPage = Math.ceil(data.totalCount / ENQUIRY_PAGE_SIZE);

    if (page > lastPage) {
      const next = new URLSearchParams({ tab, page: String(lastPage), sort: sort.id });
      if (search) next.set("q", search);
      writeEnquiryFiltersToParams(next, filters);

      redirect(`/admin/enquiries?${next.toString()}`);
    }
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <EnquiriesClient
      summary={summary}
      data={data}
      tab={tab}
      search={search}
      page={page}
      filters={filters}
      sortId={sort.id}
      staff={lookups.staff}
      permissions={permissions}
      currentUserId={user.id}
    />
  );
}
