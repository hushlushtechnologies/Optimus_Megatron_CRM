"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArrowLeft, Copy, Pause, Pencil, Play } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Tab, TabPanel, Tabs, TabsList } from "@/src/components/ui/tabs";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";
import { ReviewLine } from "@/src/components/shared/form-section";

import { CampaignTimeline } from "@/src/components/offers/campaign-timeline";
import { DiscountBadge } from "@/src/components/offers/discount-badge";
import { EligibilitySummary } from "@/src/components/offers/eligibility-summary";
import { OfferStatusBadge } from "@/src/components/offers/offer-status-badge";
import { OfferTypeBadge } from "@/src/components/offers/offer-type-badge";
import { OfferAssignmentsTab } from "@/src/components/offers/detail/offer-assignments-tab";
import { OfferCodesTab } from "@/src/components/offers/detail/offer-codes-tab";
import { OfferAuditTab, OfferHistoryTab } from "@/src/components/offers/detail/offer-history-tab";
import { OfferRedemptionsTab } from "@/src/components/offers/detail/offer-redemptions-tab";

import {
  archiveOfferAction,
  duplicateOfferAction,
  setOfferStatusAction,
} from "@/app/admin/offers/actions";
import type { OfferDetail } from "@/src/lib/types/offer-detail";
import { PROMOTION_TYPE_LABELS, STACKING_POLICY_LABELS } from "@/src/lib/types/offers";
import { formatFils } from "@/src/lib/utils/sales-money";
import { formatDateTimeFull, formatDay } from "@/src/lib/utils/test-drive-format";
import type { OfferPermissions } from "@/src/lib/utils/offer-permissions";

/*
|--------------------------------------------------------------------------
| THE CAMPAIGN DETAIL PAGE (Phase 13)
|--------------------------------------------------------------------------
|
| Eight sections, as the plan asks: Overview, Discount Rules, Audience,
| Eligible Vehicles, Schedule, Redemptions, History, Audit.
|
| What this page must not do is let an edit rewrite history. It doesn't:
| each redemption carries its own snapshot of the campaign's terms, the
| Redemptions tab shows that snapshot, and it says so plainly when the
| campaign has been edited since. The audit tab shows every edit.
*/

interface OfferDetailClientProps {
  detail: OfferDetail;
  permissions: OfferPermissions;
}

