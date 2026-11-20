import { redirect } from "next/navigation";

import { getMyEnquiryPermissions } from "@/src/lib/supabase/enquiry-permissions";
import {
  getEnquiryList,
  getEnquiryLookups,
  getEnquirySummary,
  getEnquiryTypeCounts,
} from "@/src/lib/supabase/enquiry-queries";
import { getEnquiryWorkflow } from "@/src/lib/supabase/enquiry-workflow-queries";
import { createClient } from "@/src/lib/supabase/server";
import { activeSources, activeStatuses, activeTypes } from "@/src/lib/utils/enquiry-workflow";

import { ENQUIRY_PAGE_SIZE } from "@/src/lib/constants/enquiries";
import {
  parseEnquiryFilters,
  parseEnquirySort,
  parseEnquiryTab,
  writeEnquiryFiltersToParams,
} from "@/src/lib/utils/enquiry-filters";
import { readParam } from "@/src/lib/utils/test-drive-list-filters";

import { EnquiriesClient } from "@/src/components/enquiries/enquiries-client";
import { EnquiryAccessDenied } from "@/src/components/enquiries/enquiry-access-denied";

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
      <EnquiryAccessDenied
        action="view enquiries"
        reason="Enquiries hold the contact details of people who have written in, so access is granted by role. Ask an administrator if you need it."
      />
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

  const [data, summary, lookups, typeCounts, workflow] = await Promise.all([
    getEnquiryList({ tab, search, page, filters, sort }),
    getEnquirySummary(),
    getEnquiryLookups(),
    getEnquiryTypeCounts({ tab, search, filters }),
    getEnquiryWorkflow(),
  ]);

  /* Retired types keep their rows but stop getting a tab of their own. */
  const types = activeTypes(workflow).map((item) => ({ key: item.key, label: item.label }));

  const sources = activeSources(workflow).map((item) => ({ key: item.key, label: item.label }));

  /*
   * Only the statuses the current tab can contain. Offering Converted while
   * someone is on the Open tab would produce an empty list that reads as a
   * bug, so the two controls are kept from contradicting each other here.
   */
  const statuses = activeStatuses(workflow)
    .filter((item) => {
      if (tab === "open") return item.isOpen;
      if (tab === "converted") return item.key === "Converted";
      if (tab === "spam") return item.key === "Spam";
      if (tab === "closed") return !item.isOpen && item.key !== "Converted" && item.key !== "Spam";

      return item.key !== "Spam";
    })
    .map((item) => ({ key: item.key, label: item.label }));

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
      statuses={statuses}
      sources={sources}
      locations={lookups.locations}
      permissions={permissions}
      currentUserId={user.id}
      types={types}
      typeCounts={typeCounts}
    />
  );
}
