import { existsSync } from "fs";
import { join } from "path";

import {
  findSettingsCategory,
  findSettingsPage,
  findSettingsPageByHref,
  pagesInCategory,
  searchSettings,
  SETTINGS_CATEGORIES,
  SETTINGS_EDIT_KEYS,
  SETTINGS_PAGES,
  SETTINGS_ROOT,
} from "../src/lib/types/settings-registry.ts";

/*
 * The registry drives navigation, search, breadcrumbs, permission gating and
 * the catch-all route. Nothing here is checked by the type system, and
 * every one of these would ship silently:
 *
 *   1. A page marked "ready" with no route file. The catch-all answers 404
 *      for it — correctly, since claiming "not available yet" about a page
 *      that is supposed to exist would hide the bug — so the result is a
 *      dead link in the navigation. This is the single most likely mistake
 *      in the whole sprint, because every future batch flips entries from
 *      "planned" to "ready" and the flip is one word away from the file.
 *
 *   2. A planned page with no note. The unavailable state would render an
 *      empty explanation, which is worse than no page: it says "not yet"
 *      and refuses to say why.
 *
 *   3. Search that cannot find what the brief says it must. The three
 *      examples in section 6 of the brief are a specification, and two of
 *      the three only work because of keywords — "deposit" appears in
 *      neither the Reservations label nor its description.
 *
 *   4. A duplicate id or href. Two pages with the same id and
 *      findSettingsPage returns whichever comes first; two with the same
 *      href and the navigation highlights both as active.
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

const REPO = process.cwd();

/*
|--------------------------------------------------------------------------
| 1. EVERY "READY" PAGE HAS A ROUTE FILE
|--------------------------------------------------------------------------
*/

console.log("\nready pages have routes");