export function OfferDetailClient({ detail, permissions }: OfferDetailClientProps) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const archived = detail.archivedAt !== null;

  const run = async (work: () => Promise<{ error: string | null }>, success: string) => {
    setBusy(true);

    try {
      const result = await work();

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(success);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    setBusy(true);

    try {
      const result = await duplicateOfferAction({ id: detail.id });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`Copied as a draft. Redemptions and codes were not copied.`);

      if (result.id) router.push(`/admin/offers/${result.id}/edit`);
      else router.refresh();
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ===================================================
          HEADER
      =================================================== */}

      <div className="flex flex-col gap-3">
        <Link
          href="/admin/offers?view=all"
          className="text-body-sm text-text-muted hover:text-text-primary inline-flex w-fit items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All campaigns
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h2 text-text-primary">{detail.name}</h1>
              <OfferStatusBadge status={detail.status} />
              {archived && <Badge status="neutral">Archived</Badge>}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <OfferTypeBadge type={detail.promotionType} />

              <DiscountBadge
                discountType={detail.discountType}
                discountValue={detail.discountValue}
              />

              {detail.reference && (
                <span className="text-body-sm text-text-muted font-mono">{detail.reference}</span>
              )}
            </div>

            {detail.description && (
              <p className="text-body-sm text-text-muted mt-2 max-w-2xl">{detail.description}</p>
            )}
          </div>

          {/* ---- Actions ---- */}

          <div className="flex flex-wrap items-center gap-2">
            {permissions.manage && !archived && (
              <Link href={`/admin/offers/${detail.id}/edit`}>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Pencil className="size-4" aria-hidden="true" />}
                >
                  Edit
                </Button>
              </Link>
            )}

            {permissions.manage && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                leftIcon={<Copy className="size-4" aria-hidden="true" />}
                onClick={() => void duplicate()}
              >
                Duplicate
              </Button>
            )}

            {permissions.publish && detail.status === "active" && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                leftIcon={<Pause className="size-4" aria-hidden="true" />}
                onClick={() => setPausing(true)}
              >
                Pause
              </Button>
            )}

            {permissions.publish && detail.status === "paused" && (
              <Button
                variant="gradient"
                size="sm"
                disabled={busy}
                leftIcon={<Play className="size-4" aria-hidden="true" />}
                onClick={() =>
                  void run(
                    () => setOfferStatusAction({ id: detail.id, status: "active", reason: "" }),
                    "Running again.",
                  )
                }
              >
                Resume
              </Button>
            )}

            {permissions.publish && !archived && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                leftIcon={<Archive className="size-4" aria-hidden="true" />}
                onClick={() => setArchiving(true)}
              >
                Archive
              </Button>
            )}

            {permissions.publish && archived && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => archiveOfferAction({ id: detail.id, archived: false }),
                    "Restored from the archive, as a draft.",
                  )
                }
              >
                Restore
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================
          TABS
      =================================================== */}

      <Tabs defaultTab="overview">
        <TabsList>
          <Tab id="overview">Overview</Tab>
          <Tab id="discount">Discount Rules</Tab>
          <Tab id="audience">Audience</Tab>
          <Tab id="vehicles">Eligible Vehicles</Tab>
          <Tab id="schedule">Schedule</Tab>
          <Tab id="redemptions">
            Redemptions
            {detail.totals.appliedCount > 0 && (
              <span className="bg-primary/10 text-primary ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                {detail.totals.appliedCount}
              </span>
            )}
          </Tab>
          <Tab id="history">History</Tab>
          <Tab id="audit">Audit</Tab>
        </TabsList>

        {/* ---- Overview ---- */}

        <TabPanel id="overview">
          <div className="flex flex-col gap-4">
            <div className="surface-card p-5">
              <CampaignTimeline
                startsAt={detail.startsAt}
                endsAt={detail.endsAt}
                status={detail.status}
              />
            </div>

            <div className="surface-card p-5">
              <div className="divide-border divide-y">
                <ReviewLine label="Type" value={PROMOTION_TYPE_LABELS[detail.promotionType]} />
                <ReviewLine
                  label="Discount"
                  value={
                    detail.discountType === "percentage"
                      ? `${detail.discountValue}% off`
                      : `AED ${detail.discountValue.toLocaleString()} off`
                  }
                />
                <ReviewLine label="Combining" value={STACKING_POLICY_LABELS[detail.stackingPolicy]} />
                <ReviewLine label="Priority" value={String(detail.priority)} />
                <ReviewLine
                  label="Times used"
                  value={
                    detail.maxRedemptions === null
                      ? `${detail.redemptionCount.toLocaleString()} (no limit)`
                      : `${detail.redemptionCount.toLocaleString()} of ${detail.maxRedemptions.toLocaleString()}`
                  }
                />
                <ReviewLine
                  label="In Inventory's dropdown"
                  value={detail.isActive ? "Yes — it applies to new deals now" : "No"}
                />
                <ReviewLine
                  label="Created"
                  value={`${formatDay(detail.createdAt)}${detail.createdByName ? ` by ${detail.createdByName}` : ""}`}
                />
                {archived && (
                  <ReviewLine
                    label="Archived"
                    value={detail.archivedAt ? formatDateTimeFull(detail.archivedAt) : null}
                  />
                )}
              </div>
            </div>

            {detail.internalNotes && (
              <div className="surface-card p-5">
                <p className="text-text-subtle mb-2 text-xs font-medium tracking-wide uppercase">
                  Internal notes
                </p>
                <p className="text-body-sm text-text-primary whitespace-pre-wrap">
                  {detail.internalNotes}
                </p>
              </div>
            )}
          </div>
        </TabPanel>

        {/* ---- Discount rules ---- */}

        <TabPanel id="discount">
          <div className="surface-card p-5">
            <div className="divide-border divide-y">
              <ReviewLine
                label="Discount type"
                value={detail.discountType === "percentage" ? "A percentage off" : "A fixed amount off"}
              />
              <ReviewLine
                label="Amount"
                value={
                  detail.discountType === "percentage"
                    ? `${detail.discountValue}%`
                    : `AED ${detail.discountValue.toLocaleString()}`
                }
              />
              <ReviewLine
                label="Minimum price"
                value={
                  detail.minPurchaseFils
                    ? formatFils(BigInt(detail.minPurchaseFils))
                    : "No minimum"
                }
              />
              <ReviewLine
                label="Discount cap"
                value={
                  detail.maxDiscountFils ? formatFils(BigInt(detail.maxDiscountFils)) : "No cap"
                }
              />
              <ReviewLine label="Combining" value={STACKING_POLICY_LABELS[detail.stackingPolicy]} />
              <ReviewLine
                label="Points multiplier"
                value={
                  detail.pointsMultiplier === null
                    ? "No effect on points"
                    : `${detail.pointsMultiplier}× (loyalty must be switched on)`
                }
              />
              <ReviewLine
                label="Total uses allowed"
                value={detail.maxRedemptions === null ? "Unlimited" : String(detail.maxRedemptions)}
              />
              <ReviewLine
                label="Uses per customer"
                value={detail.maxPerCustomer === null ? "Unlimited" : String(detail.maxPerCustomer)}
              />
            </div>
          </div>
        </TabPanel>

        {/* ---- Audience ---- */}

        <TabPanel id="audience">
          <div className="flex flex-col gap-5">
            <div className="surface-card p-5">
              <p className="text-text-subtle mb-3 text-xs font-medium tracking-wide uppercase">
                Who qualifies
              </p>

              <EligibilitySummary
                targets={[]}
                rules={detail.eligibilityRules.map((rule) => ({
                  id: rule.id,
                  ruleKind: rule.ruleKind as never,
                  operator: rule.operator as never,
                  value: rule.value,
                }))}
              />
            </div>

            <div>
              <p className="text-text-subtle mb-3 text-xs font-medium tracking-wide uppercase">
                Private offers
              </p>

              <OfferAssignmentsTab detail={detail} canAssign={permissions.assign} />
            </div>

            <div>
              <p className="text-text-subtle mb-3 text-xs font-medium tracking-wide uppercase">
                Promotional codes
              </p>

              <OfferCodesTab detail={detail} canManage={permissions.manage} />
            </div>
          </div>
        </TabPanel>

        {/* ---- Vehicles ---- */}

        <TabPanel id="vehicles">
          <div className="surface-card p-5">
            {detail.targets.length === 0 ? (
              <div>
                <p className="text-body text-text-primary">Every eligible vehicle in stock.</p>
                <p className="text-body-sm text-text-muted mt-1">
                  No targeting was set, so this campaign applies across the board — including
                  vehicles that arrive after it was created.
                </p>
              </div>
            ) : (
              <>
                <p className="text-body-sm text-text-muted mb-3">
                  A vehicle qualifies if it matches any one of these.
                </p>

                <EligibilitySummary
                  targets={detail.targets.map((target) => ({
                    id: target.id,
                    targetKind: target.targetKind,
                    targetId: target.targetId,
                  }))}
                  rules={[]}
                  nameFor={(_kind, id) =>
                    detail.targets.find((target) => target.targetId === id)?.name ?? undefined
                  }
                />
              </>
            )}
          </div>
        </TabPanel>

        {/* ---- Schedule ---- */}

        <TabPanel id="schedule">
          <div className="flex flex-col gap-4">
            <div className="surface-card p-5">
              <CampaignTimeline
                startsAt={detail.startsAt}
                endsAt={detail.endsAt}
                status={detail.status}
              />
            </div>

            <div className="surface-card p-5">
              <div className="divide-border divide-y">
                <ReviewLine
                  label="Starts"
                  value={
                    detail.startsAt
                      ? formatDateTimeFull(detail.startsAt)
                      : "As soon as it is published"
                  }
                />
                <ReviewLine
                  label="Ends"
                  value={detail.endsAt ? formatDateTimeFull(detail.endsAt) : "When somebody pauses it"}
                />
                <ReviewLine label="Status" value={detail.status} />
                <ReviewLine
                  label="Applying to new deals"
                  value={detail.isActive ? "Yes" : "No"}
                />
              </div>

              <p className="text-body-sm text-text-muted mt-4">
                Dates are Dubai time (UTC+04:00, no daylight saving). Whether a campaign applies is
                decided in the database from its status and dates — not by a timer in anybody&apos;s
                browser — so a campaign starts and ends on time with nobody logged in.
              </p>
            </div>
          </div>
        </TabPanel>

        {/* ---- Redemptions ---- */}

        <TabPanel id="redemptions">
          <OfferRedemptionsTab detail={detail} canReverse={permissions.publish} />
        </TabPanel>

        {/* ---- History ---- */}

        <TabPanel id="history">
          <OfferHistoryTab history={detail.statusHistory} />
        </TabPanel>

        {/* ---- Audit ---- */}

        <TabPanel id="audit">
          <OfferAuditTab activity={detail.activity} />
        </TabPanel>
      </Tabs>

      {/* ===================================================
          DIALOGS
      =================================================== */}

      <ConfirmDialog
        isOpen={pausing}
        onClose={() => setPausing(false)}
        onConfirm={() => {
          setPausing(false);
          void run(
            () => setOfferStatusAction({ id: detail.id, status: "paused", reason: "" }),
            "Paused. It stops applying to new deals straight away.",
          );
        }}
        title="Pause this campaign?"
        description="It stops applying to new deals immediately. Deals already done keep their discount, and you can resume it at any time."
        confirmLabel="Pause"
        isLoading={busy}
      />

      <ConfirmDialog
        isOpen={archiving}
        onClose={() => setArchiving(false)}
        onConfirm={() => {
          setArchiving(false);
          void run(
            () => archiveOfferAction({ id: detail.id, archived: true }),
            "Archived. Completed sales keep their discount.",
          );
        }}
        title="Archive this campaign?"
        description={
          detail.totals.appliedCount > 0
            ? `It comes off the lists and stops applying to new deals. The ${detail.totals.appliedCount} ${detail.totals.appliedCount === 1 ? "deal" : "deals"} that already used it keep their discount. Nothing is deleted and it can be restored.`
            : "It comes off the lists and stops applying to new deals. Nothing is deleted and it can be restored."
        }
        confirmLabel="Archive"
        variant="danger"
        isLoading={busy}
      />
    </div>
  );
}
