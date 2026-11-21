"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, Pause, Play, Ticket, Users } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { CampaignTimeline } from "@/src/components/offers/campaign-timeline";
import { DiscountBadge } from "@/src/components/offers/discount-badge";
import { OfferStatusBadge } from "@/src/components/offers/offer-status-badge";
import { OfferTypeBadge } from "@/src/components/offers/offer-type-badge";

import { useMotion } from "@/src/hooks/use-motion";
import type { OfferListRow } from "@/src/lib/types/offer-list";

interface OfferCardProps {
  offer: OfferListRow;
  canPublish: boolean;
  busy?: boolean;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  index?: number;
}

/**
 * One campaign, as a card.
 *
 * Holds the nine things the plan asks for and stops there. A card that shows
 * everything is a card nobody can scan — the detail page is where the rest
 * lives.
 */
export function OfferCard({
  offer,
  canPublish,
  busy = false,
  onPause,
  onResume,
  index = 0,
}: OfferCardProps) {
  const { reduce, transition } = useMotion();

  const audience =
    offer.targetSummary ??
    (offer.promotionType === "customer" ? "Assigned customers" : "Every eligible vehicle");

  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition(0.25, index * 0.04)}
    >
      <Card variant="elevated" padding="md" className="flex h-full flex-col gap-3">
        {/* ---- Name and status ---- */}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/admin/offers/${offer.id}`}
              className="text-body text-text-primary hover:text-primary-text font-medium break-words"
            >
              {offer.name}
            </Link>

            {offer.reference && (
              <p className="text-caption text-text-subtle mt-0.5">{offer.reference}</p>
            )}
          </div>

          <OfferStatusBadge status={offer.status} className="shrink-0" />
        </div>

        {/* ---- What it is and what it gives ---- */}

        <div className="flex flex-wrap items-center gap-2">
          <OfferTypeBadge type={offer.promotionType} />

          <DiscountBadge
            discountType={offer.discountType}
            discountValue={offer.discountValue}
          />
        </div>

        {/* ---- Who it reaches ---- */}

        <p className="text-body-sm text-text-muted flex items-start gap-1.5">
          <Users className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {audience}
        </p>

        {/* ---- When ---- */}

        <CampaignTimeline
          startsAt={offer.startsAt}
          endsAt={offer.endsAt}
          status={offer.status}
        />

        {/* ---- Redemptions and actions ---- */}

        <div className="border-border mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-caption text-text-muted flex items-center gap-1.5">
            <Ticket className="size-3.5" aria-hidden="true" />
            <span className="text-text-primary font-medium tabular-nums">
              {offer.redemptionCount.toLocaleString()}
            </span>
            {offer.maxRedemptions !== null && (
              <span className="text-text-subtle">of {offer.maxRedemptions.toLocaleString()}</span>
            )}
            redeemed
          </p>

          <div className="flex items-center gap-2">
            {canPublish && offer.status === "active" && onPause && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onPause(offer.id)}
                leftIcon={<Pause className="size-3.5" aria-hidden="true" />}
              >
                Pause
              </Button>
            )}

            {canPublish && offer.status === "paused" && onResume && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onResume(offer.id)}
                leftIcon={<Play className="size-3.5" aria-hidden="true" />}
              >
                Resume
              </Button>
            )}

            <Link href={`/admin/offers/${offer.id}`}>
              <Button
                size="sm"
                variant="outline"
                rightIcon={<ArrowUpRight className="size-3.5" aria-hidden="true" />}
              >
                Open
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </motion.li>
  );
}
