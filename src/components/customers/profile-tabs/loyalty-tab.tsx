"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Coins,
  Hourglass,
  Lock,
  Minus,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { EmptyState } from "@/src/components/shared/empty-state";

import { adjustCustomerPointsAction } from "@/app/admin/offers/loyalty-actions";
import type {
  CustomerOffersView,
  LoyaltyLedgerEntry,
  LoyaltyWalletView,
} from "@/src/lib/supabase/loyalty-queries";
import { formatFils } from "@/src/lib/utils/sales-money";
import { cn } from "@/src/lib/utils/cn";
import { formatDateTimeFull, formatDay } from "@/src/lib/utils/test-drive-format";

/*
|--------------------------------------------------------------------------
| A CUSTOMER'S LOYALTY (Phases 18, 21 and 22)
|--------------------------------------------------------------------------
|
| Phase 18 asks the wallet to "clearly explain balance state", and that is
| the hard part of this screen rather than the numbers themselves. Three
| different things get called a balance:
|
|   available   what the ledger says they hold
|   reserved    promised against a deal that has not closed
|   spendable   available minus reserved — what can be used today
|
| A customer with 1,000 points and 400 held has 600 to spend, and showing
| "1,000" without saying so is how somebody promises a discount that then
| gets refused. So spendable is the headline and the other two explain it.
|
| The wallet is a cache a trigger maintains; the ledger is the truth. If the
| two disagree this says so rather than showing a number it cannot justify.
*/

const ENTRY_LABELS: Record<string, string> = {
  earn: "Earned",
  redeem: "Redeemed",
  expire: "Expired",
  reverse: "Reversed",
  refund_reversal: "Taken back after a refund",
  adjust: "Adjusted by hand",
  correction: "Corrected",
};

const SOURCE_LABELS: Record<string, string> = {
  sale: "a sale",
  manual: "a person",
  expiry_job: "the expiry job",
  refund: "a refund",
  promotion: "a promotion",
  import: "an import",
};

interface LoyaltyTabProps {
  customerId: string;
  customerName: string;
  /** Null when the loyalty tables aren't there or couldn't be read. */
  wallet: LoyaltyWalletView | null;
  /** Their private offers and what they have redeemed (Phase 22). */
  offers: CustomerOffersView | null;
  loyaltyEnabled: boolean;
  canAdjust: boolean;
}

