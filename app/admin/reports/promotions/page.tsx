import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { ReportPromotionsClient } from "@/src/components/report/report-promotions-client";
import {
  canOpenSection,
  currentReportAccess,
} from "@/src/lib/supabase/report-permissions";
import { getPromotionsReport } from "@/src/lib/supabase/report-promotions-queries";
import { parseReportQuery } from "@/src/lib/utils/report-filters";

/*
|--------------------------------------------------------------------------
| PROMOTIONS AND LOYALTY
|--------------------------------------------------------------------------
|
| Opens for anyone with offers.view or loyalty.view — the same keys that
| open the campaigns and loyalty pages themselves. Seeing the totals of
| records you can already list one by one is not a separate privilege.
|
| Money inside it is a separate question, and reports.financial answers it.
*/

export const metadata = {
  title: "Promotions & Loyalty report · Optimus Megatron Cars",
};

export default async function PromotionsReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await currentReportAccess();

  if (!canOpenSection(access, "promotions")) {
    return <UnauthorizedState />;
  }

  const query = parseReportQuery(await searchParams, "promotions");

  const data = await getPromotionsReport(query.range, query.filters, {
    customFrom: query.customFrom,
    customTo: query.customTo,
  });

  return (
    <ReportPromotionsClient
      data={data}
      range={query.range}
      canSeeFinancial={access.financial}
    />
  );
}
