import ExcelJS from "exceljs";

import {
  figuresTable,
  provenanceLine,
  toRenderedTable,
  type ExportMeta,
  type RenderedTable,
} from "../src/lib/utils/export-tables.ts";
import type { ExportColumn } from "../src/lib/utils/export-columns.ts";
import {
  generateExportExcel,
  safeSheetName,
} from "../src/lib/utils/generate-export-excel.ts";
import { generateExportPdf } from "../src/lib/utils/generate-export-pdf.ts";

/*
 * Phase 10's four ways of being wrong, none of which a type checker sees.
 *
 * ONE: A WORKBOOK EXCEL WILL NOT OPEN.
 *
 * Sheet names have four rules — 31 characters, no : \ / ? * [ ], not empty,
 * unique ignoring case — and report section names break all four on their
 * way to becoming sheet names. ExcelJS writes the bad name without
 * complaint; the failure arrives when somebody double-clicks the file and
 * Excel says it is corrupt. There is no error anywhere in the server logs.
 *
 * TWO: "PAGE 3 OF 3" ON PAGE 3 OF EIGHT.
 *
 * The obvious way to write a page footer is from autoTable's didDrawPage
 * hook, and it is wrong: that fires while the document is still being laid
 * out, so the page count at that moment is the count so far. Every page
 * comes out saying "of" its own number. The entire purpose of "of N" is to
 * let someone notice a page missing from a printout, so this does not
 * degrade the feature, it inverts it — the document asserts it is complete
 * on every page, most loudly on the ones that are not the end.
 *
 * THREE: A SHORT FILE THAT LOOKS COMPLETE.
 *
 * The sprint's rule is that an incomplete export must say so. The row cap
 * is per table, so a workbook can be complete in five tables and capped in
 * the sixth. A warning that lives only on a cover sheet is read as covering
 * everything, and a warning that is dropped entirely produces a file whose
 * totals are simply too low, with nothing on the page to say why.
 *
 * FOUR: A FILE THAT CANNOT SAY WHERE IT CAME FROM.
 *
 * Period, filters and currency decide how every figure in the file should
 * be read. An export that omits them is not a smaller export, it is an
 * unreadable one — and it is the version that gets mailed on and quoted in
 * a meeting six weeks later.
 */

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail?: string): void {
  checks += 1;

  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }

  failures += 1;
  console.error(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
}

/*
|--------------------------------------------------------------------------
| 1. SHEET NAMES
|--------------------------------------------------------------------------
*/

console.log("\nsheet names");

{
  const taken = new Set<string>();

  const illegal = safeSheetName("Sales 01/11 [Nov] *draft*: by rep?", taken);

  check(
    "illegal characters are stripped",
    !/[:\\/?*[\]]/.test(illegal),
    `got ${JSON.stringify(illegal)}`,
  );

  const long = safeSheetName(
    "Vehicles by status and location across the whole showroom",
    taken,
  );

  check("a long name is cut to 31", long.length <= 31, `got ${long.length} chars`);

  const taken2 = new Set<string>();
  const first = safeSheetName("By status", taken2);
  const second = safeSheetName("By status", taken2);
  const third = safeSheetName("By status", taken2);

  check(
    "repeated names are made unique",
    first !== second && second !== third && first !== third,
    `got ${[first, second, third].join(", ")}`,
  );

  /* Excel compares sheet names case-insensitively, so these collide too. */
  const taken3 = new Set<string>();
  const upper = safeSheetName("BY STATUS", taken3);
  const lower = safeSheetName("by status", taken3);

  check(
    "collision is case-insensitive, as Excel's is",
    upper.toLowerCase() !== lower.toLowerCase(),
    `got ${upper} / ${lower}`,
  );

  /* A name that is only illegal characters must still produce something. */
  const taken4 = new Set<string>();
  const empty = safeSheetName("///", taken4);

  check("an all-illegal name still yields a usable one", empty.length > 0, `got ${JSON.stringify(empty)}`);

  /* The dedup suffix must not push the name back over 31. */
  const taken5 = new Set<string>();
  const base = "Vehicles by status and location xx";
  const a = safeSheetName(base, taken5);
  const b = safeSheetName(base, taken5);

  check(
    "a deduplicated long name still fits in 31",
    a.length <= 31 && b.length <= 31 && a !== b,
    `got ${JSON.stringify(a)} (${a.length}) / ${JSON.stringify(b)} (${b.length})`,
  );

  const taken6 = new Set<string>();
  const quoted = safeSheetName("'Q4'", taken6);

  check(
    "leading and trailing apostrophes are removed",
    !quoted.startsWith("'") && !quoted.endsWith("'"),
    `got ${JSON.stringify(quoted)}`,
  );
}

