"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, Info, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Spinner } from "@/src/components/ui/spinner";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";

import {
  applyPointsToDealAction,
  getDealPointsAction,
  type DealPointsView,
} from "@/app/admin/sales/promotion-actions";
import { releasePointsReservationAction } from "@/app/admin/offers/loyalty-actions";
import { formatFils, toFils } from "@/src/lib/utils/sales-money";
import { cn } from "@/src/lib/utils/cn";

/*
|--------------------------------------------------------------------------
| SPENDING POINTS ON A DEAL (Phase 20)
|--------------------------------------------------------------------------
|
| Everything the plan asks to be shown: available points, points being
| redeemed, the discount they are worth, what is left afterwards, the new
| deal total, and why it is or isn't allowed.
|
| The number that matters is SPENDABLE, not the balance. A customer with
| 1,000 points and 400 held against another deal has 600 to spend here, and
| showing 1,000 is how somebody promises a discount that then gets refused.
|
| Nothing here decides anything. The figure shown is a preview computed from
| the conversion rate; the server reserves the points, recalculates what
| they are worth, and writes that. A client that could name its own discount
| would be a client setting prices.
*/

interface DealPointsPanelProps {
  dealId: string;
  updatedAt: string;
  manualDiscount: number;
  proposedPrice: number | null;
  canEdit: boolean;
  className?: string;
}

