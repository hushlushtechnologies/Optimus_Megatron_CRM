import { redirect } from "next/navigation";

import { ReportOverviewClient } from "@/src/components/report/report-overview-client";
import { currentReportAccess } from "@/src/lib/supabase/report-permissions";
import { getReportOverview } from "@/src/lib/supabase/report-overview-queries";
import { parseReportQuery } from "@/src/lib/utils/report-filters";

/*
|--------------------------------------------------------------------------
| THE OVERVIEW
|--------------------------------------------------------------------------
|
| /admin/reports used to BE the sales report. Sprint 9 makes it the overview
| and moves the sales report to /admin/reports/sales.
|
| That would break every link anybody has already saved, so the old links are
| kept working — see the redirect below. The layout above this page has
| already established that the person may open at least one report.
*/

interface OverviewPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReportsOverviewPage({ searchParams }: OverviewPageProps) {
  const params = await searchParams;

  /*
   * Old links keep working.
   *
   * `view` is the sales report's own parameter — summary or table — and
   * nothing else in the workspace uses it, so its presence identifies a link
   * made before the sales report moved. Those go where they were going, with
   * everything else they carried intact.
   *
   * `range` is NOT used as the signal, even though old links carry it,
   * because the overview takes a range too: redirecting on `range` would
   * make it impossible to look at the overview for last month.
   */
  if (params.view) {
    const forwarded = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (first) forwarded.set(key, first);
    }

    redirect(`/admin/reports/sales?${forwarded.toString()}`);
  }

  const access = await currentReportAccess();
  const query = parseReportQuery(params, "overview");

  const data = await getReportOverview(query.range, query.filters, {
    customFrom: query.customFrom,
    customTo: query.customTo,
  });

  return (
    <ReportOverviewClient data={data} range={query.range} canSeeFinancial={access.financial} />
  );
}
