"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Info, Layers, Search, Tag, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Spinner } from "@/src/components/ui/spinner";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";

import {
  applyPromotionToDealAction,
  getDealOffersAction,
  type DealOfferRow,
} from "@/app/admin/sales/promotion-actions";
import { formatFils, toFils } from "@/src/lib/utils/sales-money";
import { cn } from "@/src/lib/utils/cn";

/*
|--------------------------------------------------------------------------
| PROMOTIONS ON A DEAL (Phase 16)
|--------------------------------------------------------------------------
|
| View eligible promotions, select one, preview the discount, see what it
| does to the final price, and understand whether it needs approval.
|
| THE STACKING RULE IS STATED, NOT IMPLIED.
|
| "Never silently combine multiple discounts." So when there is already a
| manual discount on the deal, this panel says so above the list, says what
| each campaign's policy permits, and the confirmation spells out the
| arithmetic — manual plus promotion equals total — before anything is
| applied. A campaign whose policy forbids combining is refused by the
| engine with that as the reason, rather than quietly disappearing from the
| list.
|
| THE FIGURE SHOWN IS NOT THE FIGURE SAVED.
|
| Everything here is a preview. The server recalculates the discount from
| the campaign when it applies it, and only the campaign's id is sent. A
| client that could name its own discount would be a client setting prices.
*/

interface DealPromotionsPanelProps {
  dealId: string;
  /** The deal's updated_at, for the concurrent-edit check. */
  updatedAt: string;
  /** The manual discount already on the deal, as the deal stores it. */
  manualDiscount: number;
  proposedPrice: number | null;
  /** Deals in a state where pricing can still change. */
  canEdit: boolean;
  className?: string;
}

