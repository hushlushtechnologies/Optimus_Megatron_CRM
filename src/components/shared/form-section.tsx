"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/src/lib/utils/cn";

/*
|--------------------------------------------------------------------------
| ONE TITLED STEP ON A LONG FORM
|--------------------------------------------------------------------------
|
| Written for the new-enquiry form in Sprint 7 and promoted here in Sprint 8,
| because the offer create form needs exactly the same thing and a second
| copy would be two places to change a numbered step.
|
| The old name still works: enquiries/form/enquiry-form-section.tsx re-exports
| these, so nothing in Sprint 7 had to change.
*/

interface FormSectionProps {
  /** Shown in the circle until the section is answered. */
  step: number;
  title: string;
  description?: string;
  /** The question has been answered well enough to move on. */
  done?: boolean;
  /** Not required to submit. Says so, rather than leaving people guessing. */
  optional?: boolean;
  children: React.ReactNode;
}

/**
 * One titled step on a create form.
 *
 * The whole form stays on one scrollable page rather than becoming a wizard
 * with Next and Back. A wizard hides what you already typed behind a button,
 * which is exactly what somebody wants to see when they are deciding what to
 * type next — and it makes the review step a second journey rather than a
 * glance up the page.
 *
 * Progressive disclosure comes from which sections are rendered at all,
 * decided by the form above. This component renders what it is given.
 */
export function FormSection({
  step,
  title,
  description,
  done = false,
  optional = false,
  children,
}: FormSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      aria-label={title}
      className="surface-card flex flex-col gap-4 p-5"
    >
      <div className="flex items-start gap-3">
        {/* The number becomes a tick, so progress reads at a glance down the page. */}
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold tabular-nums transition-colors",
            done
              ? "border-success/30 bg-success/10 text-success"
              : "border-border bg-card-hover text-text-muted",
          )}
        >
          {done ? <Check className="size-3.5" /> : step}
        </span>

        <div className="min-w-0">
          <h2 className="text-body text-text-primary font-medium">
            {title}
            {optional && <span className="text-caption text-text-subtle ml-2 font-normal">Optional</span>}
          </h2>

          {description && <p className="text-body-sm text-text-muted mt-0.5">{description}</p>}
        </div>
      </div>

      <div className="sm:pl-10">{children}</div>
    </motion.section>
  );
}

/* =========================================================
   REVIEW LINE
========================================================= */

/**
 * One fact on the review step.
 *
 * Shows "Not given" rather than hiding an empty value, because the point of
 * a review is to notice what is missing.
 */
export function ReviewLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
      <span className="text-body-sm text-text-muted">{label}</span>

      <span className="text-body-sm text-text-primary min-w-0 text-right break-words">
        {value?.trim() ? value : <span className="text-text-subtle">Not given</span>}
      </span>
    </div>
  );
}
