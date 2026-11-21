"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Check, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { Spinner } from "@/src/components/ui/spinner";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";
import { EmptyState } from "@/src/components/shared/empty-state";

import { DateRangeControl } from "@/src/components/offers/date-range-control";
import {
  assignOfferToCustomerAction,
  cancelAssignmentAction,
  searchAssignCustomersAction,
} from "@/app/admin/offers/actions";
import type { AssignCustomerOption } from "@/src/lib/supabase/offer-queries";
import type { OfferAssignment, OfferDetail } from "@/src/lib/types/offer-detail";
import { cn } from "@/src/lib/utils/cn";
import { formatFils } from "@/src/lib/utils/sales-money";
import { formatDay } from "@/src/lib/utils/test-drive-format";

/*
|--------------------------------------------------------------------------
| PRIVATE OFFERS (Phase 10)
|--------------------------------------------------------------------------
|
| "Customer Ahmed — Ferrari 296 GTB — exclusive AED 25,000 discount. Other
| customers cannot use this offer."
|
| An assignment row, not a copy of the campaign and not a flag on the
| customer profile. The profile is untouched: nothing here duplicates it,
| and the customer's own record gains no offer columns.
|
| Exclusivity is not enforced by hiding a button. The rules engine only
| treats a customer-type campaign as available to somebody holding an
| assignment for it, so a customer who was never assigned one cannot
| receive it even if they somehow quote it.
*/

const STATUS_TONE: Record<OfferAssignment["status"], "success" | "info" | "neutral" | "danger"> = {
  active: "success",
  used: "info",
  expired: "neutral",
  cancelled: "danger",
};

const STATUS_LABEL: Record<OfferAssignment["status"], string> = {
  active: "Active",
  used: "Used",
  expired: "Expired",
  cancelled: "Cancelled",
};

interface OfferAssignmentsTabProps {
  detail: OfferDetail;
  canAssign: boolean;
}

