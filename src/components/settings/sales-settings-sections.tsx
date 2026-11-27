"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, FileText, Percent, Receipt, Tag, Wallet } from "lucide-react";
import { PercentField } from "@/src/components/sales/settings/percent-field";
import { FeeTypesCard } from "@/src/components/sales/settings/fee-types-card";
import { DeliveryChecklistCard } from "@/src/components/sales/settings/delivery-checklist-card";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { SettingsSaveBar } from "@/src/components/settings/settings-save-bar";
import { SettingsHistoryPanel } from "@/src/components/settings/settings-history-panel";
import { SettingsConfirmDialog } from "@/src/components/settings/settings-confirm-dialog";
import { SettingsToggle } from "@/src/components/settings/settings-toggle";
import { updateDealRuleSettingsAction } from "@/app/admin/settings/operations/settings-actions";
import { dealRuleSettingsSchema } from "@/src/lib/validation/settings-sections";
import { discountThresholdChange, feesEnabledChange } from "@/src/lib/utils/settings-risk";
import type { SettingsChangePreview } from "@/src/lib/types/settings-ui";
import type { FeeType, FullSalesSettings, SettingsHistoryItem } from "@/src/lib/types/sales-pricing";
import type { DeliveryTemplate } from "@/src/lib/types/sales-delivery";

/*
|--------------------------------------------------------------------------
| SALES & PRICING — PHASE 12
|--------------------------------------------------------------------------
|
| Phase 12 asks for the Sales settings organised into Pricing Rules,
| Discount Approval, Fee Types, Sales Documents and Delivery Checklists.
|
| What this page LOST compared with the combined page it replaces, and
| where each thing went:
|
|   Reservations      -> /admin/settings/operations/reservations
|   Separate verifier -> /admin/settings/operations/payments
|   Deposit to confirm-> /admin/settings/operations/payments
|   Company details   -> /admin/settings/organization/company
|
| The company details are the interesting one. They were on the Sales
| page because documents need them, and a document is a sales artefact.
| But they are company-wide — the same legal name appears on an enquiry
| PDF — so a second copy of that form here would be a second way to write
| the same row, which Sprint 10 forbids outright. The Documents section
| below links to the one form instead of carrying another.
|
| Fees and delivery checklists save themselves: FeeTypesCard and
| DeliveryChecklistCard each own their own rows and their own actions,
| unchanged from Sprint 8. Only the discount threshold and the fees
| on/off switch belong to this page's save bar.
*/

interface Values {
  discount: string;
  feesEnabled: boolean;
}