export function DealPointsPanel({
  dealId,
  updatedAt,
  manualDiscount,
  proposedPrice,
  canEdit,
  className,
}: DealPointsPanelProps) {
  const router = useRouter();

  const [view, setView] = useState<DealPointsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const result = await getDealPointsAction({ dealId });
        if (alive) setView(result);
      } catch {
        if (alive) setView(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [dealId]);

  const manualFils = toFils(manualDiscount) ?? 0n;
  const proposedFils = toFils(proposedPrice);

  const wanted = Number(points);
  const hasWanted = Number.isFinite(wanted) && wanted > 0;

  /*
   * What the typed points are worth, at the configured rate.
   *
   * Not memoised: it is one division, and the compiler cannot verify a memo
   * whose deps include a derived boolean. points * 100 fils divided by
   * points-per-AED, floored — the same arithmetic reserve_loyalty_points
   * does, so the preview and the server agree.
   */
  const worthFils =
    view?.pointsPerAed && hasWanted
      ? BigInt(Math.floor((wanted * 100) / view.pointsPerAed))
      : 0n;

  const combinedFils = manualFils + worthFils;
  const newTotalFils = proposedFils === null ? null : proposedFils - combinedFils;

  /* Why it would be refused, worked out before the request. */
  const problem = useMemo(() => {
    if (!view || !hasWanted) return null;

    if (view.spendablePoints === null) return "This customer has no loyalty wallet yet.";

    if (wanted > view.spendablePoints) {
      return `Only ${view.spendablePoints.toLocaleString()} points are available to spend.`;
    }

    if (view.minRedeem !== null && wanted < view.minRedeem) {
      return `The minimum redemption is ${view.minRedeem.toLocaleString()} points.`;
    }

    if (view.maxRedeem !== null && wanted > view.maxRedeem) {
      return `The maximum redemption is ${view.maxRedeem.toLocaleString()} points per deal.`;
    }

    if (view.dealCeilingFils !== null && worthFils > BigInt(view.dealCeilingFils)) {
      return `Points can cover at most ${formatFils(BigInt(view.dealCeilingFils))} of this deal.`;
    }

    if (newTotalFils !== null && newTotalFils <= 0n) {
      return "That would take the price to zero or below.";
    }

    return null;
  }, [view, hasWanted, wanted, worthFils, newTotalFils]);

  const apply = async () => {
    setBusy(true);

    try {
      const result = await applyPointsToDealAction({
        dealId,
        points: wanted,
        expectedUpdatedAt: updatedAt,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.appliedFils
          ? `${wanted.toLocaleString()} points redeemed — ${formatFils(BigInt(result.appliedFils))} off.`
          : "Points redeemed.",
      );

      if (result.warning) toast.warning(result.warning, { duration: 9000 });

      setConfirming(false);
      setPoints("");
      router.refresh();
    } catch {
      toast.error("Something went wrong. The deal's pricing was not changed.");
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    if (!view?.existingHold) return;

    setBusy(true);

    try {
      const result = await releasePointsReservationAction({
        reservationId: view.existingHold.id,
        reason: "Released from the deal's pricing tab.",
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(result.message ?? "Hold released.");
      router.refresh();
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  /* Nothing to show when the program is off — not an error, just off. */
  if (!loading && (!view || !view.loyaltyEnabled)) return null;

  return (
    <section
      className={cn("surface-card flex flex-col gap-4 p-5", className)}
      aria-label="Loyalty points on this deal"
    >
      <div>
        <h3 className="text-body text-text-primary flex items-center gap-2 font-medium">
          <Coins className="text-primary size-4" aria-hidden="true" />
          Loyalty points
        </h3>

        {loading ? (
          <p className="text-body-sm text-text-subtle mt-1 flex items-center gap-2">
            <Spinner className="size-3.5" /> Checking the customer&apos;s balance...
          </p>
        ) : (
          <p className="text-body-sm text-text-muted mt-0.5">
            {view?.spendablePoints === null
              ? "This customer has no points yet."
              : `${view?.spendablePoints.toLocaleString()} points available to spend.`}
          </p>
        )}
      </div>

      {view?.reason && (
        <p className="text-body-sm text-text-muted flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {view.reason}
        </p>
      )}

      {/* ---- Already redeemed on this deal ---- */}

      {view && view.alreadyRedeemed > 0 && (
        <p className="text-body-sm text-text-muted rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
          {view.alreadyRedeemed.toLocaleString()} points have already been redeemed against this
          deal.
        </p>
      )}

      {/* ---- A standing hold ---- */}

      {view?.existingHold && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <p className="text-body-sm text-text-primary flex items-start gap-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
            <span>
              {view.existingHold.points.toLocaleString()} points are held against this deal but not
              yet spent. The discount may already be on the deal — check the pricing above.
            </span>
          </p>

          {canEdit && (
            <div>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void release()}>
                Release the hold
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ---- Redeem ---- */}

      {canEdit && view && view.spendablePoints !== null && view.spendablePoints > 0 && !view.existingHold && (
        <div className="flex flex-col gap-3">
          <Input
            label="Points to redeem"
            type="number"
            min={1}
            step="1"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            error={problem ?? undefined}
            hint={
              view.minRedeem !== null || view.maxRedeem !== null
                ? `${view.minRedeem !== null ? `Minimum ${view.minRedeem.toLocaleString()}` : ""}${
                    view.minRedeem !== null && view.maxRedeem !== null ? ", " : ""
                  }${view.maxRedeem !== null ? `maximum ${view.maxRedeem.toLocaleString()}` : ""}.`
                : undefined
            }
          />

          {/* ---- The four figures the plan asks for ---- */}

          {hasWanted && !problem && proposedFils !== null && newTotalFils !== null && (
            <dl className="border-border grid grid-cols-2 gap-3 rounded-lg border px-4 py-3 sm:grid-cols-4">
              <div>
                <dt className="text-text-subtle text-xs">Worth</dt>
                <dd className="text-body-sm text-text-primary font-medium tabular-nums">
                  {formatFils(worthFils)}
                </dd>
              </div>

              <div>
                <dt className="text-text-subtle text-xs">
                  {manualFils > 0n ? "Total discount" : "Discount"}
                </dt>
                <dd className="text-body-sm text-text-primary font-medium tabular-nums">
                  −{formatFils(combinedFils)}
                </dd>
              </div>

              <div>
                <dt className="text-text-subtle text-xs">Net</dt>
                <dd className="text-body-sm text-success font-semibold tabular-nums">
                  {formatFils(newTotalFils)}
                </dd>
              </div>

              <div>
                <dt className="text-text-subtle text-xs">Points left</dt>
                <dd className="text-body-sm text-text-primary font-medium tabular-nums">
                  {(view.spendablePoints - wanted).toLocaleString()}
                </dd>
              </div>
            </dl>
          )}

          <p className="text-text-subtle text-xs">
            Before fees and VAT — the deal&apos;s own figures are above. The discount counts
            towards the approval threshold like any other.
          </p>

          <div>
            <Button
              variant="gradient"
              size="sm"
              disabled={busy || !hasWanted || problem !== null}
              onClick={() => setConfirming(true)}
            >
              Redeem these points
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void apply()}
        title={`Redeem ${wanted.toLocaleString()} points?`}
        description={
          manualFils > 0n
            ? `${formatFils(manualFils)} manual + ${formatFils(worthFils)} from points = ${formatFils(combinedFils)} off. The points are held, the discount is applied, and then the points are spent — if any step fails the points are given back.`
            : `${formatFils(worthFils)} comes off the proposed price. The points are held first, so they cannot be spent twice, and are only deducted once the discount is on the deal.`
        }
        confirmLabel="Redeem"
        isLoading={busy}
      />
    </section>
  );
}
