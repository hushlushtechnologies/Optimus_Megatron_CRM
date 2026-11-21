import { Car, CheckCircle2, Globe, Users, XCircle } from "lucide-react";

import { cn } from "@/src/lib/utils/cn";
import { formatFils } from "@/src/lib/utils/sales-money";
import {
  ELIGIBILITY_RULE_LABELS,
  type EligibilityRule,
  type PromotionTarget,
  type RejectedOffer,
} from "@/src/lib/types/offers";

interface EligibilitySummaryProps {
  targets: PromotionTarget[];
  rules: EligibilityRule[];
  /** Resolves a target id to a name. Ids are no use to a person. */
  nameFor?: (kind: PromotionTarget["targetKind"], id: string) => string | undefined;
  /** Resolves a tag or brand id inside a rule. */
  labelFor?: (value: string) => string | undefined;
  className?: string;
}

/* =========================================================
   ONE RULE, IN WORDS
========================================================= */

function describeRule(rule: EligibilityRule, labelFor?: (value: string) => string | undefined): string {
  const label = ELIGIBILITY_RULE_LABELS[rule.ruleKind] ?? rule.ruleKind;

  const values = Array.isArray(rule.value)
    ? rule.value.map((item) => (typeof item === "string" ? (labelFor?.(item) ?? item) : String(item)))
    : [];

  switch (rule.ruleKind) {
    case "lifecycle_status":
      return rule.operator === "not_in"
        ? `Not ${values.join(" or ")}`
        : `${values.join(" or ")} customers`;

    case "customer_tag":
      return rule.operator === "not_in"
        ? `Without the ${values.join(" or ")} tag`
        : `Tagged ${values.join(" or ")}`;

    case "interested_brand":
      return `Interested in ${values.join(" or ")}`;

    case "min_completed_deals": {
      const n = Number(rule.value);
      return rule.operator === "lte"
        ? `At most ${n} previous ${n === 1 ? "purchase" : "purchases"}`
        : `At least ${n} previous ${n === 1 ? "purchase" : "purchases"}`;
    }

    case "min_lifetime_spend_fils": {
      const fils = BigInt(Math.round(Number(rule.value) || 0));
      return rule.operator === "lte"
        ? `Spent up to ${formatFils(fils)}`
        : `Spent ${formatFils(fils)} or more`;
    }

    case "is_existing_customer":
      return rule.value === true || rule.value === "true"
        ? "Has bought before"
        : "Has never bought before";

    default:
      return label;
  }
}

/* =========================================================
   WHO AND WHAT THIS APPLIES TO
========================================================= */

/**
 * The campaign's reach, in words rather than ids.
 *
 * Two separate questions, kept separate: which *vehicles* it covers, and
 * which *customers* qualify. Running them together reads as one condition
 * and then nobody can say why a particular deal was refused.
 */
export function EligibilitySummary({
  targets,
  rules,
  nameFor,
  labelFor,
  className,
}: EligibilitySummaryProps) {
  const grouped = targets.reduce<Record<string, string[]>>((acc, target) => {
    const name = nameFor?.(target.targetKind, target.targetId) ?? "Unnamed";
    acc[target.targetKind] = [...(acc[target.targetKind] ?? []), name];
    return acc;
  }, {});

  const kindLabels: Record<PromotionTarget["targetKind"], string> = {
    car: "Vehicles",
    brand: "Brands",
    model: "Models",
    collection: "Collections",
    location: "Showrooms",
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* ---- Vehicles ---- */}

      <div className="flex flex-col gap-1.5">
        <p className="text-label flex items-center gap-1.5">
          <Car className="size-3.5" aria-hidden="true" /> Vehicles
        </p>

        {targets.length === 0 ? (
          <p className="text-body-sm text-text-muted flex items-center gap-1.5">
            <Globe className="size-3.5 shrink-0" aria-hidden="true" />
            Every eligible vehicle
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {Object.entries(grouped).map(([kind, names]) => (
              <li key={kind} className="text-body-sm text-text-primary">
                <span className="text-text-muted">
                  {kindLabels[kind as PromotionTarget["targetKind"]] ?? kind}:
                </span>{" "}
                {names.join(", ")}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- Customers ---- */}

      <div className="flex flex-col gap-1.5">
        <p className="text-label flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden="true" /> Customers
        </p>

        {rules.length === 0 ? (
          <p className="text-body-sm text-text-muted flex items-center gap-1.5">
            <Globe className="size-3.5 shrink-0" aria-hidden="true" />
            Anyone
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {rules.map((rule) => (
                <li key={rule.id} className="text-body-sm text-text-primary flex items-start gap-1.5">
                  <CheckCircle2 className="text-success mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {describeRule(rule, labelFor)}
                </li>
              ))}
            </ul>

            {/* Every condition, not any — worth stating once a list exists. */}
            {rules.length > 1 && (
              <p className="text-caption text-text-subtle">All of these must be true.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   WHY NOT
========================================================= */

/**
 * The campaigns that did not apply, and why.
 *
 * This is the half that usually goes missing. A salesperson being told "no
 * offers available" cannot act; being told "the customer has already used
 * this one" can.
 */
export function IneligibilityList({
  rejected,
  className,
}: {
  rejected: RejectedOffer[];
  className?: string;
}) {
  if (rejected.length === 0) return null;

  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {rejected.map((item) => (
        <li key={item.promotion.id} className="text-body-sm text-text-muted flex items-start gap-2">
          <XCircle className="text-text-subtle mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="text-text-primary">{item.promotion.name}</span> — {item.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
