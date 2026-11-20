"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gavel, Info, TriangleAlert } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { Textarea } from "@/src/components/ui/textarea";

import { saveEnquiryValuationAction } from "@/app/admin/enquiries/work-actions";
import { isOfferExpired, type EnquiryCustomerVehicle } from "@/src/lib/types/enquiry-details";
import { formatMoney } from "@/src/lib/utils/sales-format";
import { formatDateTimeFull, formatDay, getDubaiToday } from "@/src/lib/utils/test-drive-format";

interface EnquiryValuationFormProps {
  vehicle: EnquiryCustomerVehicle;
  /** Needs enquiries.valuate, which is not the same as enquiries.manage. */
  canValuate: boolean;
}

/**
 * What we think the car is worth, and what we would pay for it.
 *
 * Nothing here is calculated. There is no UAE market-value feed behind this
 * and no formula pretending to be one — it is a person's judgement after
 * seeing the car, with their name and the date attached so whoever reads it
 * next knows how old it is and who to ask.
 */
export function EnquiryValuationForm({ vehicle, canValuate }: EnquiryValuationFormProps) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [estimate, setEstimate] = useState("");
  const [offer, setOffer] = useState("");
  const [expires, setExpires] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const valued =
    vehicle.estimatedValue !== null || vehicle.proposedOffer !== null || vehicle.valuationNotes !== null;

  const expired = isOfferExpired(vehicle.offerExpiresAt);

  /*
   * Nothing valued and no permission to value it: an empty heading telling
   * somebody a thing hasn't happened, which they also can't make happen.
   */
  if (!valued && !canValuate) return null;

  /* Open with what is already saved, so revising doesn't mean retyping. */
  const start = () => {
    setEstimate(vehicle.estimatedValue === null ? "" : String(vehicle.estimatedValue));
    setOffer(vehicle.proposedOffer === null ? "" : String(vehicle.proposedOffer));
    setExpires(vehicle.offerExpiresAt ? vehicle.offerExpiresAt.slice(0, 10) : "");
    setNotes(vehicle.valuationNotes ?? "");
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    setError(null);
    setSaving(true);

    try {
      const result = await saveEnquiryValuationAction({
        vehicleId: vehicle.id,
        estimatedValue: estimate.trim() === "" ? null : Number(estimate),
        valuationNotes: notes,
        proposedOffer: offer.trim() === "" ? null : Number(offer),
        offerExpiresOn: expires,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.success("Valuation saved.");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Something went wrong. Refresh the page and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-border flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label">Our assessment</p>

          {valued ? (
            <div className="mt-1 flex flex-col gap-0.5">
              {vehicle.estimatedValue !== null && (
                <p className="text-body-sm text-text-primary">
                  Worth about <span className="font-medium">{formatMoney(vehicle.estimatedValue)}</span>
                </p>
              )}

              {vehicle.proposedOffer !== null && (
                <p className="text-body-sm text-text-primary">
                  Offering <span className="font-medium">{formatMoney(vehicle.proposedOffer)}</span>
                  {/*
                    Weight rather than colour for an expired offer: text-danger
                    is 3.44:1 on a light card, and this is information rather
                    than decoration. The word "expired" does the work anyway,
                    so nothing depends on seeing a colour.
                  */}
                  {vehicle.offerExpiresAt && (
                    <span className={expired ? "text-text-primary font-medium" : "text-text-muted"}>
                      {expired ? " · expired " : " · good until "}
                      {formatDay(vehicle.offerExpiresAt)}
                    </span>
                  )}
                </p>
              )}

              {vehicle.evaluatedAt && (
                <p className="text-caption text-text-subtle">
                  {vehicle.evaluatedByName ?? "Someone"} · {formatDateTimeFull(vehicle.evaluatedAt)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-body-sm text-text-subtle mt-1">Nobody has valued this car yet.</p>
          )}
        </div>

        {canValuate && (
          <Button
            size="sm"
            variant="outline"
            onClick={start}
            leftIcon={<Gavel className="size-4" aria-hidden="true" />}
          >
            {valued ? "Revise" : "Value it"}
          </Button>
        )}
      </div>

      {vehicle.valuationNotes && (
        <p className="text-body-sm text-text-muted break-words whitespace-pre-wrap">
          {vehicle.valuationNotes}
        </p>
      )}

      {/* Worth saying out loud rather than leaving somebody to read the date. */}
      {expired && (
        <p className="text-body-sm text-text-primary border-warning/30 bg-warning/10 flex items-start gap-2 rounded-md border px-3 py-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This offer has expired. Revise it before quoting the figure to the customer.
        </p>
      )}

      <Modal
        isOpen={open}
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        size="md"
        title="Value this car"
        description="Your judgement after seeing it. Nothing here is calculated."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Go back
            </Button>

            <Button onClick={() => void save()} isLoading={saving} disabled={saving}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {vehicle.askingPrice !== null && (
            <p className="text-body-sm text-text-muted bg-card-hover rounded-md px-3 py-2.5">
              They are asking{" "}
              <span className="text-text-primary font-medium">{formatMoney(vehicle.askingPrice)}</span>.
            </p>
          )}

          <Input
            label="What it is worth"
            type="number"
            inputMode="decimal"
            min={0}
            step={500}
            placeholder="AED"
            value={estimate}
            onChange={(event) => setEstimate(event.target.value)}
            hint="Your estimate of the car's value."
          />

          <Input
            label="What we would offer"
            type="number"
            inputMode="decimal"
            min={0}
            step={500}
            placeholder="AED"
            value={offer}
            onChange={(event) => setOffer(event.target.value)}
            hint="Usually below the estimate. Leave it blank until you are ready to quote a figure."
          />

          <Input
            label="Offer good until"
            type="date"
            min={getDubaiToday()}
            value={expires}
            onChange={(event) => setExpires(event.target.value)}
            hint="Needs an offer to expire."
          />

          <Textarea
            label="Notes"
            rows={3}
            maxLength={2000}
            showCharacterCount
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            hint="What you saw, and anything that moved the number either way."
          />

          <p className="text-caption text-text-subtle flex items-start gap-2">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Saving this tells the customer nothing. Quoting the offer is a separate conversation, and worth
            logging as contact once you have had it.
          </p>

          {error && (
            <p
              role="alert"
              className="text-body-sm text-text-primary border-danger/40 bg-danger/10 flex items-start gap-2 rounded-md border px-3 py-2.5"
            >
              <TriangleAlert className="text-danger mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
