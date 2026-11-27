"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

import {
  THEME_STORAGE_KEY,
  resolveTheme,
  storedPreference,
  type Theme,
  type ThemePreference,
} from "./constants";

/*
|------------------------------------------------------------------------------
| The one theme system
|------------------------------------------------------------------------------
|
| Sprint 10 Phase 22: "reuse the existing theme provider and design tokens.
| Do not create a second theme system." So this is the same provider with
| `system` added, not a new one beside it.
|
| WHAT CHANGED
|
| The stored value used to be the theme. It is now the PREFERENCE, which can
| be `system`, and the theme is resolved from it plus the operating system.
| `dark` and `light` behave exactly as before, and an absent value is still
| dark, so nobody's screen changes on the day this deploys.
|
| The `light` class on <html> remains the only switch. Nothing else reads the
| preference to decide how to paint, which is why the sidebar stays dark in
| light mode without anything here having to know about it.
|
| TWO SUBSCRIPTIONS NOW
|
|   storage      another tab changed the preference
|   matchMedia   the operating system changed while the preference is `system`
|
| The second is the one that is easy to leave out. Without it, somebody on
| `system` whose computer switches to dark at sunset keeps a light screen
| until they reload — which looks like the setting not working.
|
|------------------------------------------------------------------------------
*/

type ThemeContextValue = {
  /** What is on screen. */
  theme: Theme;
  /** What was chosen, which may be `system`. */
  preference: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_CHANGE_EVENT = "omc-theme-change";

function osPrefersLight(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

function readStored(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Storage can throw in a private window or with cookies blocked. The
    // theme falling back to dark is a much better outcome than the provider
    // throwing and taking the whole page with it.
    return null;
  }
}

/** Put the resolved theme on <html>. The only place that touches the class. */
function applyResolved() {
  const theme = resolveTheme(readStored(), osPrefersLight());
  document.documentElement.classList.toggle("light", theme === "light");
  return theme;
}

function getThemeSnapshot(): Theme {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function getServerThemeSnapshot(): Theme {
  // Matches the inline script's default, so the first client render agrees
  // with the markup the server sent.
  return "dark";
}

function subscribeToTheme(callback: () => void) {
  const handleThemeChange = () => callback();

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    // Resolve rather than reading the new value directly: it may be `system`,
    // in which case the theme depends on this machine's setting and not on
    // the string that arrived.
    applyResolved();
    callback();
  };

  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  window.addEventListener("storage", handleStorage);

  // The operating system changing matters only while the preference is
  // `system`, and applyResolved() already knows that, so there is no need to
  // check the preference here.
  const media = window.matchMedia?.("(prefers-color-scheme: light)");
  const handleMedia = () => {
    applyResolved();
    callback();
  };
  media?.addEventListener?.("change", handleMedia);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.removeEventListener("storage", handleStorage);
    media?.removeEventListener?.("change", handleMedia);
  };
}

function getPreferenceSnapshot(): ThemePreference {
  return storedPreference(readStored());
}

function getServerPreferenceSnapshot(): ThemePreference {
  return "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const preference = useSyncExternalStore(
    subscribeToTheme,
    getPreferenceSnapshot,
    getServerPreferenceSnapshot,
  );

  const setTheme = (next: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Unstorable preference still applies for this page.
    }
    applyResolved();
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  const toggleTheme = () => {
    /*
     * The topbar button is a two-way switch and has to stay one. From
     * `system` it goes to the opposite of what is currently SHOWING, which is
     * what somebody pressing it means — not to the opposite of the stored
     * word, which would be a no-op half the time.
     */
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, preference, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);

  if (!ctx) {
    throw new Error("useThemeContext must be used inside ThemeProvider");
  }

  return ctx;
}
