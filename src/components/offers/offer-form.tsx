"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Save, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";
import { FormSection, ReviewLine } from "@/src/components/shared/form-section";

import { DateRangeControl, dubaiLocalNow } from "@/src/components/offers/date-range-control";
import { DiscountPreview } from "@/src/components/offers/discount-preview";
import { OfferTargetPicker } from "@/src/components/offers/offer-target-picker";
import {
  OfferEligibilityBuilder,
  type DraftEligibilityRule,
} from "@/src/components/offers/offer-eligibility-builder";

import { upsertPromotionAction } from "@/app/admin/offers/actions";
import type { TargetSelection } from "@/src/lib/supabase/offer-queries";
import { CUSTOMER_LIFECYCLE_STATUSES } from "@/src/lib/types/customer";
import {
  PROMOTION_TYPE_LABELS,
  PROMOTION_TYPES,
  STACKING_POLICIES,
  STACKING_POLICY_LABELS,
  type PromotionType,
} from "@/src/lib/types/offers";
import { previewDiscountFils } from "@/src/lib/utils/offer-form-preview";

/*
|--------------------------------------------------------------------------
| THE CAMPAIGN FORM
|--------------------------------------------------------------------------
|
| Seven sections on one scrollable page, not a wizard. Same reasoning as the
| enquiry form: a wizard hides what you already typed behind a button, which
| is exactly what you want to see while deciding what to type next.
|
| Two ways out of it. "Save as draft" writes it and nothing goes live.
| "Save and publish" asks for confirmation and needs offers.publish — and if
| the person doesn't hold that key, the server saves it as a draft and says
| so rather than failing. Their work is not lost because of a permission.
*/

export interface OfferFormLookups {
  brands: { id: string; name: string }[];
  models: { id: string; name: string; brand_id: string }[];
  collections: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  customerTags: { id: string; name: string }[];
}

export interface OfferFormInitial {
  id?: string;
  name: string;
  reference: string;
  description: string;
  promotionType: PromotionType;
  discountType: "percentage" | "fixed";
  discountValue: string;
  startsAt: string;
  endsAt: string;
  priority: string;
  maxRedemptions: string;
  maxPerCustomer: string;
  minPurchase: string;
  maxDiscount: string;
  stackingPolicy: (typeof STACKING_POLICIES)[number];
  pointsMultiplier: string;
  internalNotes: string;
  targets: TargetSelection[];
  eligibilityRules: DraftEligibilityRule[];
}

export const BLANK_OFFER: OfferFormInitial = {
  name: "",
  reference: "",
  description: "",
  promotionType: "general",
  discountType: "percentage",
  discountValue: "",
  startsAt: "",
  endsAt: "",
  priority: "0",
  maxRedemptions: "",
  maxPerCustomer: "",
  minPurchase: "",
  maxDiscount: "",
  stackingPolicy: "none",
  pointsMultiplier: "",
  internalNotes: "",
  targets: [],
  eligibilityRules: [],
};

interface OfferFormProps {
  initial?: OfferFormInitial;
  lookups: OfferFormLookups;
  canPublish: boolean;
}

