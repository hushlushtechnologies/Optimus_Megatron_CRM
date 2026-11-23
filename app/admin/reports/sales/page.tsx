import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { SalesReportClient } from "@/src/components/report/sales-report-client";
import { currentUserSalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { currentReportAccess } from "@/src/lib/supabase/report-permissions";
import {
  getSalesReport,
  getSalesReportDeals,
  parseReportRange,
} from "@/src/lib/supabase/sales-report-queries";
import { parseReportView } from "@/src/lib/types/sales-reports";

/*
|--------------------------------------------------------------------------
| SALES REPORT
|--------------------------------------------------------------------------
|
| Moved here from /admin/reports in Sprint 9, which became the overview. Old
| links still work: the overview page forwards anything carrying `view`, the
| parameter only this report uses.
|
| The report itself is Sprint 6's, with the seven arithmetic and boundary
| defects from the Phase 1 audit fixed in Batch 1. Nothing about its structure
| changed, because its structure was right.
|
| Two permission checks, deliberately:
|
|   sales.view        may open this report at all
|   reports.financial may see the money figures in it
|
| The layout has already checked that `sales.view` grants access to this
| section, so the first check here is the one that matters when somebody
| arrives on a direct link.
*/

export const metadata = {
  title: "Sales reports · Optimus Megatron Cars",
};

interface SalesReportPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function SalesReportPage({ searchParams }: SalesReportPageProps) {
  const [permissions, access] = await Promise.all([
    currentUserSalesPermissions(),
    currentReportAccess(),
  ]);

  if (!permissions.view) {
    return <UnauthorizedState />;
  }

  const params = await searchParams;
  const range = parseReportRange(params.range);
  const view = parseReportView(params.view);

  // Both views are fetched so switching between them is instant.
  const [data, deals] = await Promise.all([getSalesReport(range), getSalesReportDeals(range)]);

  return (
    <SalesReportClient
      data={data}
      deals={deals}
      view={view}
      canExport={permissions.export}
      canSeeFinancial={access.financial}
    />
  );
}
