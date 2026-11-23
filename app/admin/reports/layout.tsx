import type { ReactNode } from "react";

import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { ReportNavigation } from "@/src/components/report/report-navigation";
import { ReportExportMenu } from "@/src/components/report/report-export-menu";
import { currentReportAccess } from "@/src/lib/supabase/report-permissions";
import { readySections } from "@/src/lib/types/report-sections";

/*
|--------------------------------------------------------------------------
| THE REPORTS WORKSPACE
|--------------------------------------------------------------------------
|
| The shell every report sits in: the heading, the navigation, and the one
| permission check that decides whether there is anything here at all.
|
| The check lives in the layout so it happens once per navigation rather than
| once per page, and so a person with no report access never sees a flash of
| headings before being refused.
|
| Note what is NOT here: the period picker. A layout in the App Router does
| not receive searchParams, and the period is a search param — so each page
| renders its own picker. That is also the honest arrangement, because a page
| is what knows which periods make sense for it.
*/

export const metadata = {
  title: "Reports · Optimus Megatron Cars",
};

export default async function ReportsLayout({ children }: { children: ReactNode }) {
  const access = await currentReportAccess();

  const sections = readySections().filter((section) => access.openable.includes(section.id));

  /*
   * No sections at all means no reports, not an empty workspace. Reusing the
   * shared unauthorised state rather than writing another one keeps this
   * consistent with every other refused page in the application.
   */
  if (sections.length === 0) {
    return <UnauthorizedState />;
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-h2">Reports</h1>
          <p className="text-body-sm text-text-muted">
            Track business performance across sales, inventory, customers, operations and payments.
          </p>
        </div>

        {/*
          One Export control for the whole workspace. It reads the section
          from the path and the filters from the query string, so it does
          not need anything from here — and a layout cannot pass it
          searchParams in any case.

          Rendered only when this person may export: the route refuses
          without the permission, but a button that exists only to produce
          a refusal is not worth the space.
        */}
        {access.canExport && <ReportExportMenu />}
      </header>

      <ReportNavigation sections={sections} />

      {children}
    </div>
  );
}
