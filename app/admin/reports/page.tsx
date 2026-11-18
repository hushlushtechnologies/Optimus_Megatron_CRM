import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { currentUserSalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { getSalesReport, parseReportRange } from "@/src/lib/supabase/sales-report-queries";
import { SalesReportClient } from "@/src/components/report/sales-report-client";

export const metadata = {
  title: "Sales reports · Optimus Megatron Cars",
};

interface ReportsPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

/**
 * Sprint 6 Phase 17 — sales reporting.
 *
 * Reading a report needs the same permission as reading the Sales list, and
 * every underlying query is row-level secured, so nobody sees a total built
 * from deals they could not open.
 */
export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const permissions = await currentUserSalesPermissions();

  if (!permissions.view) {
    return (
      <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
        <div>
          <p className="text-body-sm text-text-primary font-medium">
            You don&apos;t have permission to view sales reports.
          </p>
          <p className="text-body-sm text-text-muted mt-1">Ask an administrator if you need access.</p>
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

  const params = await searchParams;
  const data = await getSalesReport(parseReportRange(params.range));

  return <SalesReportClient data={data} canExport={permissions.export} />;
}