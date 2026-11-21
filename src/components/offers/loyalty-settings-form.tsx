"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Info, Power, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Switch } from "@/src/components/ui/switch";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";
import { FormSection } from "@/src/components/shared/form-section";

import { saveEarnRuleAction, saveLoyaltySettingsAction } from "@/app/admin/offers/loyalty-actions";
import type { LoyaltyEarnRule, LoyaltySettings } from "@/src/lib/supabase/loyalty-queries";
import {
  EARN_BASES,
  EARN_BASIS_LABELS,
  REFUND_POLICIES,
  REFUND_POLICY_LABELS,
} from "@/src/lib/validation/loyalty";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";

/*
|--------------------------------------------------------------------------
| LOYALTY SETTINGS (Phase 17)
|--------------------------------------------------------------------------
|
| "Do not assume earning or conversion values."
|
| So both rates start blank, the program ships off, and it cannot be
| switched on until both are set — enforced by a database constraint, by the
| schema, and by this form disabling the switch. Three layers for one rule,
| because the consequence of getting it wrong is crediting points at a rate
| nobody chose.
|
| Every number here is shown with a worked example underneath it, computed
| from what is actually typed. "10 points per AED 1,000" means nothing on
| its own; "a AED 250,000 car earns 2,500 points" is a sentence somebody can
| check against what they meant.
*/

const EVENT_LABELS: Record<string, { title: string; blurb: string }> = {
  deal_completed: {
    title: "A sale completes",
    blurb: "The safe one: the money has been taken and the car has gone.",
  },
  deal_confirmed: {
    title: "A sale is confirmed",
    blurb: "Earns before delivery. Points go out before the car does.",
  },
  payment_verified: {
    title: "A payment is verified",
    blurb: "Can credit several times for one deal, once per payment.",
  },
  manual_bonus: {
    title: "Staff grant a bonus",
    blurb: "Goodwill points, by hand. Needs the loyalty adjust permission.",
  },
};

interface LoyaltySettingsFormProps {
  settings: LoyaltySettings;
  rules: LoyaltyEarnRule[];
  canEdit: boolean;
}

