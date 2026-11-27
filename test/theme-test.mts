import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THEME_PREFERENCES, resolveTheme, storedPreference } from "../src/lib/theme/constants.ts";

let checks = 0;
const check = (name: string, fn: () => void) => {
  fn();
  checks += 1;
  void name;
};

/* ---------------------------------------------------------------------------
 * The resolution rule
 * ------------------------------------------------------------------------- */

check("an explicit choice ignores the operating system", () => {
  assert.equal(resolveTheme("light", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", true), "dark");
  assert.equal(resolveTheme("dark", false), "dark");
});

check("system follows the operating system", () => {
  assert.equal(resolveTheme("system", true), "light");
  assert.equal(resolveTheme("system", false), "dark");
});

check("no stored value is still dark, whatever the operating system says", () => {
  /*
   * The default is deliberately unchanged from before Phase 22. Making
   * `system` the default would have switched the theme for every member of
   * staff on a light-mode computer on the morning this deployed, without
   * anybody asking for it.
   */
  assert.equal(resolveTheme(null, true), "dark");
  assert.equal(resolveTheme(undefined, true), "dark");
  assert.equal(resolveTheme("", true), "dark");
});

check("an unrecognised stored value is dark, not a crash and not light", () => {
  // A value from a future version, or a hand-edited one.
  assert.equal(resolveTheme("midnight", true), "dark");
  assert.equal(resolveTheme("SYSTEM", true), "dark", "the check is case sensitive, by design");
});

check("storedPreference never returns something the page cannot render", () => {
  assert.equal(storedPreference(null), "dark");
  assert.equal(storedPreference("nonsense"), "dark");
  THEME_PREFERENCES.forEach((preference) => {
    assert.equal(storedPreference(preference), preference);
  });
});

/* ---------------------------------------------------------------------------
 * The inline script must agree with the function
 *
 * This is the whole reason this file exists. The script in app/layout.tsx is
 * a hand-written copy of resolveTheme, because it runs in <head> before any
 * module can load — that is what stops a light page flashing dark on every
 * navigation. Two copies of one rule is how a rule drifts, so the copy is
 * checked rather than trusted.
 * ------------------------------------------------------------------------- */

function runInitScript(stored: string | null, osPrefersLight: boolean): "light" | "dark" {
  const layout = readFileSync("app/layout.tsx", "utf8");

  const match = layout.match(/const themeInitScript = `([\s\S]*?)`;/);
  assert.ok(match, "could not find themeInitScript in app/layout.tsx — this test is stale");

  // The template interpolates the storage key; substitute it as the file would.
  const source = match[1].replace(/\$\{THEME_STORAGE_KEY\}/g, "omc-theme");

  const classes = new Set<string>();
  const sandbox = {
    localStorage: {
      getItem: (key: string) => (key === "omc-theme" ? stored : null),
    },
    document: {
      documentElement: {
        classList: {
          add: (name: string) => classes.add(name),
        },
      },
    },
    window: {
      matchMedia: (query: string) => ({
        matches: query.includes("light") ? osPrefersLight : !osPrefersLight,
      }),
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function("localStorage", "document", "window", source);
  run(sandbox.localStorage, sandbox.document, sandbox.window);

  return classes.has("light") ? "light" : "dark";
}

check("the inline script agrees with resolveTheme for every combination", () => {
  const storedValues: (string | null)[] = [null, "", "light", "dark", "system", "midnight"];

  storedValues.forEach((stored) => {
    [true, false].forEach((osPrefersLight) => {
      const fromScript = runInitScript(stored, osPrefersLight);
      const fromFunction = resolveTheme(stored, osPrefersLight);
      assert.equal(
        fromScript,
        fromFunction,
        `stored=${JSON.stringify(stored)} osPrefersLight=${osPrefersLight}: the inline script in layout.tsx says ${fromScript}, resolveTheme says ${fromFunction}`,
      );
    });
  });
});

check("the inline script survives localStorage throwing", () => {
  // Private windows and blocked cookies both throw on getItem. An exception
  // here leaves the page unstyled, so the try/catch is load-bearing.
  const layout = readFileSync("app/layout.tsx", "utf8");
  const match = layout.match(/const themeInitScript = `([\s\S]*?)`;/);
  assert.ok(match);
  const source = match[1].replace(/\$\{THEME_STORAGE_KEY\}/g, "omc-theme");

  const classes = new Set<string>();
  const throwingStorage = {
    getItem: () => {
      throw new Error("access denied");
    },
  };
  const document_ = {
    documentElement: { classList: { add: (name: string) => classes.add(name) } },
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function("localStorage", "document", "window", source);
  // Must not throw.
  run(throwingStorage, document_, { matchMedia: () => ({ matches: true }) });
  assert.equal(classes.has("light"), false, "a failed read should leave the default dark");
});

check("the inline script survives matchMedia being absent", () => {
  // Older browsers, and some embedded webviews.
  const layout = readFileSync("app/layout.tsx", "utf8");
  const source = layout
    .match(/const themeInitScript = `([\s\S]*?)`;/)![1]
    .replace(/\$\{THEME_STORAGE_KEY\}/g, "omc-theme");

  const classes = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function("localStorage", "document", "window", source);
  run(
    { getItem: () => "system" },
    { documentElement: { classList: { add: (n: string) => classes.add(n) } } },
    {},
  );
  assert.equal(classes.has("light"), false, "with no matchMedia, system should fall back to dark");
});

console.log(`theme: ${checks} checks, all passed.`);
