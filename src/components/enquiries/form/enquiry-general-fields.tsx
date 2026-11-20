"use client";

import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";

import {
  GENERAL_CATEGORIES,
  GENERAL_CATEGORY_HINTS,
  type GeneralCategory,
} from "@/src/lib/types/enquiry-details";
import { cn } from "@/src/lib/utils/cn";

interface EnquiryGeneralFieldsProps {
  category: string;
  onCategoryChange: (next: string) => void;
  subject: string;
  onSubjectChange: (next: string) => void;
  message: string;
  onMessageChange: (next: string) => void;
}

/**
 * A question that isn't about buying or selling a car.
 *
 * The plan asks for this one to be simple and fast, and it is the only type
 * with no detail table of its own: a category, a line about what it is, and
 * what they actually said.
 *
 * The category is six buttons rather than a dropdown. Somebody on a phone
 * call wants to read the options and hit one, not open a list, scan it,
 * and close it — and with six fixed choices the whole set fits on screen.
 */
export function EnquiryGeneralFields({
  category,
  onCategoryChange,
  subject,
  onSubjectChange,
  message,
  onMessageChange,
}: EnquiryGeneralFieldsProps) {
  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="text-label">What is it about?</legend>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {GENERAL_CATEGORIES.map((item: GeneralCategory) => {
            const active = category === item;

            return (
              <button
                key={item}
                type="button"
                aria-pressed={active}
                /* Clicking the chosen one again clears it, rather than trapping the choice. */
                onClick={() => onCategoryChange(active ? "" : item)}
                className={cn(
                  "flex min-h-11 flex-col justify-center rounded-lg border px-3.5 py-2 text-left transition-colors",
                  active ? "border-primary bg-primary/12" : "border-border bg-card hover:bg-card-hover",
                )}
              >
                <span
                  className={cn(
                    "text-body-sm font-medium",
                    active ? "text-primary-text" : "text-text-primary",
                  )}
                >
                  {item}
                </span>

                <span className="text-caption text-text-subtle">{GENERAL_CATEGORY_HINTS[item]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <Input
        label="What they asked, in a line"
        required
        placeholder="e.g. Does the 2023 Defender come with a service package?"
        maxLength={160}
        value={subject}
        onChange={(event) => onSubjectChange(event.target.value)}
        hint="This is what colleagues see in the list, so make it the question itself."
      />

      <Textarea
        label="The full question"
        rows={4}
        maxLength={4000}
        value={message}
        onChange={(event) => onMessageChange(event.target.value)}
        hint="Their words, as near as you can. Whoever rings back will not have heard the call."
      />
    </div>
  );
}