export function OfferForm({ initial = BLANK_OFFER, lookups, canPublish }: OfferFormProps) {
  const router = useRouter();

  const [form, setForm] = useState<OfferFormInitial>(initial);
  const [saving, setSaving] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /* An example price, so the preview shows what the discount actually does. */
  const [examplePrice, setExamplePrice] = useState("250000");

  const set = <K extends keyof OfferFormInitial>(key: K, value: OfferFormInitial[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  /* =======================================================
     UNSAVED CHANGES
  ======================================================= */

  /*
   * The form as it was when it loaded, for the unsaved-changes check.
   *
   * State rather than a ref: it is read during render to work out `dirty`,
   * and react-hooks/refs forbids reading a ref there — correctly, since a
   * ref change would not re-render and the "Unsaved changes" line would go
   * stale.
   */
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const dirty = JSON.stringify(form) !== baseline;

  useEffect(() => {
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      /* Browsers show their own wording; the value only has to be set. */
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* =======================================================
     DERIVED
  ======================================================= */

  const datesBackwards = Boolean(form.startsAt && form.endsAt && form.endsAt <= form.startsAt);

  const preview = useMemo(
    () =>
      previewDiscountFils({
        priceText: examplePrice,
        discountType: form.discountType,
        discountValue: form.discountValue,
        maxDiscountText: form.maxDiscount,
        minPurchaseText: form.minPurchase,
      }),
    [examplePrice, form.discountType, form.discountValue, form.maxDiscount, form.minPurchase],
  );

  /* Section ticks: answered well enough to move on, not "valid". */
  const basicsDone = form.name.trim().length >= 2;
  const discountDone = form.discountValue.trim() !== "" && Number(form.discountValue) > 0;
  const scheduleDone = form.startsAt !== "" || form.endsAt !== "";

  const nameFor = useCallback(
    (kind: TargetSelection["targetKind"], id: string): string | undefined => {
      const list =
        kind === "brand"
          ? lookups.brands
          : kind === "model"
            ? lookups.models
            : kind === "collection"
              ? lookups.collections
              : kind === "location"
                ? lookups.locations
                : [];

      return list.find((item) => item.id === id)?.name;
    },
    [lookups],
  );

  /*
   * The targeting in words, for the review.
   *
   * Names, not a count: "3 targets" tells somebody checking their work
   * nothing, and the whole point of a review step is to notice a mistake.
   * Long lists are trimmed, because a review line is one line.
   */
  const targetSummary = useMemo(() => {
    if (form.targets.length === 0) return "All stock";

    const named = form.targets.map(
      (target) => nameFor(target.targetKind, target.targetId) ?? "a specific vehicle",
    );

    if (named.length <= 3) return named.join(", ");

    return `${named.slice(0, 3).join(", ")} and ${named.length - 3} more`;
  }, [form.targets, nameFor]);

  /* =======================================================
     SUBMIT

     One payload builder for both buttons, so "save as draft" and "save and
     publish" cannot drift into sending different shapes. The only
     difference between them is `status`.
  ======================================================= */

  const payloadFor = (status: "draft" | "active") => ({
    ...(form.id ? { id: form.id } : {}),
    name: form.name,
    reference: form.reference,
    description: form.description,
    promotionType: form.promotionType,
    discountType: form.discountType,
    discountValue: form.discountValue,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    priority: form.priority,
    maxRedemptions: form.maxRedemptions,
    maxPerCustomer: form.maxPerCustomer,
    minPurchase: form.minPurchase,
    maxDiscount: form.maxDiscount,
    stackingPolicy: form.stackingPolicy,
    pointsMultiplier: form.pointsMultiplier,
    internalNotes: form.internalNotes,
    bannerUrl: "",
    status,
    targets: form.targets,
    eligibilityRules: form.eligibilityRules,
  });

  const submit = async (status: "draft" | "active") => {
    if (datesBackwards) {
      toast.error("The end date is before the start date.");
      return;
    }

    setSaving(true);
    setFieldErrors({});

    try {
      const result = await upsertPromotionAction(payloadFor(status));

      if (result.error) {
        toast.error(result.error);
        return;
      }

      /*
       * The server downgrades a publish to a draft when the person lacks
       * offers.publish, and says so. Reporting that honestly matters more
       * than a tidy success message: otherwise somebody walks away thinking
       * a campaign is live when it is not.
       */
      const published = status === "active" && canPublish;

      toast.success(
        published
          ? `"${form.name}" is live.`
          : status === "active"
            ? `"${form.name}" was saved as a draft — publishing needs permission you don't have.`
            : `"${form.name}" saved as a draft.`,
      );

      setBaseline(JSON.stringify(form));

      router.push(result.id ? `/admin/offers/${result.id}` : "/admin/offers?view=all");
    } catch {
      toast.error("Something went wrong. Nothing was saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="flex flex-col gap-4">
      {/* ===================================================
          1. BASIC DETAILS
      =================================================== */}

      <FormSection
        step={1}
        title="Basic details"
        description="What this campaign is, and what it's called."
        done={basicsDone}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Campaign name"
            placeholder="Year End Clearance"
            value={form.name}
            maxLength={120}
            required
            error={fieldErrors.name}
            onChange={(event) => set("name", event.target.value)}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Reference"
              placeholder="YEAREND26"
              value={form.reference}
              maxLength={40}
              error={fieldErrors.reference}
              onChange={(event) => set("reference", event.target.value.toUpperCase())}
              hint="Your own short code. Letters, numbers and hyphens. Not a coupon customers type."
            />

            <Select
              label="Type"
              value={form.promotionType}
              onChange={(event) => set("promotionType", event.target.value as PromotionType)}
              options={PROMOTION_TYPES.map((type) => ({
                value: type,
                label: PROMOTION_TYPE_LABELS[type],
              }))}
            />
          </div>

          <Textarea
            label="Description"
            placeholder="What a customer would be told about this offer."
            value={form.description}
            maxLength={2000}
            rows={3}
            onChange={(event) => set("description", event.target.value)}
          />
        </div>
      </FormSection>

      {/* ===================================================
          2. DISCOUNT
      =================================================== */}

      <FormSection
        step={2}
        title="Discount"
        description="What comes off the price, and the limits around it."
        done={discountDone}
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Discount type"
              value={form.discountType}
              onChange={(event) => set("discountType", event.target.value as "percentage" | "fixed")}
              options={[
                { value: "percentage", label: "A percentage off" },
                { value: "fixed", label: "A fixed amount off" },
              ]}
            />

            <Input
              label={form.discountType === "percentage" ? "Percentage off" : "Amount off (AED)"}
              type="number"
              min={0}
              max={form.discountType === "percentage" ? 100 : undefined}
              step={form.discountType === "percentage" ? "0.01" : "0.01"}
              value={form.discountValue}
              required
              error={fieldErrors.discountValue}
              onChange={(event) => set("discountValue", event.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Minimum price (AED)"
              type="number"
              min={0}
              step="0.01"
              value={form.minPurchase}
              onChange={(event) => set("minPurchase", event.target.value)}
              hint="Leave blank for no minimum."
            />

            <Input
              label="Most it can take off (AED)"
              type="number"
              min={0}
              step="0.01"
              value={form.maxDiscount}
              onChange={(event) => set("maxDiscount", event.target.value)}
              hint="A cap. Useful on a percentage so an expensive car doesn't lose too much."
            />
          </div>

          <Select
            label="Can it combine with other discounts?"
            value={form.stackingPolicy}
            onChange={(event) =>
              set("stackingPolicy", event.target.value as (typeof STACKING_POLICIES)[number])
            }
            options={STACKING_POLICIES.map((policy) => ({
              value: policy,
              label: STACKING_POLICY_LABELS[policy],
            }))}
            hint="On its own is the safe default. Combining discounts is how a car sells below cost."
          />

          {/* ---- Live preview ---- */}

          <div className="border-border bg-card-hover/40 flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Eye className="text-primary size-4 shrink-0" aria-hidden="true" />
              <p className="text-body-sm text-text-primary font-medium">What this does to a price</p>
            </div>

            <Input
              label="Try it against a price of (AED)"
              type="number"
              min={0}
              step="0.01"
              value={examplePrice}
              onChange={(event) => setExamplePrice(event.target.value)}
            />

            {preview.belowMinimum ? (
              <p className="text-body-sm text-text-muted">
                This price is below the minimum you set, so the campaign wouldn&apos;t apply to it.
              </p>
            ) : preview.originalFils === null ? (
              <p className="text-body-sm text-text-subtle">Enter a price above to see the effect.</p>
            ) : (
              <>
                <DiscountPreview
                  originalFils={preview.originalFils}
                  discountFils={preview.discountFils}
                  sourceLabel={form.name.trim() || "This campaign"}
                />

                {preview.cappedByMax && (
                  <p className="text-body-sm text-text-muted">
                    Capped by the maximum you set — without it the discount would have been larger.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </FormSection>

      {/* ===================================================
          3. WHO QUALIFIES
      =================================================== */}

      <FormSection
        step={3}
        title="Who qualifies"
        description="Leave empty to open it to every customer."
        optional
      >
        <OfferEligibilityBuilder
          value={form.eligibilityRules}
          onChange={(next) => set("eligibilityRules", next)}
          lifecycleStatuses={[...CUSTOMER_LIFECYCLE_STATUSES]}
          customerTags={lookups.customerTags}
          brands={lookups.brands}
          disabled={saving}
        />
      </FormSection>

      {/* ===================================================
          4. WHICH VEHICLES
      =================================================== */}

      <FormSection step={4} title="Which vehicles" description="Leave empty to cover all stock." optional>
        <OfferTargetPicker
          value={form.targets}
          onChange={(next) => set("targets", next)}
          brands={lookups.brands}
          models={lookups.models}
          collections={lookups.collections}
          locations={lookups.locations}
          disabled={saving}
        />
      </FormSection>

      {/* ===================================================
          5. WHEN IT RUNS
      =================================================== */}

      <FormSection
        step={5}
        title="When it runs"
        description="Dubai time. Leave both empty to run until you pause it."
        done={scheduleDone}
        optional
      >
        <div className="flex flex-col gap-3">
          <DateRangeControl
            startsAt={form.startsAt}
            endsAt={form.endsAt}
            onStartChange={(value) => set("startsAt", value)}
            onEndChange={(value) => set("endsAt", value)}
            error={datesBackwards ? "This is before the start." : undefined}
            disabled={saving}
          />

          <p className="text-text-subtle text-xs">
            A start in the future means the campaign waits — it won&apos;t appear in Inventory until then, and
            it doesn&apos;t need anyone to be logged in for that to happen.
          </p>

          {form.startsAt === "" && form.endsAt === "" && (
            <p className="text-body-sm text-text-muted">
              No dates: it applies from the moment it&apos;s live until somebody pauses it.
            </p>
          )}

          {form.startsAt !== "" && form.startsAt < dubaiLocalNow() && (
            <p className="text-body-sm text-text-muted">
              That start is in the past, so it applies straight away once published.
            </p>
          )}
        </div>
      </FormSection>

      {/* ===================================================
          6. LIMITS
      =================================================== */}

      <FormSection step={6} title="Usage limits" description="How many times it can be used." optional>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Total uses"
            type="number"
            min={1}
            step="1"
            value={form.maxRedemptions}
            onChange={(event) => set("maxRedemptions", event.target.value)}
            hint="Blank = unlimited."
          />

          <Input
            label="Uses per customer"
            type="number"
            min={1}
            step="1"
            value={form.maxPerCustomer}
            onChange={(event) => set("maxPerCustomer", event.target.value)}
            hint="Blank = unlimited."
          />

          <Input
            label="Priority"
            type="number"
            min={0}
            max={1000}
            step="1"
            value={form.priority}
            onChange={(event) => set("priority", event.target.value)}
            hint="Higher wins when two campaigns both fit."
          />
        </div>

        {/*
          The points multiplier lives here because the database and the
          schema both carry it, and a field the form never collects is a
          capability nobody can reach. It does nothing until the loyalty
          program is switched on, which the hint says rather than leaving
          somebody to wonder why nothing happened.
        */}
        <div className="mt-4 max-w-xs">
          <Input
            label="Points multiplier"
            type="number"
            min={0}
            max={10}
            step="0.001"
            value={form.pointsMultiplier}
            onChange={(event) => set("pointsMultiplier", event.target.value)}
            hint="2 means double points on these vehicles. Blank = no effect on points."
          />

          <p className="text-text-subtle mt-1.5 text-xs">
            Loyalty is switched off until it&apos;s configured, so this has no effect yet.
          </p>
        </div>
      </FormSection>

      {/* ===================================================
          7. REVIEW
      =================================================== */}

      <FormSection step={7} title="Review" description="Worth a glance before it goes anywhere.">
        <div className="flex flex-col gap-4">
          <div className="divide-border divide-y">
            <ReviewLine label="Name" value={form.name} />
            <ReviewLine label="Reference" value={form.reference} />
            <ReviewLine label="Type" value={PROMOTION_TYPE_LABELS[form.promotionType]} />
            <ReviewLine
              label="Discount"
              value={
                form.discountValue
                  ? form.discountType === "percentage"
                    ? `${form.discountValue}% off`
                    : `AED ${form.discountValue} off`
                  : null
              }
            />
            <ReviewLine
              label="Minimum price"
              value={form.minPurchase ? `AED ${form.minPurchase}` : "No minimum"}
            />
            <ReviewLine
              label="Discount cap"
              value={form.maxDiscount ? `AED ${form.maxDiscount}` : "No cap"}
            />
            <ReviewLine label="Combining" value={STACKING_POLICY_LABELS[form.stackingPolicy]} />
            <ReviewLine label="Vehicles" value={targetSummary} />
            <ReviewLine
              label="Customers"
              value={
                form.eligibilityRules.length === 0
                  ? "Everyone"
                  : `${form.eligibilityRules.length} ${form.eligibilityRules.length === 1 ? "rule" : "rules"}`
              }
            />
            <ReviewLine
              label="Runs"
              value={
                form.startsAt || form.endsAt
                  ? `${form.startsAt || "immediately"} to ${form.endsAt || "until paused"}`
                  : "Until paused"
              }
            />
            <ReviewLine label="Total uses" value={form.maxRedemptions ? form.maxRedemptions : "Unlimited"} />
          </div>

          <Textarea
            label="Internal notes"
            placeholder="Anything the team should know. Customers never see this."
            value={form.internalNotes}
            maxLength={2000}
            rows={2}
            onChange={(event) => set("internalNotes", event.target.value)}
          />

          {!canPublish && (
            <p
              role="status"
              className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
              You can save this as a draft. Publishing needs the publish permission, so somebody with it will
              need to switch it on.
            </p>
          )}
        </div>
      </FormSection>

      {/* ===================================================
          ACTIONS
      =================================================== */}

      <div className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-body-sm text-text-muted">{dirty ? "Unsaved changes." : "Nothing to save."}</div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => (dirty ? setConfirmLeave(true) : router.push("/admin/offers?view=all"))}
          >
            Cancel
          </Button>

          <Button
            variant="outline"
            disabled={saving || !basicsDone}
            leftIcon={<Save className="size-4" aria-hidden="true" />}
            onClick={() => void submit("draft")}
          >
            Save as draft
          </Button>

          {canPublish && (
            <Button
              variant="gradient"
              disabled={saving || !basicsDone || !discountDone}
              leftIcon={<Send className="size-4" aria-hidden="true" />}
              onClick={() => setConfirmPublish(true)}
            >
              Save and publish
            </Button>
          )}
        </div>
      </div>

      {/* ===================================================
          DIALOGS
      =================================================== */}

      <ConfirmDialog
        isOpen={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        onConfirm={() => {
          setConfirmPublish(false);
          void submit("active");
        }}
        title="Publish this campaign?"
        description={
          form.targets.length === 0
            ? "It will start applying to every eligible vehicle in stock, straight away unless you set a future start date. You can pause it at any time."
            : "It will start applying to the vehicles you targeted, straight away unless you set a future start date. You can pause it at any time."
        }
        confirmLabel="Publish"
        isLoading={saving}
      />

      <ConfirmDialog
        isOpen={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          router.push("/admin/offers?view=all");
        }}
        title="Leave without saving?"
        description="This campaign hasn't been saved. Leaving now loses what you've entered."
        confirmLabel="Leave"
        cancelLabel="Keep editing"
        variant="danger"
      />
    </div>
  );
}
