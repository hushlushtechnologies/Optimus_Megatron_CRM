"use client";

import { Check, Plus, Trash2, UserCheck } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";

import {
  ELIGIBILITY_RULE_KINDS,
  ELIGIBILITY_RULE_LABELS,
  type EligibilityRuleKind,
} from "@/src/lib/types/offers";
import { SEGMENT_PRESETS, applyPreset, matchingPresets } from "@/src/lib/utils/offer-segments";
import { cn } from "@/src/lib/utils/cn";

/*
|--------------------------------------------------------------------------
| WHO QUALIFIES
|--------------------------------------------------------------------------
|
| Rules as data, not code, so a refusal can be read back and explained to
| the customer it was applied to. Six kinds, and a customer must satisfy
| ALL of them — unlike vehicle targeting, which is any-one-of.
|
| That difference is deliberate and it is written on the screen, because
| "all" and "any" produce very different audiences and nobody should have to
| guess which one they just built.
|
| VIP is not a boolean here. It is one value of lifecycle_status, which is
| why there is no VIP checkbox: hard-coding one would mean a second customer
| tagging system the moment somebody wants "Gold".
*/

/** A rule as the form holds it: no id yet, value still a string. */
export interface DraftEligibilityRule {
  ruleKind: EligibilityRuleKind;
  operator: "in" | "not_in" | "gte" | "lte" | "eq";
  value: string;
}

interface OfferEligibilityBuilderProps {
  value: DraftEligibilityRule[];
  onChange: (next: DraftEligibilityRule[]) => void;
  lifecycleStatuses: string[];
  customerTags: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  disabled?: boolean;
}

/* Which rules take a list, which take a number, which take yes/no. */
const RULE_SHAPE: Record<EligibilityRuleKind, "list" | "number" | "boolean"> = {
  lifecycle_status: "list",
  customer_tag: "list",
  interested_brand: "list",
  min_completed_deals: "number",
  min_lifetime_spend_fils: "number",
  is_existing_customer: "boolean",
};

const RULE_HINT: Record<EligibilityRuleKind, string> = {
  lifecycle_status: "Where the customer is in their journey with you.",
  customer_tag: "A tag somebody has put on the customer record.",
  interested_brand: "A brand the customer has shown interest in.",
  min_completed_deals: "How many purchases they have completed, at least.",
  min_lifetime_spend_fils: "Total spent with you, in dirhams, at least.",
  is_existing_customer: "Whether they have bought before at all.",
};

