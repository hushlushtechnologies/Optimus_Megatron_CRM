"use client";

import Link from "next/link";
import { CircleHelp, Info, Tag } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { CampaignTimeline } from "@/src/components/offers/campaign-timeline";
import { OfferStatusBadge } from "@/src/components/offers/offer-status-badge";

import { formatFils } from "@/src/lib/utils/sales-money";
import { cn } from "@/src/lib/utils/cn";

/*
|--------------------------------------------------------------------------
| WHAT CAMPAIGNS WOULD DO TO THIS CAR (Phase 15)
|--------------------------------------------------------------------------
|
| Everything Phase 15 asks for — original price, discount amount,
| promotional price, validity, eligibility reason — for every campaign that
| touches this vehicle, not just the one selected in the dropdown.
|
| TWO THINGS THIS SCREEN IS CAREFUL ABOUT.
|
| It is not a quote. The figures here are indicative display pricing against
| the listed price. A real deal is priced on the Sales side against its own
| proposed price, with fees and VAT, and the authoritative figure is
| calculated there. The panel says so rather than leaving somebody to
| assume.
|
| It does not claim to know about customers. Inventory has no buyer in mind,
| so a campaign that depends on who is buying is shown as "depends on the
| customer" rather than "not eligible" — because telling somebody a campaign
| does not apply to a car, when it applies perfectly well to the right
| buyer, is worse than saying nothing.
*/

export interface CarPromotionRow {
  id: string;
  name: string;
  reference: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  /** Fils, as a string — a bigint does not survive the server boundary. */
  discountFils: string | null;
  verdict: "eligible" | "not_eligible" | "depends_on_customer";
  message: string;
}

interface CarPromotionsPanelProps {
  /** The listed price, in fils as a string. Null when the car has no price. */
  listedPriceFils: string | null;
  rows: CarPromotionRow[];
  /** The campaign currently chosen in the car's own dropdown, if any. */
  selectedPromotionId: string | null;
  className?: string;
}

const VERDICT_TONE = {
  eligible: "success",
  depends_on_customer: "info",
  not_eligible: "neutral",
} as const;

const VERDICT_LABEL = {
  eligible: "Applies",
  depends_on_customer: "Depends",
  not_eligible: "No",
} as const;

export function CarPromotionsPanel({
  listedPriceFils,
  rows,
  selectedPromotionId,
  className,
}: CarPromotionsPanelProps) {
  const listed = listedPriceFils === null ? null : BigInt(listedPriceFils);

  /* Applies first, then the maybes, then the nos. Within each, as given. */
  const order = { eligible: 0, depends_on_customer: 1, not_eligible: 2 };
  const sorted = [...rows].sort((a, b) => order[a.verdict] - order[b.verdict]);

  const applying = rows.filter((row) => row.verdict === "eligible").length;

  return (
    <section className={cn("surface-card flex flex-col gap-4 p-5", className)} aria-label="Promotions">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-body text-text-primary flex items-center gap-2 font-medium">
            <Tag className="text-primary size-4" aria-hidden="true" />
            Promotions
          </h3>

          <p className="text-body-sm text-text-muted mt-0.5">
            {rows.length === 0
              ? "No campaign currently touches this vehicle."
              : applying === 0
                ? `${rows.length} ${rows.length === 1 ? "campaign" : "campaigns"} reference this vehicle, none applying right now.`
                : `${applying} applying now, ${rows.length} in total.`}
          </p>
        </div>

        <Link
          href="/admin/offers?view=all"
          className="text-body-sm text-primary-text hover:text-primary-hover shrink-0"
        >
          Manage campaigns
        </Link>
      </div>

      {/* ---- The honesty line ---- */}

      <p className="text-body-sm text-text-muted border-border bg-card-hover/40 flex items-start gap-2 rounded-md border px-3 py-2.5">
        <Info className="text-text-muted mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Indicative display pricing against the listed price. A deal is priced on the Sales side
          against its own proposed price, with fees and VAT — these figures are not a quote.
        </span>
      </p>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {sorted.map((row) => {
            const discount = row.discountFils === null ? null : BigInt(row.discountFils);
            const promotional = listed !== null && discount !== null ? listed - discount : null;
            const isSelected = row.id === selectedPromotionId;

            return (
              <li
                key={row.id}
                className={cn(
                  "rounded-lg border px-4 py-3",
                  isSelected ? "border-primary/40 bg-primary/5" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/offers/${row.id}`}
                        className="text-body-sm text-text-primary hover:text-primary-text font-medium"
                      >
                        {row.name}
                      </Link>

                      <OfferStatusBadge status={row.status} />

                      {isSelected && <Badge status="info">Selected on this car</Badge>}
                    </div>

                    {row.reference && (
                      <span className="text-text-subtle block font-mono text-xs">
                        {row.reference}
                      </span>
                    )}
                  </div>

                  <Badge status={VERDICT_TONE[row.verdict]} className="shrink-0">
                    {VERDICT_LABEL[row.verdict]}
                  </Badge>
                </div>

                {/* ---- Validity ---- */}

                <CampaignTimeline
                  startsAt={row.startsAt}
                  endsAt={row.endsAt}
                  status={row.status as never}
                  className="mt-2"
                />

                {/* ---- The three figures ---- */}

                {row.verdict === "eligible" && promotional !== null && listed !== null && discount !== null ? (
                  <dl className="border-border mt-3 grid grid-cols-3 gap-3 border-t pt-3">
                    <div>
                      <dt className="text-text-subtle text-xs">Listed</dt>
                      <dd className="text-body-sm text-text-muted tabular-nums line-through">
                        {formatFils(listed)}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-text-subtle text-xs">Discount</dt>
                      <dd className="text-body-sm text-text-primary font-medium tabular-nums">
                        −{formatFils(discount)}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-text-subtle text-xs">With promotion</dt>
                      <dd className="text-body-sm text-success font-semibold tabular-nums">
                        {formatFils(promotional)}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p
                    className={cn(
                      "text-body-sm mt-2 flex items-start gap-2",
                      row.verdict === "depends_on_customer" ? "text-text-muted" : "text-text-subtle",
                    )}
                  >
                    {row.verdict === "depends_on_customer" && (
                      <CircleHelp className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span>{row.message}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
