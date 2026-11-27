"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/src/hooks/use-theme";
import { THEME_PREFERENCES, type ThemePreference } from "@/src/lib/theme/constants";
import { useReducedMotion } from "@/src/hooks/use-reduced-motion";
import { cn } from "@/src/lib/utils/cn";

/*
|--------------------------------------------------------------------------
| APPEARANCE — PHASE 22
|--------------------------------------------------------------------------
|
| "Reuse the existing theme provider and design tokens. Do not create a
| second theme system." So this calls the provider the topbar button
| already calls. Pressing either one updates the other, because both read
| the same store.
|
| It is deliberately not a form with a save button. The theme is a
| personal preference stored in this browser, it applies the instant you
| pick it, and there is nothing to validate — a Save button would imply
| it might fail.
|
| REDUCED MOTION IS NOT A SWITCH HERE, and that is the point.
| useReducedMotion already follows the operating system's setting, and
| several components honour it. Adding an app-level toggle would be a
| second place that decides whether to animate — exactly the mistake this
| phase warns about for themes. So the page shows what your computer
| currently says and where to change it.
*/

const OPTIONS: Record<ThemePreference, { label: string; detail: string; Icon: typeof Sun }> = {
  light: { label: "Light", detail: "Always light, whatever your computer is set to.", Icon: Sun },
  dark: { label: "Dark", detail: "Always dark. This is the default.", Icon: Moon },
  system: {
    label: "Match my computer",
    detail: "Follows your operating system, and changes with it.",
    Icon: Monitor,
  },
};

export function AppearanceClient() {
  const { theme, preference, setTheme } = useTheme();
  const reducedMotion = useReducedMotion();

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body-sm text-text-primary mb-2 font-medium">Theme</legend>

        {THEME_PREFERENCES.map((option) => {
          const { label, detail, Icon } = OPTIONS[option];
          const selected = preference === option;

          return (
            <label
              key={option}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition-colors has-[:focus-visible]:ring-2",
                "has-[:focus-visible]:ring-primary",
                selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
              )}
            >
              <input
                type="radio"
                name="theme"
                value={option}
                checked={selected}
                onChange={() => setTheme(option)}
                className="sr-only"
              />
              <Icon className="text-text-subtle mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">
                <span className="text-body-sm text-text-primary block font-medium">{label}</span>
                <span className="text-caption text-text-subtle block">{detail}</span>
              </span>
              {selected && <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            </label>
          );
        })}

        {preference === "system" && (
          <p className="text-caption text-text-muted">
            Your computer is currently set to {theme}, so that is what you are seeing.
          </p>
        )}
      </fieldset>

      <div className="border-border flex flex-col gap-1 rounded-md border px-3 py-3">
        <p className="text-body-sm text-text-primary font-medium">Reduced motion</p>
        <p className="text-caption text-text-muted">
          {reducedMotion
            ? "Your computer asks for reduced motion, so animations and chart transitions are already switched off."
            : "Your computer is not asking for reduced motion, so animations are on."}
        </p>
        <p className="text-caption text-text-subtle">
          This follows your operating system rather than a setting here, so it applies to every site and
          stays consistent. Change it in your system accessibility settings.
        </p>
      </div>

      <p className="text-caption text-text-subtle">
        The theme is stored in this browser, so it does not follow you to another computer. The sidebar
        stays dark in both themes by design.
      </p>
    </div>
  );
}
