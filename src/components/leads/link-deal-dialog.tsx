"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2 } from "lucide-react";

import { Modal } from "@/src/components/ui/modal";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { SalesStatusBadge } from "@/src/components/sales/sales-status-badge";
import { formatDay } from "@/src/lib/utils/test-drive-format";

import { getLinkableDealsAction, linkDealToLeadAction } from "@/app/admin/leads/[id]/sales-actions";
import type { LinkableDealOption } from "@/src/lib/types/lead-sales";

interface LinkDealDialogProps {
  leadId: string;
  customerId: string;
  onClose: () => void;
  onLinked: () => void;
}

const OPTION_CLASS =
  "border-border bg-card hover:border-primary/40 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-primary flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2";

/**
 * Links a deal that already exists to this lead.
 *
 * Only the customer's own unlinked deals are offered. A deal that belongs to
 * another lead is never listed, because moving it would rewrite that lead's
 * history. The database checks all of this again before it writes.
 */
export function LinkDealDialog({ leadId, customerId, onClose, onLinked }: LinkDealDialogProps) {
  const [deals, setDeals] = useState<LinkableDealOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;

    void getLinkableDealsAction(leadId, customerId)
      .then((result) => {
        if (!active) return;

        if (result === null) {
          setFailed(true);
          setDeals([]);
          return;
        }

        setDeals(result);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setDeals([]);
        }
      });

    return () => {
      active = false;
    };
  }, [leadId, customerId]);

  const handleLink = async () => {
    if (!selected) return;

    setIsSaving(true);

    try {
      const result = await linkDealToLeadAction({ leadId, dealId: selected });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`Deal ${result.dealNumber ?? ""} linked to this lead.`.replace("  ", " "));
      onLinked();
    } catch {
      toast.error("The deal couldn't be linked. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title="Link an existing deal"
      description="Only this customer's deals that aren't already linked to a lead can be chosen."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleLink()}
            isLoading={isSaving}
            disabled={!selected}
            leftIcon={<Link2 className="size-4" />}
          >
            Link deal
          </Button>
        </>
      }
    >
      {deals === null ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading deals">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : failed ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          The customer&apos;s deals couldn&apos;t be loaded. Close this and try again.
        </p>
      ) : deals.length === 0 ? (
        <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-8 text-center">
          This customer has no unlinked deals. Create a deal from this lead instead, so the link is made
          automatically.
        </p>
      ) : (
        <fieldset className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          <legend className="sr-only">Choose a deal to link</legend>

          {deals.map((deal) => (
            <label key={deal.id} className={OPTION_CLASS}>
              <input
                type="radio"
                name="link-deal"
                checked={selected === deal.id}
                onChange={() => setSelected(deal.id)}
                className="accent-primary mt-1 size-4"
              />

              <span className="min-w-0 flex-1">
                <span className="text-body-sm text-text-primary flex flex-wrap items-center gap-2 font-medium">
                  {deal.deal_number}
                  <SalesStatusBadge status={deal.status} size="sm" />
                </span>

                <span className="text-caption text-text-subtle mt-0.5 block truncate">
                  {deal.vehicle_title} · {deal.stock_id} · {deal.owner_name?.trim() || "No owner"} · created{" "}
                  {formatDay(deal.created_at)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </Modal>
  );
}