export function DealPromotionsPanel({
  dealId,
  updatedAt,
  manualDiscount,
  proposedPrice,
  canEdit,
  className,
}: DealPromotionsPanelProps) {
  const router = useRouter();

  const [rows, setRows] = useState<DealOfferRow[] | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [code, setCode] = useState("");
  const [confirming, setConfirming] = useState<DealOfferRow | null>(null);
  const [busy, setBusy] = useState(false);

  const manualFils = toFils(manualDiscount) ?? 0n;
  const proposedFils = toFils(proposedPrice);

  /* ---- Load, and reload when a code is typed ---- */

  useEffect(() => {
    const trimmed = code.trim();

    const timer = window.setTimeout(() => {
      setLoading(true);

      void (async () => {
        try {
          const result = await getDealOffersAction({
            dealId,
            code: trimmed === "" ? null : trimmed,
          });

          setRows(result.rows);
          setApplied(result.alreadyApplied);
          setLoadError(result.error);
        } catch {
          setRows(null);
          setLoadError("The promotions couldn't be loaded.");
        } finally {
          setLoading(false);
        }
      })();
    }, code === "" ? 0 : 400);

    return () => window.clearTimeout(timer);
  }, [dealId, code]);

  const apply = async () => {
    if (!confirming) return;

    setBusy(true);

    try {
      const result = await applyPromotionToDealAction({
        dealId,
        promotionId: confirming.id,
        expectedUpdatedAt: updatedAt,
        code: code.trim() === "" ? null : code.trim(),
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.appliedFils
          ? `${confirming.name} applied — ${formatFils(BigInt(result.appliedFils))} off.`
          : `${confirming.name} applied.`,
      );

      if (result.warning) toast.warning(result.warning, { duration: 9000 });

      setConfirming(null);
      router.refresh();
    } catch {
      toast.error("Something went wrong. The deal's pricing was not changed.");
    } finally {
      setBusy(false);
    }
  };

  const eligible = (rows ?? []).filter((row) => row.verdict === "eligible");
  const refused = (rows ?? []).filter((row) => row.verdict === "not_eligible");

  return (
    <section
      className={cn("surface-card flex flex-col gap-4 p-5", className)}
      aria-label="Promotions on this deal"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-body text-text-primary flex items-center gap-2 font-medium">
            <Tag className="text-primary size-4" aria-hidden="true" />
            Promotions
          </h3>

          <p className="text-body-sm text-text-muted mt-0.5">
            {loading && rows === null
              ? "Checking which campaigns apply..."
              : eligible.length === 0
                ? "Nothing applies to this deal right now."
                : `${eligible.length} ${eligible.length === 1 ? "campaign applies" : "campaigns apply"}.`}
          </p>
        </div>

        <Link
          href="/admin/offers?view=all"
          className="text-body-sm text-primary-text hover:text-primary-hover shrink-0"
        >
          All campaigns
        </Link>
      </div>

      {/* ===================================================
          THE STACKING WARNING
      =================================================== */}

      {manualFils > 0n && (
        <p className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <Layers className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span>
            This deal already has a manual discount of{" "}
            <strong className="font-medium">{formatFils(manualFils)}</strong>. A promotion applied
            here is <strong className="font-medium">added to it</strong>, and only campaigns whose
            policy permits combining are offered below.
          </span>
        </p>
      )}

      {/* ===================================================
          CODE
      =================================================== */}

      <Input
        label="Promotional code"
        placeholder="If the customer quoted one..."
        leftIcon={<Search className="text-text-subtle size-4" aria-hidden="true" />}
        value={code}
        maxLength={40}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        hint="Leave blank for campaigns that apply automatically."
      />

      {loadError && (
        <p className="text-body-sm text-text-muted flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
          {loadError}
        </p>
      )}

      {loading && (
        <p className="text-body-sm text-text-subtle flex items-center gap-2">
          <Spinner className="size-3.5" /> Checking...
        </p>
      )}

      {/* ===================================================
          ALREADY APPLIED
      =================================================== */}

      {applied.length > 0 && (
        <p className="text-body-sm text-text-muted flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <span>
            {applied.length === 1 ? "A promotion has" : `${applied.length} promotions have`} already
            been applied to this deal. The Redemptions tab on the campaign shows what was given.
          </span>
        </p>
      )}

      {/* ===================================================
          ELIGIBLE
      =================================================== */}

      {eligible.length > 0 && (
        <ul className="flex flex-col gap-3">
          {eligible.map((row) => {
            const discount = row.discountFils === null ? null : BigInt(row.discountFils);
            const combined = discount === null ? null : manualFils + discount;
            const final =
              proposedFils !== null && combined !== null ? proposedFils - combined : null;

            return (
              <li key={row.id} className="border-border rounded-lg border px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/offers/${row.id}`}
                      className="text-body-sm text-text-primary hover:text-primary-text font-medium"
                    >
                      {row.name}
                    </Link>

                    {row.reference && (
                      <span className="text-text-subtle block font-mono text-xs">
                        {row.reference}
                      </span>
                    )}
                  </div>

                  {discount !== null && (
                    <span className="text-body text-text-primary shrink-0 font-semibold tabular-nums">
                      −{formatFils(discount)}
                    </span>
                  )}
                </div>

                <p className="text-body-sm text-text-muted mt-1.5">{row.explanation}</p>

                <p className="text-text-subtle mt-1 text-xs">{row.stackingLabel}</p>

                {/* ---- What it does to the price ---- */}

                {final !== null && proposedFils !== null && combined !== null && (
                  <dl className="border-border mt-3 grid grid-cols-3 gap-3 border-t pt-3">
                    <div>
                      <dt className="text-text-subtle text-xs">Proposed</dt>
                      <dd className="text-body-sm text-text-muted tabular-nums">
                        {formatFils(proposedFils)}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-text-subtle text-xs">
                        {manualFils > 0n ? "Total discount" : "Discount"}
                      </dt>
                      <dd className="text-body-sm text-text-primary font-medium tabular-nums">
                        −{formatFils(combined)}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-text-subtle text-xs">Net</dt>
                      <dd className="text-body-sm text-success font-semibold tabular-nums">
                        {formatFils(final)}
                      </dd>
                    </div>
                  </dl>
                )}

                <p className="text-text-subtle mt-2 text-xs">
                  Before fees and VAT — the deal&apos;s own figures are above.
                </p>

                {canEdit && (
                  <div className="mt-3">
                    <Button
                      variant="gradient"
                      size="sm"
                      disabled={busy}
                      onClick={() => setConfirming(row)}
                    >
                      Apply this promotion
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ===================================================
          REFUSED, WITH REASONS
      =================================================== */}

      {refused.length > 0 && (
        <details className="border-border rounded-lg border">
          <summary className="text-body-sm text-text-muted hover:text-text-primary min-h-11 cursor-pointer list-none px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
            {refused.length} {refused.length === 1 ? "campaign doesn't" : "campaigns don't"} apply —
            see why
          </summary>

          <ul className="border-border divide-border divide-y border-t">
            {refused.map((row) => (
              <li key={row.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/admin/offers/${row.id}`}
                    className="text-body-sm text-text-primary hover:text-primary-text"
                  >
                    {row.name}
                  </Link>

                  <Badge status="neutral">No</Badge>
                </div>

                <p className="text-body-sm text-text-subtle mt-0.5">{row.explanation}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!canEdit && eligible.length > 0 && (
        <p className="text-body-sm text-text-muted flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This deal&apos;s pricing can no longer be changed, so nothing can be applied.
        </p>
      )}

      {/* ===================================================
          CONFIRM — THE ARITHMETIC, SPELLED OUT
      =================================================== */}

      <ConfirmDialog
        isOpen={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => void apply()}
        title={`Apply ${confirming?.name ?? "this promotion"}?`}
        description={
          confirming === null
            ? ""
            : (() => {
                const discount = confirming.discountFils ? BigInt(confirming.discountFils) : 0n;
                const combined = manualFils + discount;

                const sum =
                  manualFils > 0n
                    ? `${formatFils(manualFils)} manual + ${formatFils(discount)} promotion = ${formatFils(combined)} off. `
                    : `${formatFils(discount)} comes off the proposed price. `;

                return (
                  sum +
                  "The discount is recalculated on the server before it is saved, it goes through " +
                  "the deal's normal pricing path, and it counts towards the approval threshold " +
                  "like any other discount. Fees and VAT are recalculated from the new net price."
                );
              })()
        }
        confirmLabel="Apply"
        isLoading={busy}
      />
    </section>
  );
}