/*
|--------------------------------------------------------------------------
| 2. PROVENANCE
|--------------------------------------------------------------------------
*/

console.log("\nprovenance");

{
  const bare: ExportMeta = {
    title: "Sales report",
    period: "November 2026",
    filters: [],
    currency: "AED",
  };

  const line = provenanceLine(bare, "23 Nov 2026, 11:04");

  check("states when it was generated", line.includes("23 Nov 2026, 11:04"));
  check("states the period", line.includes("November 2026"));
  check("states the currency", line.includes("AED"));
  check("says so when nothing was filtered", line.includes("Filters: none"));

  const filtered = provenanceLine(
    { ...bare, filters: ["Salesperson: Rashid", "Status: Completed"], sensitive: true },
    "23 Nov 2026, 11:04",
  );

  check("lists the filters in force", filtered.includes("Salesperson: Rashid"));
  check("marks a file holding customer details", filtered.toLowerCase().includes("internal use only"));
}

/*
|--------------------------------------------------------------------------
| 3. THE WORKBOOK, WRITTEN AND READ BACK
|--------------------------------------------------------------------------
*/

console.log("\nworkbook");

interface Row {
  name: string;
  amount: string;
  at: string;
}

const columns: ExportColumn<Row>[] = [
  { header: "Customer", width: 28, kind: "text", value: (r) => r.name },
  { header: "Amount", width: 16, kind: "money", value: (r) => r.amount },
  { header: "Taken", width: 20, kind: "time", value: (r) => r.at },
];

const rows: Row[] = [
  { name: "Al Futtaim Trading", amount: "125000.00", at: "2026-11-02T06:30:00Z" },
  { name: "Gulf Motors", amount: "5000.00", at: "2026-11-05T19:45:00Z" },
];

const meta: ExportMeta = {
  title: "Sales report",
  period: "1–30 November 2026",
  filters: ["Status: Completed"],
  currency: "AED",
  truncated: true,
};

const tables: RenderedTable[] = [
  figuresTable("Summary", [
    {
      label: "Completed deals",
      value: "14",
      definition: "Deals whose status reached Completed inside the period.",
      basis: "Completion date",
    },
  ]),
  toRenderedTable("By salesperson", columns, rows, {
    note: "Counted by completion date.",
    truncated: true,
    total: 4210,
  }),
  /* Same display name as the first table in another section — the
   * collision that silently loses a sheet if names are not deduplicated. */
  toRenderedTable("Summary", columns, rows, {}),
];

