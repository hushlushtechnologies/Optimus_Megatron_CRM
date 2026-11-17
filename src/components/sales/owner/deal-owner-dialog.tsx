"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info, TriangleAlert } from "lucide-react";
import { Modal } from "@/src/components/ui/modal";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { Skeleton } from "@/src/components/ui/skeleton";
import { getOwnerCandidatesAction, reassignDealAction } from "@/app/admin/sales/owner-actions";
import type { OwnerCandidate } from "@/src/lib/types/sales-owner";
import type { SalesDealDetail } from "@/src/lib/types/sales-detail";
import { cn } from "@/src/lib/utils/cn";

type DealForOwner = Pick<
  SalesDealDetail,
  "id" | "deal_number" | "customer_name" | "vehicle_title" | "owner_id" | "owner_name" | "updated_at"
>;

interface DealOwnerDialogProps {
  deal: DealForOwner;
  onClose: () => void;
  onDone: () => void;
}

type CandidateState =
  { status: "loading" } | { status: "ok"; candidates: OwnerCandidate[] } | { status: "failed" };

// The parent mounts this only while it is open, so every opening reads fresh workloads and the deal's latest version.
export function DealOwnerDialog({ deal, onClose, onDone }: DealOwnerDialogProps) {
  const [state, setState] = useState<CandidateState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasOwner = !!deal.owner_id;

  useEffect(() => {
    let cancelled = false;

    getOwnerCandidatesAction(deal.id)
      .then((result) => {
        if (cancelled) return;
        setState(result.status === "ok" ? { status: "ok", candidates: result.candidates } : { status: "failed" });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "failed" });
      });

    return () => {
      cancelled = true;
    };
  }, [deal.id]);

  const others = state.status === "ok" ? state.candidates.filter((candidate) => !candidate.isCurrent) : [];
  const lightest = others.length >= 2 ? Math.min(...others.map((candidate) => candidate.openDeals)) : null;

  const reasonOk = !hasOwner || reason.trim().length >= 3;
  const canSubmit = !saving && !!selectedId && reasonOk;

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await reassignDealAction({
        id: deal.id,
        // Sent back exactly as it was read, so the database can tell if the deal changed meanwhile.
        expectedUpdatedAt: deal.updated_at,
        newOwnerId: selectedId,
        reason: reason.trim(),
      });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(hasOwner ? "Deal handed over" : "Owner assigned");
      onDone();
    } catch {
      const message = "Something went wrong. Refresh the page to see the deal's current owner.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!saving) onClose();
      }}
      size="md"
      title={hasOwner ? "Change owner" : "Assign owner"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button onClick={submit} isLoading={saving} disabled={!canSubmit}>
            {hasOwner ? "Hand over deal" : "Assign owner"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="border-border bg-card-hover/40 flex flex-col gap-1 rounded-md border p-3">
          <p className="text-caption text-text-subtle">{deal.deal_number}</p>
          <p className="text-text-primary font-medium">{deal.customer_name}</p>
          <p className="text-body-sm text-text-muted">{deal.vehicle_title}</p>
          <p className="text-caption text-text-subtle">
            Current owner: <span className="text-text-muted">{deal.owner_name ?? "None"}</span>
          </p>
        </div>

        {state.status === "loading" && (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading people">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {state.status === "failed" && (
          <p
            role="alert"
            className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
            The list of people couldn&apos;t be loaded, so changing the owner is paused. Close this and try again.
          </p>
        )}

        {state.status === "ok" && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label mb-1">Who should own this deal?</legend>
            {state.candidates.map((candidate) => {
              const isLightest = !candidate.isCurrent && lightest !== null && candidate.openDeals === lightest;
              return (
                <label
                  key={candidate.id}
                  className={cn(
                    "border-border bg-card hover:border-primary/40 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-primary flex min-h-11 items-start gap-3 rounded-md border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2",
                    candidate.isCurrent ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                  )}
                >
                  <input
                    type="radio"
                    name="deal-owner"
                    value={candidate.id}
                    disabled={candidate.isCurrent}
                    checked={selectedId === candidate.id}
                    onChange={() => {
                      setSelectedId(candidate.id);
                      setError(null);
                    }}
                    className="accent-primary mt-1 size-4"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-body-sm text-text-primary flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium">
                      {candidate.name}
                      {candidate.isCurrent && (
                        <span className="text-caption text-text-subtle font-normal">Current owner</span>
                      )}
                      {isLightest && (
                        <span className="bg-success/15 text-caption text-success rounded-full px-1.5 py-0.5 font-normal">
                          Lightest workload
                        </span>
                      )}
                    </span>
                    <span className="text-caption text-text-subtle block">
                      {candidate.openDeals} open {candidate.openDeals === 1 ? "deal" : "deals"} ·{" "}
                      {candidate.awaitingDelivery} awaiting delivery
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        <Textarea
          label={hasOwner ? "Why is it being handed over?" : "Note (optional)"}
          required={hasOwner}
          placeholder={hasOwner ? "For example: covering while they are on leave." : "Anything the new owner should know."}
          rows={3}
          maxLength={300}
          showCharacterCount
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
        />

        {hasOwner && (
          <p className="text-caption text-text-subtle flex items-start gap-2">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            The handover is recorded with your name and the reason. Someone who can only see their own deals stops seeing
            this one unless they created it.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}