export function LoyaltyTab({
  customerId,
  customerName,
  wallet,
  offers,
  loyaltyEnabled,
  canAdjust,
}: LoyaltyTabProps) {
  const router = useRouter();

  const [adjusting, setAdjusting] = useState<"add" | "remove" | null>(null);
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [entryType, setEntryType] = useState<"adjust" | "correction">("adjust");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const amount = Number(points);
    if (!Number.isFinite(amount) || amount <= 0) return;

    setBusy(true);

    try {
      const result = await adjustCustomerPointsAction({
        customerId,
        points: adjusting === "remove" ? -amount : amount,
        reason,
        entryType,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(result.message ?? "Adjusted.");
      setAdjusting(null);
      setPoints("");
      setReason("");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  if (!loyaltyEnabled) {
    return (
      <div className="surface-card">
        <EmptyState
          icon="Tag"
          title="The loyalty program is switched off"
          description="Nothing earns or redeems while it's off. Any points already on record are kept and will still be here when it's switched back on."
          size="compact"
        />
      </div>
    );
  }

  if (!wallet || !wallet.exists) {
    return (
      <div className="flex flex-col gap-4">
        <div className="surface-card">
          <EmptyState
            icon="Tag"
            title="No points yet"
            description={`${customerName} hasn't earned any points. They'll appear here after a qualifying sale.`}
            size="compact"
          />
        </div>

        {canAdjust && (
          <div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="size-4" aria-hidden="true" />}
              onClick={() => {
                setAdjusting("add");
                setEntryType("adjust");
              }}
            >
              Grant bonus points
            </Button>
          </div>
        )}

        <AdjustDialog
          mode={adjusting}
          onClose={() => setAdjusting(null)}
          points={points}
          setPoints={setPoints}
          reason={reason}
          setReason={setReason}
          entryType={entryType}
          setEntryType={setEntryType}
          onSubmit={() => void submit()}
          busy={busy}
          customerName={customerName}
          spendable={0}
        />

        <OffersSections offers={offers} customerId={customerId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ===================================================
          THE BALANCE, EXPLAINED
      =================================================== */}

      <section className="surface-card flex flex-col gap-4 p-5" aria-label="Points balance">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-text-subtle text-xs font-medium tracking-wide uppercase">
              Available to spend
            </p>

            <p className="text-text-primary mt-1 text-3xl font-semibold tabular-nums">
              {wallet.spendablePoints.toLocaleString()}
            </p>

            {/* The sum, when a hold makes the headline differ from the balance. */}
            {wallet.reservedPoints > 0 && (
              <p className="text-body-sm text-text-muted mt-1">
                {wallet.availablePoints.toLocaleString()} on the books, less{" "}
                {wallet.reservedPoints.toLocaleString()} held against a deal.
              </p>
            )}
          </div>

          {canAdjust && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Plus className="size-4" aria-hidden="true" />}
                onClick={() => {
                  setAdjusting("add");
                  setEntryType("adjust");
                }}
              >
                Add points
              </Button>

              <Button
                variant="outline"
                size="sm"
                leftIcon={<Minus className="size-4" aria-hidden="true" />}
                onClick={() => {
                  setAdjusting("remove");
                  setEntryType("correction");
                }}
              >
                Take away
              </Button>
            </div>
          )}
        </div>

        <dl className="border-border grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
          <Figure label="Earned, all time" value={wallet.lifetimeEarned} />
          <Figure label="Redeemed, all time" value={wallet.lifetimeRedeemed} />
          <Figure label="Expired" value={wallet.expiredPoints} />
          <Figure label="Held against deals" value={wallet.reservedPoints} />
        </dl>

        {/*
          The cache-versus-ledger check. If these disagree the ledger is
          right, and saying so beats showing a number nobody can justify.
        */}
        {!wallet.agrees && (
          <p
            role="alert"
            className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
            <span>
              The stored balance ({wallet.availablePoints.toLocaleString()}) doesn&apos;t match the
              ledger ({wallet.ledgerSum.toLocaleString()}). The ledger is the record that counts.
              Someone should run <code className="font-mono text-xs">rebuild_loyalty_wallet</code>{" "}
              for this customer.
            </span>
          </p>
        )}
      </section>

      {/* ===================================================
          HOLDS
      =================================================== */}

      {wallet.holds.length > 0 && (
        <section className="surface-card flex flex-col gap-3 p-5" aria-label="Points held">
          <h3 className="text-body text-text-primary flex items-center gap-2 font-medium">
            <Lock className="text-primary size-4" aria-hidden="true" />
            Held against open deals
          </h3>

          <p className="text-body-sm text-text-muted">
            These points are promised but not yet spent. They come back automatically if the deal
            doesn&apos;t complete.
          </p>

          <ul className="border-border divide-border divide-y rounded-lg border">
            {wallet.holds.map((hold) => (
              <li key={hold.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link
                  href={`/admin/sales/${hold.dealId}`}
                  className="text-body-sm text-text-primary hover:text-primary-text"
                >
                  View the deal
                </Link>

                <span className="text-body-sm text-text-primary font-medium tabular-nums">
                  {hold.points.toLocaleString()} points
                </span>

                <span className="text-text-subtle text-xs">
                  frees up {formatDay(hold.expiresAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ===================================================
          EXPIRING SOON
      =================================================== */}

      {wallet.expiringSoonTotal > 0 && (
        <section
          className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-5"
          aria-label="Points expiring soon"
        >
          <h3 className="text-body text-text-primary flex items-center gap-2 font-medium">
            <Hourglass className="size-4 text-amber-400" aria-hidden="true" />
            {wallet.expiringSoonTotal.toLocaleString()} points expiring within 60 days
          </h3>

          <ul className="flex flex-col gap-1">
            {wallet.expiringSoon.map((batch, index) => (
              <li key={index} className="text-body-sm text-text-muted">
                <strong className="text-text-primary font-medium tabular-nums">
                  {batch.points.toLocaleString()}
                </strong>{" "}
                on {formatDay(batch.expiresAt)}
              </li>
            ))}
          </ul>

          <p className="text-text-subtle text-xs">
            Expiry takes the oldest points first, and only counts points that haven&apos;t already
            been spent.
          </p>
        </section>
      )}

      {/* ===================================================
          THE LEDGER
      =================================================== */}

      <section className="flex flex-col gap-3" aria-label="Points activity">
        <h3 className="text-body text-text-primary font-medium">Activity</h3>

        {wallet.entries.length === 0 ? (
          <div className="surface-card">
            <EmptyState icon="FileQuestion" title="Nothing yet" size="compact" />
          </div>
        ) : (
          <ul className="border-border divide-border divide-y rounded-lg border">
            {wallet.entries.map((entry) => (
              <LedgerRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}

        {wallet.entries.length >= 100 && (
          <p className="text-text-subtle text-xs">
            Showing the 100 most recent movements.
          </p>
        )}
      </section>

      <OffersSections offers={offers} customerId={customerId} />

      <AdjustDialog
        mode={adjusting}
        onClose={() => setAdjusting(null)}
        points={points}
        setPoints={setPoints}
        reason={reason}
        setReason={setReason}
        entryType={entryType}
        setEntryType={setEntryType}
        onSubmit={() => void submit()}
        busy={busy}
        customerName={customerName}
        spendable={wallet.spendablePoints}
      />
    </div>
  );
}

/* =========================================================
   PERSONAL OFFERS AND REDEMPTIONS (Phase 22)

   Recent purchases are deliberately NOT repeated here — the Vehicles /
   Deals tab already lists them, and the plan says not to redesign the
   Customer module. There is a link to it instead.
========================================================= */

const OFFER_STATUS_TONE = {
  active: "success",
  used: "info",
  expired: "neutral",
  cancelled: "danger",
} as const;

function OffersSections({
  offers,
  customerId,
}: {
  offers: CustomerOffersView | null;
  customerId: string;
}) {
  if (!offers) return null;

  const live = offers.personalOffers.filter((offer) => offer.status === "active");
  const applied = offers.redemptions.filter((item) => item.status === "applied");

  return (
    <>
      {/* ---- Private offers ---- */}

      <section className="flex flex-col gap-3" aria-label="Personal offers">
        <h3 className="text-body text-text-primary font-medium">
          Personal offers
          {live.length > 0 && (
            <span className="text-text-muted ml-2 text-sm font-normal">{live.length} active</span>
          )}
        </h3>

        {offers.personalOffers.length === 0 ? (
          <p className="text-body-sm text-text-muted">
            No campaign has been assigned to this customer privately.
          </p>
        ) : (
          <ul className="border-border divide-border divide-y rounded-lg border">
            {offers.personalOffers.map((offer) => (
              <li key={offer.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/offers/${offer.promotionId}`}
                    className="text-body-sm text-text-primary hover:text-primary-text font-medium"
                  >
                    {offer.promotionName}
                  </Link>

                  <p className="text-text-subtle mt-0.5 text-xs">
                    {offer.carTitle ? `${offer.carTitle} · ` : ""}
                    {offer.validTo ? `until ${formatDay(offer.validTo)}` : "no end date"}
                  </p>

                  {offer.discountOverrideFils && (
                    <p className="text-body-sm text-text-primary mt-0.5 font-medium">
                      {formatFils(BigInt(offer.discountOverrideFils))} — their own figure
                    </p>
                  )}

                  {offer.notes && (
                    <p className="text-body-sm text-text-muted mt-0.5">{offer.notes}</p>
                  )}
                </div>

                <Badge status={OFFER_STATUS_TONE[offer.status]} className="shrink-0">
                  {offer.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Redemption history ---- */}

      <section className="flex flex-col gap-3" aria-label="Redemption history">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-body text-text-primary font-medium">Discounts received</h3>

          {applied.length > 0 && (
            <p className="text-body-sm text-text-muted">
              {formatFils(BigInt(offers.totalSavedFils))} across {applied.length}{" "}
              {applied.length === 1 ? "deal" : "deals"}
            </p>
          )}
        </div>

        {offers.redemptions.length === 0 ? (
          <p className="text-body-sm text-text-muted">
            No promotion has been applied to a deal for this customer yet.
          </p>
        ) : (
          <ul className="border-border divide-border divide-y rounded-lg border">
            {offers.redemptions.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/offers/${item.promotionId}`}
                    className="text-body-sm text-text-primary hover:text-primary-text"
                  >
                    {item.promotionName}
                  </Link>

                  <p className="text-text-subtle mt-0.5 text-xs">
                    {formatDay(item.redeemedAt)}
                    {item.code && ` · code ${item.code}`}
                    {item.dealId && " · "}
                  </p>

                  {item.dealId && (
                    <Link
                      href={`/admin/sales/${item.dealId}`}
                      className="text-primary-text hover:text-primary-hover text-xs"
                    >
                      view the deal
                    </Link>
                  )}

                  {item.status === "reversed" && item.reversalReason && (
                    <p className="text-body-sm text-text-muted mt-0.5">
                      Reversed: {item.reversalReason}
                    </p>
                  )}
                </div>

                <span
                  className={cn(
                    "text-body-sm shrink-0 font-semibold tabular-nums",
                    item.status === "reversed"
                      ? "text-text-subtle line-through"
                      : "text-text-primary",
                  )}
                >
                  {formatFils(BigInt(item.discountFils))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-body-sm text-text-muted">
        Purchases are on the{" "}
        <Link
          href={`/admin/customers/${customerId}?tab=vehicles`}
          className="text-primary-text hover:text-primary-hover"
        >
          Vehicles / Deals
        </Link>{" "}
        tab.
      </p>
    </>
  );
}

/* =========================================================
   PIECES
========================================================= */

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-text-subtle text-xs">{label}</dt>
      <dd className="text-body text-text-primary font-medium tabular-nums">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function LedgerRow({ entry }: { entry: LoyaltyLedgerEntry }) {
  const positive = entry.points > 0;

  /* A credit that has been partly spent or expired says so. */
  const left = entry.points - entry.consumedPoints;
  const partlyUsed = entry.entryType === "earn" && entry.consumedPoints > 0;

  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-sm text-text-primary font-medium">
            {ENTRY_LABELS[entry.entryType] ?? entry.entryType}
          </span>

          <span className="text-text-subtle text-xs">
            from {SOURCE_LABELS[entry.source] ?? entry.source}
          </span>

          {entry.dealId && (
            <Link
              href={`/admin/sales/${entry.dealId}`}
              className="text-primary-text hover:text-primary-hover text-xs"
            >
              the deal
            </Link>
          )}
        </div>

        {entry.reason && (
          <p className="text-body-sm text-text-muted mt-0.5">{entry.reason}</p>
        )}

        <p className="text-text-subtle mt-0.5 text-xs">
          {formatDateTimeFull(entry.createdAt)}
          {entry.actorName && ` · ${entry.actorName}`}
        </p>

        {partlyUsed && (
          <p className="text-text-subtle mt-0.5 text-xs">
            {entry.consumedPoints.toLocaleString()} of these have been used — {left.toLocaleString()}{" "}
            still live
          </p>
        )}

        {entry.expiresAt && left > 0 && (
          <p className="text-text-subtle mt-0.5 flex items-center gap-1 text-xs">
            <Clock className="size-3" aria-hidden="true" />
            expires {formatDay(entry.expiresAt)}
          </p>
        )}
      </div>

      <span
        className={cn(
          "text-body shrink-0 font-semibold tabular-nums",
          positive ? "text-success" : "text-text-primary",
        )}
      >
        {positive ? (
          <ArrowUpRight className="mr-1 inline size-3.5" aria-hidden="true" />
        ) : (
          <ArrowDownRight className="mr-1 inline size-3.5" aria-hidden="true" />
        )}
        {positive ? "+" : ""}
        {entry.points.toLocaleString()}
      </span>
    </li>
  );
}

/* =========================================================
   ADJUSTING (Phase 21)
========================================================= */

function AdjustDialog({
  mode,
  onClose,
  points,
  setPoints,
  reason,
  setReason,
  entryType,
  setEntryType,
  onSubmit,
  busy,
  customerName,
  spendable,
}: {
  mode: "add" | "remove" | null;
  onClose: () => void;
  points: string;
  setPoints: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  entryType: "adjust" | "correction";
  setEntryType: (value: "adjust" | "correction") => void;
  onSubmit: () => void;
  busy: boolean;
  customerName: string;
  spendable: number;
}) {
  const amount = Number(points);
  const valid = Number.isFinite(amount) && amount > 0 && reason.trim().length >= 5;

  const tooMany = mode === "remove" && Number.isFinite(amount) && amount > spendable;

  return (
    <Modal
      isOpen={mode !== null}
      onClose={onClose}
      title={mode === "remove" ? "Take points away" : "Add points"}
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-text-muted">
          {mode === "remove"
            ? `Taking points from ${customerName}. They have ${spendable.toLocaleString()} available.`
            : `Granting points to ${customerName}. These expire on the same schedule as earned points.`}
        </p>

        <Input
          label="How many points"
          type="number"
          min={1}
          step="1"
          value={points}
          onChange={(event) => setPoints(event.target.value)}
          error={tooMany ? "That's more than they have available." : undefined}
        />

        <Select
          label="Record this as"
          value={entryType}
          onChange={(event) => setEntryType(event.target.value as "adjust" | "correction")}
          options={[
            { value: "adjust", label: "An adjustment — a deliberate change" },
            { value: "correction", label: "A correction — fixing a mistake" },
          ]}
          hint="Both appear in the ledger. The label is for whoever reads it later."
        />

        {/*
          Required at five characters, not one. "fix" is not a reason, and
          the whole point of the requirement is that somebody reading this in
          six months can tell what happened.
        */}
        <Textarea
          label="Why"
          placeholder={
            mode === "remove"
              ? "Points credited twice on deal #1234 — removing the duplicate."
              : "Goodwill after a delayed delivery, agreed with the sales manager."
          }
          value={reason}
          maxLength={500}
          rows={3}
          required
          onChange={(event) => setReason(event.target.value)}
          hint="Required, and permanent. The ledger is never edited or deleted."
        />

        <p className="text-body-sm text-text-muted flex items-start gap-2">
          <Coins className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This is recorded against your name and cannot be undone — only offset by another
          adjustment.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>

          <Button
            variant={mode === "remove" ? "destructiveSolid" : "gradient"}
            onClick={onSubmit}
            disabled={busy || !valid}
          >
            {mode === "remove" ? "Take away" : "Add"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
