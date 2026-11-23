import type { ReportSectionId } from "@/src/lib/types/report-sections";

/*
|--------------------------------------------------------------------------
| WHICH REPORTS CAN BE DOWNLOADED
|--------------------------------------------------------------------------
|
| This list lives in its own module, holding no runtime dependencies, for
| one reason: both the export route and the Export button need it, and one
| of those runs in the browser.
|
| The builders module is marked "server-only" because it reaches Supabase.
| A client component importing a value from it pulls the whole chain —
| builders, queries, the server client, next/headers — into the browser
| bundle. TypeScript is perfectly happy with that; the build fails later,
| pointing at a file that is not the one at fault. It has happened twice in
| this project already, once in Sprint 8 and once in Sprint 9, so the
| boundary is drawn here deliberately rather than discovered again.
|
| checks/check-client-server-boundary.py enforces it.
*/

export const EXPORTABLE_SECTION_IDS = [
  "inventory",
  "customers",
  "operations",
  "staff",
  "promotions",
  "payments",
] as const satisfies readonly ReportSectionId[];

export type ExportableSection = (typeof EXPORTABLE_SECTION_IDS)[number];

export function isExportableSection(id: string): id is ExportableSection {
  return (EXPORTABLE_SECTION_IDS as readonly string[]).includes(id);
}
