import type { LucideIcon } from "lucide-react";
import { Info } from "lucide-react";

/*
|--------------------------------------------------------------------------
| A GROUP OF RELATED CONTROLS
|--------------------------------------------------------------------------
|
| The brief is specific about this: grouped controls, helpful descriptions,
| and no large generic forms containing unrelated settings. A section is the
| unit of grouping — "Discounts", "Deposit rules", "Earning" — and a page is
| a few of them.
|
| `effect` is the field worth explaining. The brief asks that high-risk
| settings "clearly explain the effect of changes", and the useful version of
| that is not a warning triangle, it is a sentence saying what moves when
| this changes: "New reservations use this. Existing holds keep the duration
| they were created with."
|
| That sentence is also the thing somebody needs when deciding whether to
| touch the control at all, so it sits under the heading rather than behind
| a tooltip.
*/

interface SettingsSectionProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** What a change here affects, and what it leaves alone. */
  effect?: string;
  children: React.ReactNode;
}

export function SettingsSection({
  title,
  description,
  icon: Icon,
  effect,
  children,
}: SettingsSectionProps) {
  return (
    <section aria-labelledby={`section-${title.replace(/\s+/g, "-").toLowerCase()}`} className="surface-card flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className="text-text-subtle size-5 shrink-0" aria-hidden="true" />}
          <h2
            id={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}
            className="text-h4"
          >
            {title}
          </h2>
        </div>

        {description && <p className="text-body-sm text-text-muted">{description}</p>}

        {effect && (
          <p className="text-caption text-text-subtle flex items-start gap-1.5 pt-1">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{effect}</span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
