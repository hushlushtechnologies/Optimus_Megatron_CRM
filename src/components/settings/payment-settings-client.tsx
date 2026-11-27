"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, CreditCard, FileCheck2, ShieldCheck, Undo2 } from "lucide-react";
import { PercentField } from "@/src/components/sales/settings/percent-field";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { SettingsSaveBar } from "@/src/components/settings/settings-save-bar";
import { SettingsHistoryPanel } from "@/src/components/settings/settings-history-panel";
import { SettingsConfirmDialog } from "@/src/components/settings/settings-confirm-dialog";
import { SettingsToggle } from "@/src/components/settings/settings-toggle";
import { updatePaymentControlSettingsAction } from "@/app/admin/settings/operations/settings-actions";
import { paymentControlSettingsSchema } from "@/src/lib/validation/settings-sections";
import { minDepositChange, separateVerifierChange } from "@/src/lib/utils/settings-risk";
import type { SettingsChangePreview } from "@/src/lib/types/settings-ui";
import type { FullSalesSettings, SettingsHistoryItem } from "@/src/lib/types/sales-pricing";

/*
|--------------------------------------------------------------------------
| PAYMENTS & FINANCIAL CONTROL — PHASE 13
|--------------------------------------------------------------------------
|
| Two settings, both of them safeguards, so both go through the
| confirmation dialog with their previous value and their effect shown.
| Sprint 10: "a configuration screen must not be able to weaken financial
| safeguards without the correct permission and audit history." The
| permission is checked in the action and again by the database; the audit
| history is the trigger on sales_settings; the confirmation is here.
|
| Phase 13 lists three more things that are not on this page, and the page
| says why rather than leaving gaps:
|
|   Payment method availability
|     PaymentMethod is a fixed set in the database, not a lookup table. A
|     switch here could stop the form offering Cheque, but nothing would
|     stop a cheque being recorded through any other path, and the brief
|     is explicit that a method should only be configurable if the
|     workflow can enforce it. It cannot yet.
|
|   Refund authorisation
|     Already a permission — payments.reverse — rather than a setting.
|     Duplicating it here as a toggle would create two answers to one
|     question, and the toggle would be the one that is wrong.
|
|   Reconciliation
|     There is no bank or gateway integration. Sprint 10 forbids claiming
|     one, so the page says there is none instead of showing a dead
|     control.
*/

interface Values {
  minDeposit: string;
  separateVerifier: boolean;
}

export function PaymentSettingsClient({
  settings,
  history,
  canEdit,
}: {
  settings: FullSalesSettings;
  history: SettingsHistoryItem[] | null;
  canEdit: boolean;
}) {
  const router = useRouter();

  const initial: Values = {
    minDeposit: String(settings.confirmMinDepositPercent),
    separateVerifier: settings.paymentsRequireSeparateVerifier,
  };

  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<readonly SettingsChangePreview[] | null>(null);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const patch = (change: Partial<Values>) => setValues((previous) => ({ ...previous, ...change }));

  const payload = () => ({
    confirmMinDepositPercent: values.minDeposit,
    separateVerifier: values.separateVerifier,
  });

  /** Validate, then describe what is about to change and ask. */
  const review = () => {
    const parsed = paymentControlSettingsSchema.safeParse(payload());
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

    /*
     * Both fields on this page are safeguards, so every real change is
     * reviewed. Number() is safe here: the schema has already established
     * that the string is a percentage.
     */
    const changes = [
      minDepositChange(settings.confirmMinDepositPercent, Number(values.minDeposit)),
      separateVerifierChange(settings.paymentsRequireSeparateVerifier, values.separateVerifier),
    ].filter((change): change is SettingsChangePreview => change !== null);

    if (changes.length === 0) {
      toast.info("Nothing has changed.");
      return;
    }
    setPending(changes);
  };

  const commit = async () => {
    const parsed = paymentControlSettingsSchema.safeParse(payload());
    if (!parsed.success) {
      setPending(null);
      toast.error("Please fix the highlighted settings.");
      return;
    }

    setSaving(true);
    try {
      const result = await updatePaymentControlSettingsAction(parsed.data);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setPending(null);
      toast.success("Payment controls saved");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <SettingsSection
        title="Confirming a deal"
        icon={ShieldCheck}
        description="How much of the total has to be verified as paid before a deal can be confirmed."
        effect="Applies to deals confirmed from now on. A deal already confirmed stays confirmed."
      >
        <PercentField
          label="Verified deposit needed to confirm a deal"
          value={values.minDeposit}
          onChange={(value) => patch({ minDeposit: value })}
          error={errors.confirmMinDepositPercent}
          helper="Only payments marked Verified count toward this. A payment that has been recorded but not verified does not. 0 means a deal can be confirmed with nothing verified."
        />
      </SettingsSection>

      <SettingsSection
        title="Who may verify a payment"
        icon={Banknote}
        description="Whether recording a payment and verifying it have to be two different people."
        effect="Applies to payments verified from now on. Payments already verified are not revisited."
      >
        <SettingsToggle
          label="A different person must verify each payment"
          description="The person who records a payment can't be the one who verifies it. Turn this off only if one person genuinely does both jobs."
          checked={values.separateVerifier}
          disabled={!canEdit}
          onChange={(value) => patch({ separateVerifier: value })}
        />
      </SettingsSection>

      <SettingsSection
        title="Payment methods"
        icon={CreditCard}
        description="Cash, Card, Bank Transfer, Cheque, Finance Company and Other."
      >
        <p className="text-body-sm text-text-muted">
          These are fixed in the database rather than kept in a list you can edit. Switching one off here
          would take it out of the form while leaving every other way of recording a payment untouched, so
          the method would look disabled without being disabled. Changing the set is a database change.
        </p>
      </SettingsSection>

      <SettingsSection title="Refunds" icon={Undo2} description="Who can send money back out.">
        <p className="text-body-sm text-text-muted">
          Refund authority is a permission, not a setting:{" "}
          <span className="text-text-primary font-medium">Reverse payments</span> is what lets someone
          reverse or refund a payment. Change it where roles are managed, so there is one answer rather
          than two.
        </p>
      </SettingsSection>

      <SettingsSection
        title="Receipts and reconciliation"
        icon={FileCheck2}
        description="What appears on a receipt, and matching payments against the bank."
      >
        <p className="text-body-sm text-text-muted">
          Receipt wording comes from your company details — bank details, invoice notes and terms. Those
          are on{" "}
          <Link
            href="/admin/settings/organization/company"
            className="text-primary focus-visible:ring-primary rounded underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            Company profile
          </Link>
          .
        </p>
        <p className="text-body-sm text-text-muted">
          There is no bank or payment gateway connection, so nothing reconciles automatically. A payment is
          verified because a person checked it and said so.
        </p>
      </SettingsSection>

      <SettingsHistoryPanel items={history} emptyNote="No payment controls have been changed yet." />

      {canEdit && (
        <SettingsSaveBar
          dirty={dirty}
          saving={saving}
          onSave={review}
          saveLabel="Review and save"
          onReset={() => {
            setValues(initial);
            setErrors({});
          }}
        />
      )}

      <SettingsConfirmDialog
        isOpen={pending !== null}
        changes={pending ?? []}
        saving={saving}
        onConfirm={commit}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
