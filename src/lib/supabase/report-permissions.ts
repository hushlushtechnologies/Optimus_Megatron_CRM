import { createClient } from "@/src/lib/supabase/server";
import {
  REPORTS_FINANCIAL_KEY,
  REPORT_SECTIONS,
  type ReportSection,
  type ReportSectionId,
} from "@/src/lib/types/report-sections";

/*
|--------------------------------------------------------------------------
| WHO CAN SEE WHICH REPORT, AND WHICH FIGURES
|--------------------------------------------------------------------------
|
| One call to get_my_permissions(), one answer for the whole workspace.
|
| Two separate questions, deliberately:
|
|   Can this person OPEN this section?   — the module's own read key
|   Can this person see MONEY?           — reports.financial
|
| Keeping them apart is what makes a useful middle state possible. A showroom
| host can see that fourteen cars sold and eleven test drives completed
| without seeing what any of it was worth. Collapsing the two would force a
| choice between showing them nothing and showing them everything.
|
| Failing closed, as everywhere else in this codebase: if the permission
| lookup errors, the answer is no permissions rather than all of them.
*/

export interface ReportAccess {
  /** Section ids this person may open. */
  openable: readonly ReportSectionId[];
  /** May see money figures in any report. */
  financial: boolean;
  /** May export report data. Reuses the module export keys. */
  canExport: boolean;
  /** Everything get_my_permissions() returned, for section-specific checks. */
  keys: ReadonlySet<string>;
}

const NO_ACCESS: ReportAccess = {
  openable: [],
  financial: false,
  canExport: false,
  keys: new Set(),
};

function sectionIsOpen(section: ReportSection, keys: ReadonlySet<string>): boolean {
  /*
   * An empty `anyOf` means the module being reported on has no read key of
   * its own, so the section needs only a signed-in user. That is not a
   * loosening: it matches what the module's own pages already allow. See the
   * header of report-sections.ts.
   */
  if (section.anyOf.length === 0) return true;

  return section.anyOf.some((key) => keys.has(key));
}

/**
 * What the signed-in person may see across the reports workspace.
 *
 * One database round trip. The result is passed down rather than re-fetched
 * per section, so opening a report does not re-ask the same question.
 */
export async function currentReportAccess(): Promise<ReportAccess> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NO_ACCESS;

  const { data, error } = await supabase.rpc("get_my_permissions");

  if (error) {
    console.error("currentReportAccess error:", error);
    return NO_ACCESS;
  }

  const keys = new Set(Array.isArray(data) ? (data as string[]) : []);

  const openable = REPORT_SECTIONS.filter((section) => sectionIsOpen(section, keys)).map(
    (section) => section.id,
  );

  return {
    openable,
    financial: keys.has(REPORTS_FINANCIAL_KEY),
    /*
     * Exporting reuses the module export keys rather than adding another.
     * Somebody who may export the Sales list may export a sales report of
     * the same rows; the export route checks the specific key again.
     */
    canExport:
      keys.has("sales.export") || keys.has("enquiries.export") || keys.has("offers.export") ||
      keys.has("test_drives.export"),
    keys,
  };
}

/** Whether one section is open to this person. */
export function canOpenSection(access: ReportAccess, id: ReportSectionId): boolean {
  return access.openable.includes(id);
}

/*
|--------------------------------------------------------------------------
| HIDING MONEY
|--------------------------------------------------------------------------
*/

/**
 * A money figure, or nothing, depending on `reports.financial`.
 *
 * Used at the point a figure is rendered rather than at the point it is
 * fetched, so one code path serves both audiences — and so a figure cannot
 * be hidden in one place and leak in another because somebody added a card
 * and forgot the check.
 *
 * Returns undefined rather than null: null already means "the lookup failed"
 * throughout the reporting layer, and "you may not see this" is a different
 * statement that should not render as "Unavailable".
 */
export function ifFinancial<T>(access: ReportAccess, value: T): T | undefined {
  return access.financial ? value : undefined;
}