export function OfferAssignmentsTab({ detail, canAssign }: OfferAssignmentsTabProps) {
  const router = useRouter();

  const [assigning, setAssigning] = useState(false);
  const [cancelling, setCancelling] = useState<OfferAssignment | null>(null);
  const [busy, setBusy] = useState(false);

  /* ---- The assign form ---- */

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<AssignCustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<AssignCustomerOption | null>(null);
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [override, setOverride] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setTerm("");
    setResults([]);
    setChosen(null);
    setValidFrom("");
    setValidTo("");
    setOverride("");
    setNotes("");
  };

  /* Every setState inside the timer, per react-hooks/set-state-in-effect. */
  useEffect(() => {
    if (!assigning) return;

    const trimmed = term.trim();

    const timer = window.setTimeout(() => {
      if (trimmed.length < 2) {
        setResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);

      void (async () => {
        try {
          const result = await searchAssignCustomersAction({ term: trimmed });
          setResults(result.customers);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [term, assigning]);

  const datesBackwards = Boolean(validFrom && validTo && validTo <= validFrom);

  const submit = async () => {
    if (!chosen || datesBackwards) return;

    setBusy(true);

    try {
      const result = await assignOfferToCustomerAction({
        promotionId: detail.id,
        customerId: chosen.id,
        carId: "",
        validFrom,
        validTo,
        discountOverride: override,
        notes,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`${chosen.name} now holds this offer.`);
      setAssigning(false);
      reset();
      router.refresh();
    } catch {
      toast.error("Something went wrong. Nothing was assigned.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!cancelling) return;

    setBusy(true);

    try {
      const result = await cancelAssignmentAction({ id: cancelling.id, reason: "" });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Offer cancelled. The record stays on the customer's history.");
      setCancelling(null);
      router.refresh();
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const liveCount = useMemo(
    () => detail.assignments.filter((item) => item.status === "active").length,
    [detail.assignments],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-body text-text-primary font-medium">
            {detail.assignments.length === 0
              ? "Nobody holds this privately"
              : `${liveCount} active, ${detail.assignments.length} in total`}
          </p>

          <p className="text-body-sm text-text-muted mt-0.5 max-w-xl">
            An assigned offer is only usable by that customer. Anyone else quoting this campaign is
            refused.
          </p>
        </div>

        {canAssign && detail.archivedAt === null && (
          <Button
            variant="gradient"
            size="sm"
            leftIcon={<UserPlus className="size-4" aria-hidden="true" />}
            onClick={() => {
              reset();
              setAssigning(true);
            }}
          >
            Assign to a customer
          </Button>
        )}
      </div>

      {detail.assignments.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            icon="Users"
            title="No private offers"
            description="Assign this campaign to a specific customer and only they can use it."
            size="compact"
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {detail.assignments.map((assignment) => (
            <li
              key={assignment.id}
              className={cn(
                "surface-card flex flex-col gap-3 p-4",
                assignment.status === "cancelled" && "opacity-70",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/customers/${assignment.customerId}`}
                    className="text-body text-text-primary hover:text-primary-text font-medium"
                  >
                    {assignment.customerName ?? "Unknown customer"}
                  </Link>

                  <p className="text-body-sm text-text-muted mt-0.5">
                    {assignment.customerNumber ?? "No customer number"}
                    {assignment.customerStatus && ` · ${assignment.customerStatus}`}
                  </p>
                </div>

                <Badge status={STATUS_TONE[assignment.status]}>
                  {STATUS_LABEL[assignment.status]}
                </Badge>
              </div>

              <div className="text-body-sm text-text-muted flex flex-wrap gap-x-4 gap-y-1">
                {assignment.carTitle && (
                  <span className="text-text-primary">{assignment.carTitle}</span>
                )}

                {assignment.discountOverrideFils && (
                  <span className="text-text-primary font-medium">
                    {formatFils(BigInt(assignment.discountOverrideFils))} — their own figure
                  </span>
                )}

                {(assignment.validFrom || assignment.validTo) && (
                  <span>
                    {assignment.validFrom ? formatDay(assignment.validFrom) : "any time"} to{" "}
                    {assignment.validTo ? formatDay(assignment.validTo) : "the campaign's end"}
                  </span>
                )}

                {assignment.assignedByName && <span>by {assignment.assignedByName}</span>}
              </div>

              {assignment.notes && (
                <p className="text-body-sm text-text-muted border-border bg-card-hover/40 rounded-md border px-3 py-2">
                  {assignment.notes}
                </p>
              )}

              {canAssign && assignment.status === "active" && (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Ban className="size-3.5" aria-hidden="true" />}
                    onClick={() => setCancelling(assignment)}
                  >
                    Cancel this offer
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ===================================================
          ASSIGN
      =================================================== */}

      <Modal
        isOpen={assigning}
        onClose={() => setAssigning(false)}
        title="Assign this offer"
        size="lg"
      >
        <div className="flex flex-col gap-4">
          {chosen ? (
            <div className="border-primary/30 bg-primary/5 flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-body-sm text-text-primary font-medium">{chosen.name}</p>
                <p className="text-text-subtle text-xs">
                  {chosen.customerNumber ?? "No customer number"}
                  {chosen.lifecycleStatus && ` · ${chosen.lifecycleStatus}`}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setChosen(null)}
                className="text-text-muted hover:text-primary shrink-0 text-xs font-medium"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Input
                label="Find the customer"
                placeholder="Name, customer number, email or phone..."
                leftIcon={<Search className="text-text-subtle size-4" aria-hidden="true" />}
                value={term}
                onChange={(event) => setTerm(event.target.value)}
              />

              {searching && (
                <p className="text-body-sm text-text-subtle flex items-center gap-2 px-1">
                  <Spinner className="size-3.5" /> Searching...
                </p>
              )}

              {!searching && term.trim().length >= 2 && results.length === 0 && (
                <p className="text-body-sm text-text-subtle px-1">No customer matches that.</p>
              )}

              {results.length > 0 && (
                <ul className="border-border max-h-56 overflow-y-auto rounded-lg border">
                  {results.map((customer) => (
                    <li key={customer.id} className="border-border border-b last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setChosen(customer)}
                        className="hover:bg-card-hover flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors"
                      >
                        <span className="min-w-0">
                          <span className="text-body-sm text-text-primary block truncate">
                            {customer.name}
                          </span>
                          <span className="text-text-subtle block truncate text-xs">
                            {customer.customerNumber ?? "No customer number"}
                            {customer.lifecycleStatus && ` · ${customer.lifecycleStatus}`}
                          </span>
                        </span>

                        <Check className="text-text-subtle size-4 shrink-0" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/*
            The override is this customer's own figure, in dirhams. Blank
            means they get the campaign's discount — which is the common
            case, so it is not required.
          */}
          <Input
            label="Their own discount (AED)"
            type="number"
            min={0}
            step="0.01"
            value={override}
            onChange={(event) => setOverride(event.target.value)}
            hint="Leave blank to give them the campaign's normal discount."
          />

          <DateRangeControl
            startsAt={validFrom}
            endsAt={validTo}
            onStartChange={setValidFrom}
            onEndChange={setValidTo}
            startLabel="Valid from"
            endLabel="Valid until"
            error={datesBackwards ? "This is before the start." : undefined}
          />

          <p className="text-text-subtle -mt-2 text-xs">
            Leave both blank to follow the campaign&apos;s own dates.
          </p>

          <Input
            label="Note"
            placeholder="Agreed with the customer on the phone..."
            value={notes}
            maxLength={1000}
            onChange={(event) => setNotes(event.target.value)}
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAssigning(false)} disabled={busy}>
              Cancel
            </Button>

            <Button
              variant="gradient"
              onClick={() => void submit()}
              disabled={busy || !chosen || datesBackwards}
            >
              Assign
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={cancelling !== null}
        onClose={() => setCancelling(null)}
        onConfirm={() => void cancel()}
        title="Cancel this offer?"
        description={`${cancelling?.customerName ?? "This customer"} will no longer be able to use it. The record stays on their history, and you can assign it again later.`}
        confirmLabel="Cancel the offer"
        cancelLabel="Keep it"
        variant="danger"
        isLoading={busy}
      />
    </div>
  );
}
