import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { ReportOperationsClient } from "@/src/components/report/report-operations-client";
import { currentReportAccess, canOpenSection } from "@/src/lib/supabase/report-permissions";
import { getOperationsReport } from "@/src/lib/supabase/report-operations-queries";
import { parseReportQuery } from "@/src/lib/utils/report-filters";

export const metadata = {
  title: "Operations reports · Optimus Megatron Cars",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReportOperationsClientPage({ searchParams }: PageProps) {
  const access = await currentReportAccess();

  if (!canOpenSection(access, "operations")) {
    return <UnauthorizedState />;
  }

  const params = await searchParams;
  const query = parseReportQuery(params, "operations");

  const data = await getOperationsReport(query.range, query.filters, {
    customFrom: query.customFrom,
    customTo: query.customTo,
  });

  return <ReportOperationsClient data={data} range={query.range} canSeeFinancial={access.financial} />;
}
