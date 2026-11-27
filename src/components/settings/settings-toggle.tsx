"use client";

/*
|--------------------------------------------------------------------------
| A SWITCH WITH ITS CONSEQUENCE NEXT TO IT
|--------------------------------------------------------------------------
|
| Lifted from the old Sales Settings page so that four settings pages
| share one switch instead of growing four. Two things were added:
|
|   disabled, for somebody who may read a page but not change it
|   a described-by link from the switch to its description
|
| The description is the part that earns its place. "Charge fees on deals"
| is a label; "when off, no fees are offered or charged on any deal, and
| fees already on a confirmed deal are never changed" is what somebody
| needs before flipping it. Screen readers only reach that text if the
| input points at it, which the original did not do.
*/

import { useId } from "react";

export function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <label
      htmlFor={`${id}-switch`}
      className={`border-border has-[:focus-visible]:ring-primary flex min-h-11 items-start gap-3 rounded-md border px-3 py-3 transition-colors has-[:focus-visible]:ring-2 ${
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-primary/40 cursor-pointer"
      }`}
    >
      <input
        id={`${id}-switch`}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-description`}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-primary mt-1 size-4"
      />
      <span>
        <span className="text-body-sm text-text-primary block font-medium">{label}</span>
        <span id={`${id}-description`} className="text-caption text-text-subtle block">
          {description}
        </span>
      </span>
    </label>
  );
}