export function SalesSettingsSections({
  settings,
  feeTypes,
  approverRoles,
  templates,
  history,
  canEdit,
}: {
  settings: FullSalesSettings;
  /** null when the fee types could not be read — not the same as having none. */
  feeTypes: FeeType[] | null;
  approverRoles: string[] | null;
  templates: DeliveryTemplate[] | null;
  history: SettingsHistoryItem[] | null;
  canEdit: boolean;
}) {
  const router = useRouter();

  const initial: Values = {
    discount: String(settings.discountAutoApprovePercent),
    feesEnabled: settings.feesEnabled,
  };

  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<readonly SettingsChangePreview[] | null>(null);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const patch = (change: Partial<Values>) => setValues((previous) => ({ ...previous, ...change }));

  const payload = () => ({
    discountAutoApprovePercent: values.discount,
    feesEnabled: values.feesEnabled,
  });

  const review = () => {
    const parsed = dealRuleSettingsSchema.safeParse(payload());
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

    const changes = [
      discountThresholdChange(settings.discountAutoApprovePercent, Number(values.discount)),
      feesEnabledChange(settings.feesEnabled, values.feesEnabled),
    ].filter((change): change is SettingsChangePreview => change !== null);

    if (changes.length === 0) {
      toast.info("Nothing has changed.");
      return;
    }
    setPending(changes);
  };

  const commit = async () => {
    const parsed = dealRuleSettingsSchema.safeParse(payload());
    if (!parsed.success) {
      setPending(null);
      toast.error("Please fix the highlighted settings.");
      return;
    }

    setSaving(true);
    try {
      const result = await updateDealRuleSettingsAction(parsed.data);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setPending(null);
      toast.success("Sales settings saved");
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
        title="Discount approval"
        icon={Tag}
        description="How much can come off a price before somebody has to approve it."
        effect="Applies to deals priced from now on. A discount already approved stays approved."
      >
        <PercentField
          label="Discount that needs no approval"
          value={values.discount}
          disabled={!canEdit}
          onChange={(value) => patch({ discount: value })}
          error={errors.discountAutoApprovePercent}
          helper="A discount up to this percentage of the proposed price goes through on its own. Above it, somebody with approval rights has to approve it before the deal can be confirmed. 0 means every discount needs approval."
        />
        <p className="border-border bg-card-hover/40 text-body-sm text-text-primary rounded-md border px-3 py-2.5">
          {approverRoles === null
            ? "Who can approve couldn't be loaded, so this list is not reliable right now."
            : approverRoles.length === 0
              ? "No role can approve discounts yet except Super Admin. Give a role the Approve discounts permission where roles are managed."
              : `Who can approve: ${approverRoles.join(", ")}, and Super Admin. This comes from the Approve discounts permission, not from this page.`}
        </p>
      </SettingsSection>

      <SettingsSection
        title="Fees"
        icon={Wallet}
        description="Whether fees apply at all, and the fees you can add to a deal."
        effect="Turning fees off stops them being offered on new deals. Fees already on a confirmed deal are never changed."
      >
        <SettingsToggle
          label="Charge fees on deals"
          description="When off, no fees are offered or charged on any new deal. Fees already saved on a confirmed deal stay as they are."
          checked={values.feesEnabled}
          disabled={!canEdit}
          onChange={(value) => patch({ feesEnabled: value })}
        />
        {/*
         * Fees save themselves, row by row, through their own action. A null
         * list is a failed read, which must not render as "no fees yet" —
         * that would read as though the fees had been deleted.
         */}
        {feeTypes === null ? (
          <p
            role="alert"
            className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
          >
            Your fee types couldn&apos;t be loaded, so they aren&apos;t shown. They have not been changed.
            Refresh the page to try again.
          </p>
        ) : (
          <FeeTypesCard
            feeTypes={feeTypes}
            feesEnabled={settings.feesEnabled}
            currency={settings.currency}
          />
        )}
      </SettingsSection>

      <SettingsSection
        title="Tax"
        icon={Percent}
        description="How VAT applies to a sale."
      >
        <p className="text-body-sm text-text-muted">
          Tax isn&apos;t calculated anywhere yet, so there is nothing to configure. How VAT applies to your
          sales — used vehicles especially — needs your accountant&apos;s confirmation before any of it goes
          into a total. Until then deals show tax as not applied.
          {settings.vatRatePercent !== null
            ? ` A rate of ${settings.vatRatePercent}% is stored in the database and is not used by anything.`
            : ""}
        </p>
      </SettingsSection>

      <SettingsSection
        title="Sales documents"
        icon={FileText}
        description="What appears on a quotation, invoice or receipt."
      >
        <p className="text-body-sm text-text-muted">
          Document wording and company details — legal name, address, tax registration number, bank details,
          invoice notes, quotation terms and how long a quotation stays valid — are company-wide, because the
          same details appear on documents from other modules. They live on{" "}
          <Link
            href="/admin/settings/organization/company"
            className="text-primary focus-visible:ring-primary rounded underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            Company profile
          </Link>
          , as one form rather than two.
        </p>
        <p className="text-body-sm text-text-muted">
          A document already issued keeps the details it was issued with. Changing them here changes
          documents issued from now on.
        </p>
      </SettingsSection>

      <SettingsSection
        title="Delivery checklists"
        icon={ClipboardList}
        description="The checks that have to be done before a vehicle is handed over."
        effect="A delivery already in progress keeps the checklist it started with."
      >
        {/* Checklist items save themselves through their own action. */}
        <DeliveryChecklistCard templates={templates} />
      </SettingsSection>

      <SettingsSection
        title="Reservations and payments"
        icon={Receipt}
        description="Settings that used to be on this page."
      >
        <p className="text-body-sm text-text-muted">
          Hold lengths and the deposit that reserves a vehicle are on{" "}
          <Link
            href="/admin/settings/operations/reservations"
            className="text-primary focus-visible:ring-primary rounded underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            Reservations
          </Link>
          . The deposit needed to confirm a deal and who may verify a payment are on{" "}
          <Link
            href="/admin/settings/operations/payments"
            className="text-primary focus-visible:ring-primary rounded underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            Payments
          </Link>
          .
        </p>
      </SettingsSection>

      <SettingsHistoryPanel items={history} emptyNote="No sales settings have been changed yet." />

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