export function LoyaltySettingsForm({ settings, rules, canEdit }: LoyaltySettingsFormProps) {
  const router = useRouter();

  const text = (value: number | null) => (value === null ? "" : String(value));

  const [form, setForm] = useState({
    isEnabled: settings.isEnabled,
    earnPointsPer1000Aed: text(settings.earnPointsPer1000Aed),
    earnBasis: settings.earnBasis,
    redeemPointsPerAed: text(settings.redeemPointsPerAed),
    minRedeemPoints: text(settings.minRedeemPoints),
    maxRedeemPoints: text(settings.maxRedeemPoints),
    maxRedeemPercentOfDeal:
      settings.maxRedeemBpsOfDeal === null ? "" : String(settings.maxRedeemBpsOfDeal / 100),
    expiryMonths: text(settings.expiryMonths),
    refundPolicy: settings.refundPolicy,
    allowNegativeBalance: settings.allowNegativeBalance,
  });

  const [saving, setSaving] = useState(false);
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [confirmNegative, setConfirmNegative] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /* The two numbers that have to exist before the program can run. */
  const earnRate = Number(form.earnPointsPer1000Aed);
  const redeemRate = Number(form.redeemPointsPerAed);

  const hasEarn = form.earnPointsPer1000Aed !== "" && earnRate > 0;
  const hasRedeem = form.redeemPointsPerAed !== "" && redeemRate > 0;
  const configured = hasEarn && hasRedeem;

  const save = async (overrides?: Partial<typeof form>) => {
    setSaving(true);

    try {
      const result = await saveLoyaltySettingsAction({ ...form, ...overrides });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (overrides) setForm((prev) => ({ ...prev, ...overrides }));

      toast.success(result.message ?? "Saved.");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Nothing was saved.");
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule: LoyaltyEarnRule, isEnabled: boolean) => {
    setSaving(true);

    try {
      const result = await saveEarnRuleAction({
        eventKey: rule.eventKey,
        isEnabled,
        multiplier: rule.multiplier,
        collectionIds: rule.collectionIds,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        isEnabled
          ? `Points will be credited when ${EVENT_LABELS[rule.eventKey]?.title.toLowerCase() ?? rule.eventKey}.`
          : "That event no longer credits points.",
      );

      router.refresh();
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ===================================================
          THE SWITCH
      =================================================== */}

      <section className="surface-card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-body text-text-primary flex items-center gap-2 font-medium">
              <Power className="text-primary size-4" aria-hidden="true" />
              The loyalty program
            </h2>

            <p className="text-body-sm text-text-muted mt-1 max-w-xl">
              {settings.isEnabled
                ? "On. Qualifying sales credit points, and customers can spend them against deals."
                : "Off. Nothing earns and nothing can be redeemed — including anything already configured below."}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Badge status={settings.isEnabled ? "success" : "neutral"}>
              {settings.isEnabled ? "On" : "Off"}
            </Badge>
          </div>
        </div>

        {/* Switch renders its own label and description, so it is the row. */}
        <div className="border-border rounded-lg border px-4 py-3">
          <Switch
            label="Loyalty program"
            description={
              configured
                ? "Switching this on starts crediting points on qualifying sales."
                : "Both rates below have to be set first."
            }
            checked={form.isEnabled}
            disabled={!canEdit || saving || (!configured && !form.isEnabled)}
            onCheckedChange={(next) => {
              if (next) setConfirmEnable(true);
              else void save({ isEnabled: false });
            }}
          />
        </div>

        {/*
          The switch is disabled until both rates exist, and this says why.
          Without it, a disabled control is just a control that doesn't work.
        */}
        {!configured && !settings.isEnabled && (
          <p className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
            <span>
              The program can&apos;t be switched on until both the earn rate and the redemption rate
              are set below. That&apos;s deliberate — without them, points would be credited at a
              rate nobody chose.
            </span>
          </p>
        )}

        {settings.updatedByName && (
          <p className="text-text-subtle text-xs">
            Last changed {formatDateTimeFull(settings.updatedAt)} by {settings.updatedByName}.
          </p>
        )}
      </section>

      {/* ===================================================
          EARNING
      =================================================== */}

      <FormSection
        step={1}
        title="Earning"
        description="How a sale turns into points."
        done={hasEarn}
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Input
                label="Points per AED 1,000 spent"
                type="number"
                min={1}
                step="1"
                value={form.earnPointsPer1000Aed}
                disabled={!canEdit}
                onChange={(event) => set("earnPointsPer1000Aed", event.target.value)}
                placeholder="e.g. 10"
              />

              {/* A worked example, from what is actually typed. */}
              {hasEarn && (
                <p className="text-body-sm text-text-muted mt-1.5">
                  A AED 250,000 car earns{" "}
                  <strong className="text-text-primary font-medium tabular-nums">
                    {(250 * earnRate).toLocaleString()}
                  </strong>{" "}
                  points.
                </p>
              )}
            </div>

            <Select
              label="Counted on"
              value={form.earnBasis}
              disabled={!canEdit}
              onChange={(event) => set("earnBasis", event.target.value as typeof form.earnBasis)}
              options={EARN_BASES.map((basis) => ({
                value: basis,
                label: EARN_BASIS_LABELS[basis],
              }))}
              hint="Which figure on the deal counts as qualifying spend."
            />
          </div>

          {/* ---- Which events credit ---- */}

          <div className="flex flex-col gap-2">
            <p className="text-text-subtle text-xs font-medium tracking-wide uppercase">
              What credits points
            </p>

            <p className="text-body-sm text-text-muted">
              All off by default. A lead or an enquiry can never credit points — there is no event
              for it.
            </p>

            <ul className="border-border divide-border divide-y rounded-lg border">
              {rules.map((rule) => {
                const label = EVENT_LABELS[rule.eventKey];

                return (
                  <li key={rule.eventKey} className="px-4 py-3">
                    <Switch
                      label={label?.title ?? rule.eventKey}
                      description={
                        rule.multiplier !== 1
                          ? `${label?.blurb ?? ""} ${rule.multiplier}× multiplier.`.trim()
                          : label?.blurb
                      }
                      checked={rule.isEnabled}
                      disabled={!canEdit || saving}
                      onCheckedChange={(next) => void toggleRule(rule, next)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>

          <Input
            label="Points expire after (months)"
            type="number"
            min={1}
            step="1"
            value={form.expiryMonths}
            disabled={!canEdit}
            onChange={(event) => set("expiryMonths", event.target.value)}
            hint="Blank means points never expire. Expiry is allocated oldest-first."
          />
        </div>
      </FormSection>

      {/* ===================================================
          REDEEMING
      =================================================== */}

      <FormSection
        step={2}
        title="Redeeming"
        description="What points are worth when spent."
        done={hasRedeem}
      >
        <div className="flex flex-col gap-4">
          <div>
            <Input
              label="Points needed for AED 1"
              type="number"
              min={1}
              step="1"
              value={form.redeemPointsPerAed}
              disabled={!canEdit}
              onChange={(event) => set("redeemPointsPerAed", event.target.value)}
              placeholder="e.g. 10"
            />

            {hasRedeem && (
              <p className="text-body-sm text-text-muted mt-1.5">
                1,000 points are worth{" "}
                <strong className="text-text-primary font-medium tabular-nums">
                  AED {(1000 / redeemRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </strong>
                .
              </p>
            )}

            {/* The round trip, which is the number that actually matters. */}
            {hasEarn && hasRedeem && (
              <p className="text-body-sm text-text-muted border-border bg-card-hover/40 mt-2 rounded-md border px-3 py-2">
                Round trip: a AED 250,000 car earns {(250 * earnRate).toLocaleString()} points,
                worth{" "}
                <strong className="text-text-primary font-medium">
                  AED{" "}
                  {((250 * earnRate) / redeemRate).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </strong>{" "}
                — about{" "}
                {(((250 * earnRate) / redeemRate / 250000) * 100).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
                % back.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Minimum redemption"
              type="number"
              min={1}
              step="1"
              value={form.minRedeemPoints}
              disabled={!canEdit}
              onChange={(event) => set("minRedeemPoints", event.target.value)}
              hint="Blank = no minimum."
            />

            <Input
              label="Maximum redemption"
              type="number"
              min={1}
              step="1"
              value={form.maxRedeemPoints}
              disabled={!canEdit}
              onChange={(event) => set("maxRedeemPoints", event.target.value)}
              hint="Per deal. Blank = no cap."
            />

            <Input
              label="Most of a deal points may cover (%)"
              type="number"
              min={0.01}
              max={100}
              step="0.01"
              value={form.maxRedeemPercentOfDeal}
              disabled={!canEdit}
              onChange={(event) => set("maxRedeemPercentOfDeal", event.target.value)}
              hint="Blank = no ceiling."
            />
          </div>
        </div>
      </FormSection>

      {/* ===================================================
          REFUNDS
      =================================================== */}

      <FormSection step={3} title="Refunds and cancellations" description="What happens to points when a sale comes undone.">
        <div className="flex flex-col gap-4">
          <Select
            label="When a sale is refunded or cancelled"
            value={form.refundPolicy}
            disabled={!canEdit}
            onChange={(event) => set("refundPolicy", event.target.value as typeof form.refundPolicy)}
            options={REFUND_POLICIES.map((policy) => ({
              value: policy,
              label: REFUND_POLICY_LABELS[policy],
            }))}
          />

          {/*
            The behaviour that surprised me when I tested it, so it is said
            here rather than discovered later.
          */}
          <p className="text-body-sm text-text-muted border-border bg-card-hover/40 rounded-md border px-3 py-2.5">
            Points the customer has already <strong className="text-text-primary">spent</strong>
            {" "}can&apos;t be taken back. If a refunded sale earned 1,000 points and 400 were
            already used, 600 come back and the other 400 stay with the customer — the refund still
            goes through, and says so. Points that had already expired are not taken twice either.
          </p>

          <div className="border-border rounded-lg border px-4 py-3">
            <Switch
              label="Allow negative balances"
              description="Off is safer. On, a refund can claw back the full amount and leave the customer owing points."
              checked={form.allowNegativeBalance}
              disabled={!canEdit || saving}
              onCheckedChange={(next) => {
                if (next) setConfirmNegative(true);
                else set("allowNegativeBalance", false);
              }}
            />
          </div>
        </div>
      </FormSection>

      {/* ===================================================
          SAVE
      =================================================== */}

      {canEdit && (
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-body-sm text-text-muted">
            {configured
              ? "Both rates are set."
              : "Set both rates to be able to switch the program on."}
          </p>

          <Button
            variant="gradient"
            disabled={saving}
            leftIcon={<Save className="size-4" aria-hidden="true" />}
            onClick={() => void save()}
          >
            Save settings
          </Button>
        </div>
      )}

      {!canEdit && (
        <p className="text-body-sm text-text-muted flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
          You can see these settings but not change them. Changing the earn rate or the conversion
          needs the loyalty settings permission.
        </p>
      )}

      {/* ===================================================
          CONFIRMATIONS
      =================================================== */}

      <ConfirmDialog
        isOpen={confirmEnable}
        onClose={() => setConfirmEnable(false)}
        onConfirm={() => {
          setConfirmEnable(false);
          void save({ isEnabled: true });
        }}
        title="Switch the loyalty program on?"
        description={
          hasEarn && hasRedeem
            ? `From now on, qualifying sales credit ${earnRate} points per AED 1,000, and ${redeemRate} points buy AED 1. Nothing is applied to past sales — only to events from this point on.`
            : "Both rates need to be set first."
        }
        confirmLabel="Switch on"
        isLoading={saving}
      />

      <ConfirmDialog
        isOpen={confirmNegative}
        onClose={() => setConfirmNegative(false)}
        onConfirm={() => {
          setConfirmNegative(false);
          set("allowNegativeBalance", true);
          toast.info("Remember to save — nothing has changed yet.");
        }}
        title="Allow negative balances?"
        description="A refund will then be able to take back more points than the customer has, leaving them with a negative balance they have to earn off. With this off, a refund takes back only what is there and says what it couldn't reclaim."
        confirmLabel="Allow"
        variant="danger"
      />

      {configured && settings.isEnabled && (
        <p className="text-body-sm text-text-muted flex items-start gap-2">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden="true" />
          The program is running. Changing a rate affects future events only — nothing already
          credited or redeemed is recalculated.
        </p>
      )}
    </div>
  );
}
