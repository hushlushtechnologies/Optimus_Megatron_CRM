import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { ReportPaymentsClient } from "@/src/components/report/report-payments-client";
import {
  canOpenSection,
  currentReportAccess,
} from "@/src/lib/supabase/report-permissions";
import { getPaymentsReport } from "@/src/lib/supabase/report-payments-queries";
import { parseReportQuery } from "@/src/lib/utils/report-filters";

/*
|--------------------------------------------------------------------------
| PAYMENTS AND COLLECTIONS
|--------------------------------------------------------------------------
|
| Opens for anyone holding one of the payment keys — the same people who can
| work the verification queue. Seeing the totals of payments you can already
| list one by one is not a separate privilege.
|
| The money figures on it are, and reports.financial answers that. Somebody
| who can verify a payment can see that payment; that does not mean they
| should see the month's collection figure for the whole dealership.
*/

export const metadata = {
  title: "Payments report · Optimus Megatron Cars",
};

export default async function PaymentsReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await currentReportAccess();

  if (!canOpenSection(access, "payments")) {
    return <UnauthorizedState />;
  }

  const query = parseReportQuery(await searchParams, "payments");

  const data = await getPaymentsReport(query.range, query.filters, {
    customFrom: query.customFrom,
    customTo: query.customTo,
  });

  return (
    <ReportPaymentsClient
      data={data}
      range={query.range}
      canSeeFinancial={access.financial}
    />
  );
}
