"use client";

import { ArrowRight, GitCommitHorizontal } from "lucide-react";

import { OfferStatusBadge } from "@/src/components/offers/offer-status-badge";
import { EmptyState } from "@/src/components/shared/empty-state";

import type { OfferActivity, OfferStatusChange } from "@/src/lib/types/offer-detail";
import { formatFils } from "@/src/lib/utils/sales-money";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";

/*
|--------------------------------------------------------------------------
| HISTORY AND AUDIT
|--------------------------------------------------------------------------
|
| Two different questions, so two tabs.
|
| History: how this campaign moved through its lifecycle. Draft → active →
| paused → active. Short, and the thing somebody checks when asking "was
| this running last Tuesday".
|
| Audit: every field that changed, who changed it and when. Longer, and the
| thing somebody checks when asking "why is this 20% when I set it to 15%".
|
| Both are read-only. The audit table has no insert policy at all — a trail
| anybody can write to is not a trail.
*/

/* =========================================================
   HISTORY
========================================================= */

export function OfferHistoryTab({ history }: { history: OfferStatusChange[] }) {
  if (history.length === 0) {
    return (
      <div className="surface-card">
        <EmptyState
          icon="FileQuestion"
          title="No status changes yet"
          description="Each time this campaign is published, paused, resumed or ends, it is recorded here."
          size="compact"
        />
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {history.map((entry) => (
        <li key={entry.id} className="surface-card flex items-start gap-3 p-4">
          <GitCommitHorizontal
            className="text-text-muted mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {entry.oldStatus ? (
                <>
                  <OfferStatusBadge status={entry.oldStatus} />
                  <ArrowRight className="text-text-subtle size-3.5" aria-hidden="true" />
                </>
              ) : (
                <span className="text-body-sm text-text-muted">Created as</span>
              )}

              <OfferStatusBadge status={entry.newStatus} />
            </div>

            {entry.reason && (
              <p className="text-body-sm text-text-muted mt-1.5">{entry.reason}</p>
            )}

            <p className="text-text-subtle mt-1 text-xs">
              {formatDateTimeFull(entry.changedAt)}
              {entry.changedByName && ` · ${entry.changedByName}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* =========================================================
   AUDIT
========================================================= */

/** Column names as people would say them. */
const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  reference: "Reference",
  description: "Description",
  promotion_type: "Type",
  discount_type: "Discount type",
  discount_value: "Discount",
  starts_at: "Start",
  ends_at: "End",
  priority: "Priority",
  max_redemptions: "Total uses allowed",
  max_per_customer: "Uses per customer",
  min_purchase_fils: "Minimum price",
  max_discount_fils: "Discount cap",
  points_multiplier: "Points multiplier",
  stacking_policy: "Combining",
  internal_notes: "Internal notes",
  banner_url: "Banner",
};

/** Columns held in fils, so they are shown as money rather than a raw count. */
const FILS_FIELDS = new Set(["min_purchase_fils", "max_discount_fils"]);

function renderValue(field: string | null, value: string | null): string {
  if (value === null || value === "") return "nothing";

  if (field && FILS_FIELDS.has(field)) {
    try {
      return formatFils(BigInt(value));
    } catch {
      /* Not a number after all — show it as it is rather than throwing. */
      return value;
    }
  }

  return value;
}

export function OfferAuditTab({ activity }: { activity: OfferActivity[] }) {
  if (activity.length === 0) {
    return (
      <div className="surface-card">
        <EmptyState
          icon="FileQuestion"
          title="Nothing recorded yet"
          description="Every change to this campaign's details is logged here — what changed, from what to what, and who did it."
          size="compact"
        />
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {activity.map((entry) => (
        <li key={entry.id} className="surface-card p-4">
          {entry.activityType === "updated" && entry.fieldName ? (
            <>
              <p className="text-body-sm text-text-primary">
                <strong className="font-medium">
                  {FIELD_LABELS[entry.fieldName] ?? entry.fieldName}
                </strong>{" "}
                changed from{" "}
                <span className="text-text-muted">
                  {renderValue(entry.fieldName, entry.oldValue)}
                </span>{" "}
                to{" "}
                <span className="text-text-primary font-medium">
                  {renderValue(entry.fieldName, entry.newValue)}
                </span>
              </p>
            </>
          ) : (
            <p className="text-body-sm text-text-primary">
              {entry.description ?? entry.activityType}
            </p>
          )}

          <p className="text-text-subtle mt-1 text-xs">
            {formatDateTimeFull(entry.changedAt)}
            {entry.changedByName && ` · ${entry.changedByName}`}
          </p>
        </li>
      ))}
    </ol>
  );
}
