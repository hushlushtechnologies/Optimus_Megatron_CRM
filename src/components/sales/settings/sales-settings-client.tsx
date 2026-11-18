"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Info, ShieldCheck, Tag, Timer, Wallet } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { MoneyInput } from "@/src/components/sales/form/money-input";
import { PercentField } from "@/src/components/sales/settings/percent-field";
import { FeeTypesCard } from "@/src/components/sales/settings/fee-types-card";
import { updateSalesSettingsAction } from "@/app/admin/sales/settings/actions";
import { useMotion } from "@/src/hooks/use-motion";
import { salesSettingsSchema } from "@/src/lib/validation/sales-pricing";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type { SalesSettingsPageData } from "@/src/lib/supabase/sales-settings-queries";
import { CompanyProfileCard } from "@/src/components/sales/settings/company-profile-card";
import type { CompanyProfile } from "@/src/lib/types/sales-documents";
import { DeliveryChecklistCard } from "@/src/components/sales/settings/delivery-checklist-card";
import type { DeliveryTemplate } from "@/src/lib/types/sales-delivery";

interface Values {
  discount: string;
  feesEnabled: boolean;
  defaultDays: string;
  maxDays: string;
  depositMode: "none" | "fixed" | "percent";
  depositValue: string;
  minDeposit: string;
  separateVerifier: boolean;
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="border-border hover:border-primary/40 has-[:focus-visible]:ring-primary flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition-colors has-[:focus-visible]:ring-2">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-primary mt-1 size-4"
      />
      <span>
        <span className="text-body-sm text-text-primary block font-medium">{label}</span>
        <span className="text-caption text-text-subtle block">{description}</span>
      </span>
    </label>
  );
}

function Card({
  icon,
  title,
  children,
  index,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  index: number;
}) {
  const { fadeUp } = useMotion();
  return (
    <motion.section {...fadeUp(index)} aria-label={title} className="surface-card flex flex-col gap-4 p-5">
      <header className="flex items-center gap-2.5">
        <span className="text-primary">{icon}</span>
        <h2 className="text-h3">{title}</h2>
      </header>
      {children}
    </motion.section>
  );
}

