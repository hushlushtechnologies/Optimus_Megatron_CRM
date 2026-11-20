"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Link2Off, TriangleAlert } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Combobox, type ComboboxOption } from "@/src/components/ui/combobox";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";

import { matchDreamCarAction, searchStockForMatchAction } from "@/app/admin/enquiries/work-actions";
import type { EnquiryStockCar, EnquiryStockMatchOption } from "@/src/lib/types/enquiry-details";
import { formatMoney } from "@/src/lib/utils/sales-format";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";

interface EnquiryDreamCarMatchProps {
  enquiryId: string;
  /** The car already linked, read live from stock. Null when none is. */
  matched: EnquiryStockCar | null;
  matchedAt: string | null;
  canManage: boolean;
}

/**
 * Linking a car in stock to a dream-car brief.
 *
 * A person picks the car. Nothing here suggests one: matching a brief to
 * stock on brand and budget alone looks plausible in a demo and produces
 * phone calls about cars the customer didn't ask for. What it records is who
 * decided and when, so a match can be questioned later.
 */
export function EnquiryDreamCarMatch({
  enquiryId,
  matched,
  matchedAt,
  canManage,
}: EnquiryDreamCarMatchProps) {
  const router = useRouter();

  const [cars, setCars] = useState<EnquiryStockMatchOption[] | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /* Separate from `clearing`: one is the dialog, the other the request. */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* The stock list is only needed by someone who can actually link a car. */
  useEffect(() => {
    if (!canManage) return;

    let live = true;

    searchStockForMatchAction()
      .then((rows) => {
        if (live) setCars(rows);
      })
      .catch(() => {
        if (live) setCars([]);
      });

    return () => {
      live = false;
    };
  }, [canManage]);

  const options: ComboboxOption[] = (cars ?? []).map((car) => ({
    id: car.id,
    /* Stock number disambiguates two of the same car; status warns. */
    label: [car.title, car.stockId, car.availability].filter(Boolean).join(" · "),
  }));

  const link = async (carId: string | null) => {
    setError(null);

    if (carId === null) setClearing(true);
    else setSaving(true);

    try {
      const result = await matchDreamCarAction({ enquiryId, carId });

      if (result.error) {
        setError(result.error);
        return;
      }

      toast.success(carId === null ? "Link removed." : "Car linked to this request.");
      setChoice(null);
      setConfirmOpen(false);
      router.refresh();
    } catch {
      setError("Something went wrong. Refresh the page and try again.");
    } finally {
      setSaving(false);
      setClearing(false);
    }
  };

  return (
    <div className="border-border flex flex-col gap-3 border-t pt-4">
      <p className="text-label">Car linked to this request</p>

      {matched ? (
        <div className="bg-card-hover flex flex-wrap items-start justify-between gap-3 rounded-md px-3 py-2.5">
          <div className="min-w-0">
            {/* Button has no asChild, so a navigation is a styled Link. */}
            <Link
              href={`/admin/inventory/${matched.id}`}
              className="text-body-sm text-primary-text font-medium hover:underline"
            >
              {matched.title}
            </Link>

            <p className="text-caption text-text-muted mt-0.5">
              {[
                matched.stockId,
                matched.listedPrice === null ? null : formatMoney(matched.listedPrice),
                matched.locationName,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            {matchedAt && (
              <p className="text-caption text-text-subtle mt-0.5">Linked {formatDateTimeFull(matchedAt)}</p>
            )}
          </div>

          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmOpen(true)}
              leftIcon={<Link2Off className="size-4" aria-hidden="true" />}
            >
              Unlink
            </Button>
          )}
        </div>
      ) : canManage ? (
        <div className="flex flex-col gap-3">
          <Combobox
            label="Pick a car from stock"
            value={choice}
            onChange={setChoice}
            options={options}
            disabled={cars === null}
            disabledHint="Loading stock…"
            placeholder="Search by name or stock number…"
          />

          <div>
            <Button
              size="sm"
              onClick={() => void link(choice)}
              isLoading={saving}
              disabled={choice === null || saving}
              leftIcon={<Link2 className="size-4" aria-hidden="true" />}
            >
              Link this car
            </Button>
          </div>

          <p className="text-caption text-text-subtle">
            Sold and reserved cars are listed too, with their status — worth knowing when the brief can&apos;t
            be met from what&apos;s on the floor.
          </p>
        </div>
      ) : (
        <p className="text-body-sm text-text-subtle">
          No car has been linked yet. Matching is done by a person, not automatically.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="text-body-sm text-text-primary border-danger/40 bg-danger/10 flex items-start gap-2 rounded-md border px-3 py-2.5"
        >
          <TriangleAlert className="text-danger mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <ConfirmDialog
        isOpen={confirmOpen && matched !== null}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void link(null)}
        title="Remove this link?"
        description="The brief stays as it is. Only the link to the car in stock goes."
        confirmLabel="Remove link"
        variant="danger"
        isLoading={clearing}
      />
    </div>
  );
}
