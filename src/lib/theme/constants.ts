export const THEME_STORAGE_KEY = "omc-theme";

/** What is actually on screen. The `light` class on <html> is the only switch. */
export type Theme = "dark" | "light";

/**
 * What the person chose. Added in Sprint 10 Phase 22.
 *
 * `system` is new; `dark` and `light` mean exactly what they did before. The
 * stored value is now a PREFERENCE rather than a theme, and the theme is
 * resolved from it.
 */
export type ThemePreference = "dark" | "light" | "system";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

/**
 * The theme to show, from the stored preference and the operating system.
 *
 * WHY THIS IS A FUNCTION AND NOT INLINE
 *
 * This logic exists in two places and has to: here, for the provider, and as
 * a hand-written copy inside the inline script in app/layout.tsx. The script
 * cannot import anything — it runs in <head> before any module loads, which
 * is the whole point of it, because that is what stops a light-themed page
 * flashing dark on every navigation.
 *
 * Two copies of a rule is how a rule drifts. So the copy is not trusted:
 * theme-test.mts reads the real script text out of layout.tsx, runs it
 * against a fake document, localStorage and matchMedia, and asserts it agrees
 * with this function for every combination of stored value and OS setting.
 * If somebody changes one and not the other, that test fails.
 *
 * THE DEFAULT IS UNCHANGED, DELIBERATELY
 *
 * No stored value still means dark, exactly as before. Making `system` the
 * default would have been defensible and would also have changed the theme
 * for every member of staff on a light-mode computer, on the morning this
 * deployed, without anybody asking for it. `system` is something to choose.
 */
export function resolveTheme(
  stored: string | null | undefined,
  osPrefersLight: boolean,
): Theme {
  if (stored === "light") return "light";
  if (stored === "dark") return "dark";
  if (stored === "system") return osPrefersLight ? "light" : "dark";
  // Anything else — absent, or a value from a future version — is dark.
  return "dark";
}

/** The stored value as a preference, for the settings page to show. */
export function storedPreference(stored: string | null | undefined): ThemePreference {
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
}
