"use client";

import { useState } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { EmptyState } from "@/src/components/shared/empty-state";
import { MetricCard } from "@/src/components/shared/metric-card";

import { reverseRedemptionAction } from "@/app/admin/offers/actions";
import type { OfferDetail, OfferRedemption } from "@/src/lib/types/offer-detail";
import { formatFils } from "@/src/lib/utils/sales-money";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";

/*
|--------------------------------------------------------------------------
| REDEMPTIONS
|--------------------------------------------------------------------------
|
| Every time this campaign took money off a deal, with what it was worth at
| the time.
|
| The `terms` column is the important part and it is shown, not hidden: each
| redemption carries a snapshot of what the campaign said when it was
| applied. So editing the campaign to 20% does not make a customer who got
| 15% look like they got 20% — which is what "do not allow changes to
| rewrite historical redemption amounts" actually requires.
*/

interface OfferRedemptionsTabProps {
  detail: OfferDetail;
  canReverse: boolean;
}

export function OfferRedemptionsTab({ detail, canReverse }: OfferRedemptionsTabProps) {
  const router = useRouter();

  const [reversing, setReversing] = useState<OfferRedemption | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reversing) return;

    setBusy(true);

    try {
      const result = await reverseRedemptionAction({ id: reversing.id, reason });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Redemption reversed. The usage counts have come back down.");
      setReversing(null);
      setReason("");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ---- Totals ---- */}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Times used"
          value={detail.totals.appliedCount}
          caption={
            detail.maxRedemptions === null
              ? "No limit set"
              : `of ${detail.maxRedemptions.toLocaleString()} allowed`
          }
        />

        {/*
          Not a MetricCard: that takes a number, and turning a bigint of fils
          into a JavaScript number to display it is exactly what the fils
          convention exists to avoid. formatFils renders the exact value.
        */}
        <div className="surface-card flex flex-col justify-center gap-1 p-4">
          <p className="text-text-subtle text-xs font-medium tracking-wide uppercase">
            Discount given
          </p>

          <p className="text-h4 text-text-primary font-semibold tabular-nums">
            {formatFils(BigInt(detail.totals.discountGivenFils))}
          </p>

          <p className="text-text-subtle text-xs">Across applied redemptions</p>
        </div>

        <MetricCard
          label="Reversed"
          value={detail.totals.reversedCount}
          caption={
            detail.totals.reversedCount === 0 ? "Nothing reversed" : "No longer counted against limits"
          }
        />
      </div>

      {/* ---- The list ---- */}

      {detail.redemptions.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            icon="FileQuestion"
            title="Not used yet"
            description="Each time this campaign takes money off a deal, it appears here with what it was worth at the time."
            size="compact"
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {detail.redemptions.map((redemption) => {
            const reversed = redemption.status === "reversed";

            /* What the campaign said then, which may not be what it says now. */
            const thenValue = redemption.terms.discount_value;
            const thenType = redemption.terms.discount_type;

            const drifted =
              thenValue !== undefined &&
              (Number(thenValue) !== detail.discountValue || thenType !== detail.discountType);

            return (
              <li
                key={redemption.id}
                className={`surface-card flex flex-col gap-3 p-4 ${reversed ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body text-text-primary font-medium">
                      {redemption.customerName ?? "Unknown customer"}
                    </p>

                    <p className="text-body-sm text-text-muted mt-0.5">
                      {redemption.customerNumber ?? "No customer number"}
                      {redemption.code && ` · code ${redemption.code}`}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-body text-text-primary font-semibold tabular-nums">
                      {formatFils(BigInt(redemption.discountFils))}
                    </p>

                    <Badge status={reversed ? "danger" : "success"} className="mt-1">
                      {reversed ? "Reversed" : "Applied"}
                    </Badge>
                  </div>
                </div>

                <div className="text-body-sm text-text-muted flex flex-wrap gap-x-4 gap-y-1">
                  <span>{formatDateTimeFull(redemption.redeemedAt)}</span>
                  {redemption.redeemedByName && <span>by {redemption.redeemedByName}</span>}
                </div>

                {/*
                  The snapshot. Only called out when it differs from the
                  campaign's current terms, because that is the case where
                  somebody would otherwise assume the current figure applied.
                */}
                {drifted && (
                  <p className="text-body-sm text-text-muted border-border bg-card-hover/40 rounded-md border px-3 py-2">
                    Given under the campaign&apos;s terms at the time:{" "}
                    <strong className="text-text-primary font-medium">
                      {thenType === "percentage" ? `${String(thenValue)}% off` : `AED ${String(thenValue)} off`}
                    </strong>
                    . The campaign has been edited since — this redemption keeps what it was given.
                  </p>
                )}

                {reversed && (
                  <p className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
                    <span>
                      Reversed{redemption.reversedAt ? ` ${formatDateTimeFull(redemption.reversedAt)}` : ""}
                      {redemption.reversalReason ? `: ${redemption.reversalReason}` : "."}
                    </span>
                  </p>
                )}

                {canReverse && !reversed && (
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<RotateCcw className="size-3.5" aria-hidden="true" />}
                      onClick={() => {
                        setReversing(redemption);
                        setReason("");
                      }}
                    >
                      Reverse
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ---- Reversal ---- */}

      <Modal
        isOpen={reversing !== null}
        onClose={() => setReversing(null)}
        title="Reverse this redemption?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-body-sm text-text-muted">
            The redemption stays on the record as reversed — it is not deleted. The usage counts
            come back down, so the campaign and any code regain one use.
          </p>

          {reversing && (
            <div className="border-border bg-card-hover/40 rounded-lg border px-3 py-2">
              <p className="text-body-sm text-text-primary font-medium">
                {reversing.customerName ?? "Unknown customer"} ·{" "}
                {formatFils(BigInt(reversing.discountFils))}
              </p>
              <p className="text-text-subtle text-xs">{formatDateTimeFull(reversing.redeemedAt)}</p>
            </div>
          )}

          <Input
            label="Why is this being reversed?"
            placeholder="Deal cancelled, discount applied in error..."
            value={reason}
            maxLength={300}
            required
            onChange={(event) => setReason(event.target.value)}
            hint="Required. Somebody looking at this in six months needs to know."
          />

          <p className="text-body-sm text-text-muted">
            This does not change the deal&apos;s own pricing. If the deal is still open, its price
            needs updating separately.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReversing(null)} disabled={busy}>
              Cancel
            </Button>

            <Button
              variant="destructiveSolid"
              onClick={() => void submit()}
              disabled={busy || reason.trim().length < 3}
            >
              Reverse
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
