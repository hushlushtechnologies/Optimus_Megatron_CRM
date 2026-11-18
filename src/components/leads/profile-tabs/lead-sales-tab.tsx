"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Handshake, Link2, TriangleAlert } from "lucide-react";

import { LeadDealCard } from "@/src/components/leads/lead-deal-card";
import { LinkDealDialog } from "@/src/components/leads/link-deal-dialog";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";
import { Button } from "@/src/components/ui/button";

import { unlinkDealFromLeadAction } from "@/app/admin/leads/[id]/sales-actions";
import type { LeadDealRow, LeadSalesData } from "@/src/lib/types/lead-sales";

interface LeadSalesTabProps {
  leadId: string;
  customerId: string;
  /** False once the lead is Won or Lost. A closed lead gets no new deals. */
  leadIsOpen: boolean;
  data: LeadSalesData;
  canCreate: boolean;
  canLink: boolean;
}

/**
 * The sales side of a lead: every linked deal, and the two ways to connect one.
 *
 * Creating a deal from here hands the existing Create Deal form the lead's
 * customer and vehicle through the URL, so there is only ever one deal form.
 */
export function LeadSalesTab({
  leadId,
  customerId,
  leadIsOpen,
  data,
  canCreate,
  canLink,
}: LeadSalesTabProps) {
  const router = useRouter();

  const [linkOpen, setLinkOpen] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<LeadDealRow | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const handleUnlink = async () => {
    if (!unlinkTarget) return;

    setIsUnlinking(true);

    try {
      const result = await unlinkDealFromLeadAction({ leadId, dealId: unlinkTarget.id });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`Deal ${unlinkTarget.deal_number} is no longer linked to this lead.`);
      setUnlinkTarget(null);
      router.refresh();
    } catch {
      toast.error("Your change couldn't be saved. Please try again.");
    } finally {
      setIsUnlinking(false);
    }
  };

  /* Why the Create Deal action may be unavailable, in the order that matters. */
  const createBlockedReason = !canCreate
    ? "You don't have permission to create deals."
    : !leadIsOpen
      ? "This lead is closed. Reopen it before creating a deal."
      : null;

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-text-muted">
          Deals created from, or linked to, this lead. The lead&apos;s own history is never changed by a
          deal.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {canLink && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Link2 className="size-4" />}
              onClick={() => setLinkOpen(true)}
            >
              Link existing deal
            </Button>
          )}

          {createBlockedReason === null ? (
            <Link
              href={`/admin/sales/new?leadId=${leadId}`}
              className="bg-primary text-body-sm hover:bg-primary-hover focus-visible:ring-primary inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[#0b1220] transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <Handshake className="size-4" aria-hidden="true" />
              Create deal
            </Link>
          ) : (
            <span
              aria-disabled="true"
              title={createBlockedReason}
              className="border-border bg-card-hover/40 text-body-sm text-text-subtle inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-md border border-dashed px-3"
            >
              <Handshake className="size-4" aria-hidden="true" />
              Create deal
              <span className="sr-only">({createBlockedReason})</span>
            </span>
          )}
        </div>
      </div>

      {/* A second active deal on one lead is almost always a mistake. */}
      {data.hasActiveDeal && data.activeDealNumber && (
        <p
          role="status"
          className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span>
            This lead already has an open deal ({data.activeDealNumber}). Continue that one rather than
            starting a second, unless the customer is genuinely buying another vehicle.
          </span>
        </p>
      )}

      {data.deals === null ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          The sales information couldn&apos;t be loaded. Refresh the page to try again.
        </p>
      ) : data.deals.length === 0 ? (
        <div className="border-border flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-10 text-center">
          <Handshake className="text-text-subtle size-6" aria-hidden="true" />
          <p className="text-body-sm text-text-primary">No deal from this lead yet</p>
          <p className="text-caption text-text-subtle max-w-sm">
            {createBlockedReason === null
              ? "Create one and it appears here, keeping the customer, vehicle and lead together."
              : "Deals created from this lead appear here."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.deals.map((deal) => (
            <LeadDealCard key={deal.id} deal={deal} onUnlink={canLink ? setUnlinkTarget : undefined} />
          ))}
        </div>
      )}

      {linkOpen && (
        <LinkDealDialog
          leadId={leadId}
          customerId={customerId}
          onClose={() => setLinkOpen(false)}
          onLinked={() => {
            setLinkOpen(false);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={unlinkTarget !== null}
        onClose={() => setUnlinkTarget(null)}
        onConfirm={() => void handleUnlink()}
        isLoading={isUnlinking}
        title={unlinkTarget ? `Unlink ${unlinkTarget.deal_number} from this lead?` : "Unlink this deal?"}
        description="The deal keeps all its own information — only the link to this lead is removed. Both records log the change."
        confirmLabel="Unlink deal"
      />
    </div>
  );
}