{
  const ready = SETTINGS_PAGES.filter((page) => page.status === "ready");

  check("at least one page is ready", ready.length > 0, `${ready.length} ready`);

  for (const page of ready) {
    /* /admin/settings/operations/sales -> app/admin/settings/operations/sales/page.tsx */
    const file = join(REPO, "app", `${page.href.replace(/^\//, "")}`, "page.tsx");

    check(
      `${page.id} has a route at app${page.href}/page.tsx`,
      existsSync(file),
      `looked for ${file}`,
    );
  }

  /* And the overview itself. */
  check(
    "the settings root has a page",
    existsSync(join(REPO, "app", SETTINGS_ROOT.replace(/^\//, ""), "page.tsx")),
  );

  check(
    "the settings root has a layout",
    existsSync(join(REPO, "app", SETTINGS_ROOT.replace(/^\//, ""), "layout.tsx")),
  );
}

/*
|--------------------------------------------------------------------------
| 2. EVERY "PLANNED" PAGE EXPLAINS ITSELF
|--------------------------------------------------------------------------
*/

console.log("\nplanned pages explain themselves");

{
  const planned = SETTINGS_PAGES.filter((page) => page.status === "planned");

  const noNote = planned.filter((page) => !page.note || page.note.trim().length === 0);

  check(
    "every planned page has a note",
    noNote.length === 0,
    noNote.length > 0 ? `missing: ${noNote.map((p) => p.id).join(", ")}` : undefined,
  );

  /* A note that merely repeats the label tells nobody anything. */
  const lazy = planned.filter(
    (page) => (page.note ?? "").trim().length < 25,
  );

  check(
    "no note is too short to be an explanation",
    lazy.length === 0,
    lazy.length > 0 ? `too short: ${lazy.map((p) => p.id).join(", ")}` : undefined,
  );
}

/*
|--------------------------------------------------------------------------
| 3. THE BRIEF'S SEARCH EXAMPLES
|--------------------------------------------------------------------------
*/

console.log("\nsearch finds what the brief says it must");

{
  /* These three are quoted from section 6 of the Sprint 10 brief. */
  const examples: [string, string][] = [
    ["Reservation deposit", "reservations"],
    ["Loyalty points", "loyalty"],
    ["Discount approval", "sales"],
  ];

  for (const [term, expectedId] of examples) {
    const results = searchSettings(term);
    const top = results[0];

    check(
      `"${term}" finds ${expectedId}`,
      results.some((page) => page.id === expectedId),
      `got: ${results.map((p) => p.id).join(", ") || "(nothing)"}`,
    );

    check(
      `"${term}" ranks ${expectedId} first`,
      top?.id === expectedId,
      `top result was ${top?.id ?? "(none)"}`,
    );
  }

  /* Single words somebody would actually type. */
  const singles: [string, string][] = [
    ["deposit", "reservations"],
    ["vat", "sales"],
    ["expiry", "loyalty"],
    ["trn", "company"],
    ["verifier", "payments"],
    ["instagram", "crm"],
    ["whatsapp", "integrations"],
  ];

  for (const [term, expectedId] of singles) {
    check(
      `"${term}" finds ${expectedId}`,
      searchSettings(term).some((page) => page.id === expectedId),
      `got: ${searchSettings(term).map((p) => p.id).join(", ") || "(nothing)"}`,
    );
  }

  check("an empty search returns nothing", searchSettings("").length === 0);
  check("whitespace returns nothing", searchSettings("   ").length === 0);
  check(
    "nonsense returns nothing",
    searchSettings("zzzzqqqq").length === 0,
    searchSettings("zzzzqqqq").map((p) => p.id).join(", "),
  );

  /*
   * Two words must be NARROWER than one, which is the whole point of
   * requiring every token to match. Without this the ANY/ALL distinction is
   * untested: with ANY-matching, "Reservation deposit" still ranks
   * Reservations first (it scores on both words), so every ranking
   * assertion above passes while the search quietly returns half the
   * registry.
   */
  check(
    "two words that share no page return nothing",
    searchSettings("loyalty inventory").length === 0,
    `got: ${searchSettings("loyalty inventory").map((p) => p.id).join(", ")}`,
  );

  check(
    "adding a word narrows the result",
    searchSettings("reservation deposit").length <= searchSettings("reservation").length,
    `"reservation" ${searchSettings("reservation").length}, ` +
      `"reservation deposit" ${searchSettings("reservation deposit").length}`,
  );

  check(
    "a word matching nothing disqualifies the page",
    searchSettings("loyalty zzzzqqqq").length === 0,
    `got: ${searchSettings("loyalty zzzzqqqq").map((p) => p.id).join(", ")}`,
  );

  /* A category name should surface its pages. */
  check(
    "searching a category name finds its pages",
    searchSettings("marketing").length >= 3,
    `${searchSettings("marketing").length} results`,
  );
}

/*
|--------------------------------------------------------------------------
| 4. THE REGISTRY IS INTERNALLY CONSISTENT
|--------------------------------------------------------------------------
*/

console.log("\nconsistency");

{
  const ids = SETTINGS_PAGES.map((page) => page.id);
  check("no duplicate ids", new Set(ids).size === ids.length, ids.join(", "));

  const hrefs = SETTINGS_PAGES.map((page) => page.href);
  check("no duplicate hrefs", new Set(hrefs).size === hrefs.length);

  check(
    "every href sits under the settings root",
    SETTINGS_PAGES.every((page) => page.href.startsWith(`${SETTINGS_ROOT}/`)),
    SETTINGS_PAGES.filter((p) => !p.href.startsWith(`${SETTINGS_ROOT}/`))
      .map((p) => p.href)
      .join(", "),
  );

  check(
    "every page belongs to a real category",
    SETTINGS_PAGES.every((page) => findSettingsCategory(page.category) !== undefined),
  );

  check(
    "every category has at least one page",
    SETTINGS_CATEGORIES.every((category) => pagesInCategory(category.id).length > 0),
    SETTINGS_CATEGORIES.filter((c) => pagesInCategory(c.id).length === 0)
      .map((c) => c.id)
      .join(", "),
  );

  check(
    "every category has an edit key",
    SETTINGS_CATEGORIES.every(
      (category) => SETTINGS_EDIT_KEYS[category.id] !== undefined,
    ),
  );

  /* The href encodes the category, so a mismatch means a page would appear
     under one heading and live at another's URL. */
  const misfiled = SETTINGS_PAGES.filter(
    (page) => !page.href.startsWith(`${SETTINGS_ROOT}/${page.category}/`),
  );

  check(
    "every href's path segment matches its category",
    misfiled.length === 0,
    misfiled.map((p) => `${p.id} is ${p.category} but lives at ${p.href}`).join("; "),
  );

  check(
    "every page has a description",
    SETTINGS_PAGES.every((page) => page.description.trim().length > 10),
  );
}

/*
|--------------------------------------------------------------------------
| 5. LOOKUP BY PATH, INCLUDING NESTED ROUTES
|--------------------------------------------------------------------------
*/

console.log("\nlookup");

{
  check(
    "exact href resolves",
    findSettingsPageByHref("/admin/settings/operations/sales")?.id === "sales",
  );

  /* The catch-all passes whatever is in the URL, so a deeper path must
     resolve to its page rather than to nothing. */
  check(
    "a nested path resolves to its page",
    findSettingsPageByHref("/admin/settings/operations/sales/fees")?.id === "sales",
  );

  check(
    "the settings root resolves to nothing",
    findSettingsPageByHref(SETTINGS_ROOT) === undefined,
  );

  check(
    "an unknown path resolves to nothing",
    findSettingsPageByHref("/admin/settings/nope/nothing") === undefined,
  );

  check("findSettingsPage finds by id", findSettingsPage("loyalty")?.label === "Loyalty Points");
  check("findSettingsPage misses cleanly", findSettingsPage("nope") === undefined);

  /*
   * The longest-prefix rule. If two pages' hrefs are prefixes of one
   * another, a plain `startsWith` scan returns whichever is listed first,
   * which would be arbitrary. Asserted with the real registry so it stays
   * true as pages are added.
   */
  const prefixPairs = SETTINGS_PAGES.flatMap((a) =>
    SETTINGS_PAGES.filter((b) => a.id !== b.id && b.href.startsWith(`${a.href}/`)).map(
      (b) => [a, b] as const,
    ),
  );

  for (const [shorter, longer] of prefixPairs) {
    check(
      `${longer.href} resolves to ${longer.id}, not ${shorter.id}`,
      findSettingsPageByHref(longer.href)?.id === longer.id,
    );
  }

  if (prefixPairs.length === 0) {
    check("no page href is a prefix of another (nothing to disambiguate)", true);
  }
}

console.log(`\n${checks} checks, ${failures} failed.`);

if (failures > 0) process.exit(1);
