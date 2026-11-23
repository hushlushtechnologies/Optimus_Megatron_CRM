import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { ReportStaffClient } from "@/src/components/report/report-staff-client";
import { currentReportAccess, canOpenSection } from "@/src/lib/supabase/report-permissions";
import { getStaffReport } from "@/src/lib/supabase/report-staff-queries";
import { parseReportQuery } from "@/src/lib/utils/report-filters";

export const metadata = {
  title: "Staff performance reports · Optimus Megatron Cars",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReportStaffClientPage({ searchParams }: PageProps) {
  const access = await currentReportAccess();

  if (!canOpenSection(access, "staff")) {
    return <UnauthorizedState />;
  }

  const params = await searchParams;
  const query = parseReportQuery(params, "staff");

  const data = await getStaffReport(query.range, query.filters, {
    customFrom: query.customFrom,
    customTo: query.customTo,
  });

  return <ReportStaffClient data={data} range={query.range} canSeeFinancial={access.financial} />;
}
