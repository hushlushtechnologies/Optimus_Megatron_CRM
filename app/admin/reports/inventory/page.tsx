import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { ReportInventoryClient } from "@/src/components/report/report-inventory-client";
import { currentReportAccess, canOpenSection } from "@/src/lib/supabase/report-permissions";
import { getInventoryReport } from "@/src/lib/supabase/report-inventory-queries";
import { parseReportQuery } from "@/src/lib/utils/report-filters";

/*
 * Inventory reports.
 *
 * The section check is repeated here rather than left to the layout, because
 * somebody can arrive on a direct link and a layout that renders children
 * before its own check would flash the page first.
 */

export const metadata = {
  title: "Inventory reports · Optimus Megatron Cars",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InventoryReportPage({ searchParams }: PageProps) {
  const access = await currentReportAccess();

  if (!canOpenSection(access, "inventory")) {
    return <UnauthorizedState />;
  }

  const params = await searchParams;
  const query = parseReportQuery(params, "inventory");

  const data = await getInventoryReport(query.range, query.filters, {
    customFrom: query.customFrom,
    customTo: query.customTo,
  });

  return (
    <ReportInventoryClient data={data} range={query.range} canSeeFinancial={access.financial} />
  );
}