export function SalesSettingsClient({
  data,
  company,
  templates,
}: {
  data: SalesSettingsPageData;
  company: CompanyProfile | null;
  templates: DeliveryTemplate[] | null;
}) {
  const router = useRouter();
  const { fadeUp } = useMotion();
  const s = data.settings;

  const initial: Values = {
    discount: String(s.discountAutoApprovePercent),
    feesEnabled: s.feesEnabled,
    defaultDays: String(s.reservationDefaultDays),
    maxDays: String(s.reservationMaxDays),
    depositMode: s.reservationDepositMode,
    depositValue: s.reservationDepositMode === "none" ? "" : String(s.reservationDepositValue),
    minDeposit: String(s.confirmMinDepositPercent),
    separateVerifier: s.paymentsRequireSeparateVerifier,
  };

  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const patch = (change: Partial<Values>) => setValues((previous) => ({ ...previous, ...change }));

  const save = async () => {
    const payload = {
      discountAutoApprovePercent: values.discount,
      feesEnabled: values.feesEnabled,
      reservationDefaultDays: Number(values.defaultDays),
      reservationMaxDays: Number(values.maxDays),
      depositMode: values.depositMode,
      depositValue: values.depositMode === "none" ? "0" : values.depositValue,
      confirmMinDepositPercent: values.minDeposit,
      separateVerifier: values.separateVerifier,
    };

    const parsed = salesSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      });
      setErrors(next);
      toast.error("Please fix the highlighted settings.");
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      const result = await updateSalesSettingsAction(parsed.data);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Settings saved");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <motion.div {...fadeUp(0)} className="flex flex-col gap-2">
        <Link
          href="/admin/sales"
          className="text-body-sm text-text-muted hover:text-text-primary focus-visible:ring-primary inline-flex min-h-11 items-center gap-1.5 self-start rounded focus-visible:ring-2 focus-visible:outline-none sm:min-h-0"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Sales
        </Link>
        <div>
          <h1 className="text-h1">Sales settings</h1>
          <p className="text-body-sm text-text-muted">
            The rules for discounts, fees, reservations and payments. Changes apply straight away and are
            recorded.
          </p>
        </div>
      </motion.div>

      <div className="grid max-w-3xl grid-cols-1 gap-6">
        <Card index={1} icon={<Tag className="size-5" aria-hidden="true" />} title="Discounts">
          <PercentField
            label="Discount that needs no approval"
            value={values.discount}
            onChange={(value) => patch({ discount: value })}
            error={errors.discountAutoApprovePercent}
            helper="A discount up to this percentage of the proposed price is fine. Above it, someone with approval rights must approve it before the deal can be confirmed. 0 means every discount needs approval."
          />
          <p className="border-border bg-card-hover/40 text-body-sm text-text-primary rounded-md border px-3 py-2.5">
            {data.approverRoles === null
              ? "Who can approve couldn't be loaded."
              : data.approverRoles.length === 0
                ? "No role can approve discounts yet except Super Admin. Give a role the Approve discounts permission in your roles setup."
                : `Who can approve: ${data.approverRoles.join(", ")}, and Super Admin. Change this with the Approve discounts permission in your roles setup.`}
          </p>
        </Card>

        <Card index={2} icon={<Wallet className="size-5" aria-hidden="true" />} title="Fees">
          <Toggle
            label="Charge fees on deals"
            description="When off, no fees are offered or charged on any deal. Fees already saved on a confirmed deal are never changed."
            checked={values.feesEnabled}
            onChange={(value) => patch({ feesEnabled: value })}
          />
          <FeeTypesCard feeTypes={data.feeTypes} feesEnabled={s.feesEnabled} currency={s.currency} />
        </Card>

        <Card index={3} icon={<Timer className="size-5" aria-hidden="true" />} title="Reservations">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Input
                label="Default hold (days)"
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                value={values.defaultDays}
                onChange={(event) => patch({ defaultDays: event.target.value })}
              />
              {errors.reservationDefaultDays && (
                <p role="alert" className="text-body-sm text-red-500">
                  {errors.reservationDefaultDays}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Input
                label="Longest hold (days)"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={values.maxDays}
                onChange={(event) => patch({ maxDays: event.target.value })}
              />
              {errors.reservationMaxDays && (
                <p role="alert" className="text-body-sm text-red-500">
                  {errors.reservationMaxDays}
                </p>
              )}
            </div>
          </div>

          <Select
            label="Deposit to hold a vehicle"
            options={[
              { value: "none", label: "No deposit" },
              { value: "fixed", label: "A fixed amount" },
              { value: "percent", label: "A percentage of the listed price" },
            ]}
            value={values.depositMode}
            onChange={(event) => {
              const mode =
                event.target.value === "fixed" || event.target.value === "percent"
                  ? event.target.value
                  : "none";
              patch({ depositMode: mode, depositValue: "" });
            }}
          />
          {values.depositMode === "fixed" && (
            <MoneyInput
              label="Deposit amount"
              currency={s.currency}
              value={values.depositValue}
              onChange={(value) => patch({ depositValue: value })}
              error={errors.depositValue}
            />
          )}
          {values.depositMode === "percent" && (
            <PercentField
              label="Deposit percentage"
              value={values.depositValue}
              onChange={(value) => patch({ depositValue: value })}
              error={errors.depositValue}
            />
          )}
        </Card>

        <Card
          index={4}
          icon={<ShieldCheck className="size-5" aria-hidden="true" />}
          title="Deals and payments"
        >
          <PercentField
            label="Verified deposit needed to confirm a deal"
            value={values.minDeposit}
            onChange={(value) => patch({ minDeposit: value })}
            error={errors.confirmMinDepositPercent}
            helper="A deal can only be confirmed once this share of the total is verified as paid. 0 means no deposit is required."
          />
          <Toggle
            label="A different person must verify each payment"
            description="The person who records a payment can't be the one who verifies it. Turn off only if one person does both."
            checked={values.separateVerifier}
            onChange={(value) => patch({ separateVerifier: value })}
          />
        </Card>

        <CompanyProfileCard company={company} />
        <DeliveryChecklistCard templates={templates} />

        <Card index={5} icon={<Info className="size-5" aria-hidden="true" />} title="Tax">
          <p className="text-body-sm text-text-muted">
            Tax isn&apos;t calculated yet. How VAT applies to your sales (including used vehicles) needs your
            accountant&apos;s confirmation first. Until then, deals show tax as not applied.
            {s.vatRatePercent !== null ? ` A VAT rate of ${s.vatRatePercent}% is stored but not used.` : ""}
          </p>
        </Card>

        <Card index={6} icon={<Info className="size-5" aria-hidden="true" />} title="Recent changes">
          {data.history === null ? (
            <p
              role="alert"
              className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
            >
              The history couldn&apos;t be loaded. Refresh the page to try again.
            </p>
          ) : data.history.length === 0 ? (
            <p className="text-body-sm text-text-subtle">No changes recorded yet.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {data.history.map((item) => (
                <li key={item.id} className="border-border border-l-2 pl-3">
                  {item.changes.map((change) => (
                    <p key={change} className="text-body-sm text-text-primary">
                      {change}
                    </p>
                  ))}
                  <p className="text-caption text-text-subtle">
                    {formatDateTimeFull(item.changed_at)} · {item.changed_by_name}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="bg-base/90 border-border fixed inset-x-0 bottom-0 z-30 flex items-center justify-end gap-3 border-t px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur lg:left-auto">
        <p role="status" className="text-caption text-text-subtle mr-auto">
          {dirty ? "You have unsaved changes." : "All changes saved."}
        </p>
        <Button variant="outline" disabled={!dirty || saving} onClick={() => setValues(initial)}>
          Discard
        </Button>
        <Button variant="gradient" isLoading={saving} disabled={!dirty} onClick={save}>
          Save settings
        </Button>
      </div>
    </div>
  );
}