{
  const buffer = await generateExportExcel(tables, meta);

  check("the workbook has bytes", buffer.length > 0, `got ${buffer.length}`);

  /* Read it back the way Excel would, rather than trusting the writer. */
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(buffer as unknown as ArrayBuffer);

  check(
    "every table became a sheet",
    read.worksheets.length === tables.length,
    `got ${read.worksheets.length} sheets: ${read.worksheets.map((w) => w.name).join(", ")}`,
  );

  const names = read.worksheets.map((w) => w.name.toLowerCase());

  check("no two sheets share a name", new Set(names).size === names.length, names.join(", "));

  const sheet = read.getWorksheet("By salesperson");

  check("the named sheet is there", Boolean(sheet));

  if (sheet) {
    const title = String(sheet.getCell("B1").value ?? "");
    const provenance = String(sheet.getCell("B2").value ?? "");
    const caveat = String(sheet.getCell("B3").value ?? "");

    check("the sheet names the report and the table", title.includes("Sales report") && title.includes("By salesperson"), title);
    check("the sheet carries the period", provenance.includes("November 2026"), provenance);
    check("the sheet carries the filters", provenance.includes("Status: Completed"), provenance);

    check("a capped table says it is incomplete", caveat.includes("INCOMPLETE"), caveat);
    check("a capped table says how many it is missing", caveat.includes("4,210"), caveat);
    check("the table's own note survives", caveat.includes("completion date"), caveat);

    const header = sheet.getRow(4);

    check(
      "the header row holds the column labels",
      String(header.getCell(2).value) === "Customer" &&
        String(header.getCell(4).value) === "Taken",
      `got ${[2, 3, 4].map((c) => header.getCell(c).value).join(" | ")}`,
    );

    const firstData = sheet.getRow(5);

    check(
      "the data lands under the header",
      String(firstData.getCell(2).value) === "Al Futtaim Trading",
      String(firstData.getCell(2).value),
    );

    /*
     * The cents must survive, and the value must stay text.
     *
     * The formatter passes the exact decimal string through untouched — no
     * thousands separator, on purpose, so the figure can be re-parsed. What
     * must never happen is a number reaching the sheet: that has been
     * through Number("5000.00"), which is 5000, and prints as 5000. A
     * column of currency then stops reading as currency, and 1234.50
     * becomes 1234.5.
     */
    const money = sheet.getRow(6).getCell(3).value;

    check(
      "money stays an exact string, not a float",
      typeof money === "string" && money === "5000.00",
      `got ${typeof money} ${JSON.stringify(money)}`,
    );

    /* ySplit lives only on the frozen variant of the view union. */
    const view = sheet.views?.[0];

    check(
      "the header row is frozen",
      view?.state === "frozen" && view.ySplit === 4,
      JSON.stringify(view),
    );
  }

  const uncapped = read.getWorksheet("Summary");

  if (uncapped) {
    const caveat = String(uncapped.getCell("B3").value ?? "");

    check(
      "a complete table is NOT marked incomplete",
      !caveat.includes("INCOMPLETE"),
      caveat,
    );
  }

  /* An empty report still has to produce a file somebody can open. */
  const emptyBuffer = await generateExportExcel([], meta);
  const emptyRead = new ExcelJS.Workbook();
  await emptyRead.xlsx.load(emptyBuffer as unknown as ArrayBuffer);

  check(
    "an empty export still opens, with a sheet saying why",
    emptyRead.worksheets.length === 1,
    `got ${emptyRead.worksheets.length}`,
  );
}

/*
|--------------------------------------------------------------------------
| 4. THE PDF
|--------------------------------------------------------------------------
*/

console.log("\npdf");

{
  /* Enough rows to run past one page, so the footer claim is testable. */
  const many: Row[] = Array.from({ length: 220 }, (_, i) => ({
    name: `Customer number ${i} with a reasonably long trading name`,
    amount: `${(i + 1) * 125}.50`,
    at: "2026-11-02T06:30:00Z",
  }));

  const pdf = generateExportPdf(
    [
      toRenderedTable("By salesperson", columns, many, { truncated: true, total: 4210 }),
      toRenderedTable("By model", columns, rows, { note: "Counted by completion date." }),
    ],
    meta,
  );

  check("the pdf has bytes", pdf.length > 0, `got ${pdf.length}`);

  const text = pdf.toString("latin1");

  /*
   * jsPDF writes uncompressed content streams by default, so the page text
   * is readable in the file. That is what makes this assertion possible —
   * if a future version compresses by default, these checks go quiet rather
   * than failing, so the first one guards the rest.
   */
  check("the pdf content is readable to assert against", text.includes("Optimus Megatron Cars"));

  const footers = [...text.matchAll(/Page (\d+) of (\d+)/g)].map((m) => ({
    page: Number(m[1]),
    total: Number(m[2]),
  }));

  check("every page is numbered", footers.length > 1, `found ${footers.length} footers`);

  const totals = new Set(footers.map((f) => f.total));

  check(
    "every page agrees on the total — not 'Page N of N'",
    totals.size === 1,
    `totals seen: ${[...totals].join(", ")} across ${footers.length} pages`,
  );

  const total = footers[0]?.total ?? 0;

  check(
    "the total matches the number of pages",
    footers.length === total,
    `${footers.length} footers claiming ${total} pages`,
  );

  check("a capped table says so on the page", text.includes("INCOMPLETE"));
  check("the document carries its period", text.includes("November 2026"));
  check("each section is headed", text.includes("By model"));
}

console.log(`\n${checks} checks, ${failures} failed.`);

if (failures > 0) process.exit(1);
