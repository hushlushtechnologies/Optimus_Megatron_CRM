import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { ReportCustomersClient } from "@/src/components/report/report-customers-client";
import { currentReportAccess, canOpenSection } from "@/src/lib/supabase/report-permissions";
import { getCustomerLeadReport } from "@/src/lib/supabase/report-customer-queries";
import { parseReportQuery } from "@/src/lib/utils/report-filters";

/*
 * Customer and lead reports.
 *
 * One page for both because they are read together, and because the
 * distinction between counting people and counting opportunities is easiest
 * to make clear when both are on screen at once.
 */

export const metadata = {
  title: "Customer & lead reports · Optimus Megatron Cars",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomerReportPage({ searchParams }: PageProps) {
  const access = await currentReportAccess();

  if (!canOpenSection(access, "customers")) {
    return <UnauthorizedState />;
  }

  const params = await searchParams;
  const query = parseReportQuery(params, "customers");

  const data = await getCustomerLeadReport(query.range, query.filters, {
    customFrom: query.customFrom,
    customTo: query.customTo,
  });

  return (
    <ReportCustomersClient data={data} range={query.range} canSeeFinancial={access.financial} />
  );
}