export function OfferEligibilityBuilder({
  value,
  onChange,
  lifecycleStatuses,
  customerTags,
  brands,
  disabled = false,
}: OfferEligibilityBuilderProps) {
  const add = () => {
    /* The first kind not already used, so two identical rules aren't the default. */
    const used = new Set(value.map((rule) => rule.ruleKind));
    const next = ELIGIBILITY_RULE_KINDS.find((kind) => !used.has(kind)) ?? "lifecycle_status";

    onChange([
      ...value,
      {
        ruleKind: next,
        operator: RULE_SHAPE[next] === "number" ? "gte" : RULE_SHAPE[next] === "boolean" ? "eq" : "in",
        value: "",
      },
    ]);
  };

  const patch = (index: number, change: Partial<DraftEligibilityRule>) => {
    onChange(value.map((rule, i) => (i === index ? { ...rule, ...change } : rule)));
  };

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  /*
   * Changing the kind changes what the value means, so the value is cleared
   * and the operator reset. Keeping "3" when the rule becomes "has tag"
   * would submit a tag id of "3".
   */
  const changeKind = (index: number, kind: EligibilityRuleKind) => {
    patch(index, {
      ruleKind: kind,
      operator: RULE_SHAPE[kind] === "number" ? "gte" : RULE_SHAPE[kind] === "boolean" ? "eq" : "in",
      value: "",
    });
  };

  const active = matchingPresets(value);

  return (
    <div className="flex flex-col gap-3">
      {/*
        Segments as shorthand. Clicking one writes the equivalent rules
        below, where they can be read and edited — rather than storing a
        segment that the engine would have to learn to evaluate.
      */}
      <div className="flex flex-col gap-2">
        <p className="text-text-subtle text-xs font-medium tracking-wide uppercase">
          Common segments
        </p>

        <div className="flex flex-wrap gap-2">
          {SEGMENT_PRESETS.map((preset) => {
            const on = active.includes(preset.key);

            return (
              <button
                key={preset.key}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                title={preset.blurb}
                onClick={() => onChange(applyPreset(value, preset.key))}
                className={cn(
                  "text-body-sm inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 font-medium transition-colors",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  on
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-text-muted hover:text-text-primary hover:bg-card-hover",
                )}
              >
                {on && <Check className="size-3.5" aria-hidden="true" />}
                {preset.label}
              </button>
            );
          })}
        </div>

        <p className="text-text-subtle text-xs">
          These write the rules below, so you can see exactly what they mean and change them.
          A loyalty tier would be different — that is earned from points, not set by hand.
        </p>
      </div>

      {value.length === 0 ? (
        <div className="border-border bg-card-hover/40 flex items-start gap-3 rounded-lg border px-4 py-3">
          <UserCheck className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />

          <div>
            <p className="text-body-sm text-text-primary">Open to every customer.</p>
            <p className="text-text-subtle mt-0.5 text-xs">
              Add a rule below to restrict it. With no rules, anyone the campaign&apos;s vehicles
              apply to can use it.
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-body-sm text-text-muted">
            A customer must satisfy{" "}
            <strong className="text-text-primary font-medium">every</strong> rule below. (Vehicle
            targeting is the opposite — any one match is enough.)
          </p>

          <ul className="flex flex-col gap-3">
            {value.map((rule, index) => {
              const shape = RULE_SHAPE[rule.ruleKind];

              return (
                <li
                  key={index}
                  className="border-border bg-card-hover/40 flex flex-col gap-3 rounded-lg border p-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Select
                        label="Rule"
                        value={rule.ruleKind}
                        disabled={disabled}
                        onChange={(event) =>
                          changeKind(index, event.target.value as EligibilityRuleKind)
                        }
                        options={ELIGIBILITY_RULE_KINDS.map((kind) => ({
                          value: kind,
                          label: ELIGIBILITY_RULE_LABELS[kind],
                        }))}
                      />
                    </div>

                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => remove(index)}
                      aria-label={`Remove the ${ELIGIBILITY_RULE_LABELS[rule.ruleKind]} rule`}
                      className={cn(
                        "text-text-muted mt-6 inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors",
                        "hover:bg-card-hover hover:text-red-400 focus-visible:outline-primary focus-visible:outline-2",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>

                  <p className="text-text-subtle -mt-1 text-xs">{RULE_HINT[rule.ruleKind]}</p>

                  {shape === "list" && (
                    <Select
                      label="Must be one of"
                      value={rule.value}
                      disabled={disabled}
                      onChange={(event) => patch(index, { value: event.target.value })}
                      options={[
                        { value: "", label: "Choose..." },
                        ...(rule.ruleKind === "lifecycle_status"
                          ? lifecycleStatuses.map((status) => ({ value: status, label: status }))
                          : rule.ruleKind === "customer_tag"
                            ? customerTags.map((tag) => ({ value: tag.id, label: tag.name }))
                            : brands.map((brand) => ({ value: brand.id, label: brand.name }))),
                      ]}
                    />
                  )}

                  {shape === "number" && (
                    <Input
                      label={
                        rule.ruleKind === "min_lifetime_spend_fils"
                          ? "At least (AED)"
                          : "At least (purchases)"
                      }
                      type="number"
                      min={0}
                      step={rule.ruleKind === "min_lifetime_spend_fils" ? "0.01" : "1"}
                      value={rule.value}
                      disabled={disabled}
                      onChange={(event) => patch(index, { value: event.target.value })}
                    />
                  )}

                  {shape === "boolean" && (
                    <Select
                      label="Must be"
                      value={rule.value}
                      disabled={disabled}
                      onChange={(event) => patch(index, { value: event.target.value })}
                      options={[
                        { value: "", label: "Choose..." },
                        { value: "true", label: "An existing customer" },
                        { value: "false", label: "A new customer" },
                      ]}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || value.length >= ELIGIBILITY_RULE_KINDS.length}
          leftIcon={<Plus className="size-4" aria-hidden="true" />}
          onClick={add}
        >
          Add a rule
        </Button>

        {value.length >= ELIGIBILITY_RULE_KINDS.length && (
          <p className="text-text-subtle mt-1.5 text-xs">
            Every rule kind is in use. Change one rather than adding another.
          </p>
        )}
      </div>
    </div>
  );
}
