"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/ui/modal";
import { Select } from "@/src/components/ui/select";

import { downloadExportFile } from "@/src/lib/utils/download-export-file";
import {
  OFFER_EXPORT_DATASETS,
  OFFER_EXPORT_HINTS,
  OFFER_EXPORT_LABELS,
  type OfferExportDataset,
} from "@/src/lib/types/offer-export";

/*
|--------------------------------------------------------------------------
| DOWNLOADING OFFERS AND LOYALTY DATA
|--------------------------------------------------------------------------
|
| Four datasets rather than four buttons. Eight controls — four datasets
| times two formats — on a toolbar that already holds search, filters and
| sort would be the busiest thing on the page, for something most people do
| once a month.
|
| Exporting the ticked rows is the fifth scope, and it lives on the bulk bar
| instead, because that is where a selection exists. A control up here
| saying "selected" would be dead most of the time.
|
| The campaigns export passes the live query string straight through, which
| is why the filters are not a prop. The route parses them with the same
| helpers the page used, so the file holds the rows on screen rather than a
| second interpretation of the same filters.
*/

/* Built from the shared lists, so a dataset cannot be added in one place
   and missed in the other. */
const DATASET_OPTIONS = OFFER_EXPORT_DATASETS.map((value) => ({
  value,
  label: OFFER_EXPORT_LABELS[value],
  hint: OFFER_EXPORT_HINTS[value],
}));

interface OfferExportMenuProps {
  /** Narrows redemptions, personalised offers and loyalty to one campaign. */
  promotionId?: string;
}

export function OfferExportMenu({ promotionId }: OfferExportMenuProps) {
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [dataset, setDataset] = useState<OfferExportDataset>("campaigns");
  const [busy, setBusy] = useState(false);

  const chosen = DATASET_OPTIONS.find((option) => option.value === dataset);

  const download = async (format: "pdf" | "excel") => {
    setBusy(true);

    try {
      const params = new URLSearchParams();

      if (dataset === "campaigns") {
        /* The live view, minus the things that are about the screen. */
        for (const [key, value] of searchParams.entries()) {
          params.set(key, value);
        }

        params.delete("page");
        params.delete("pageSize");
        params.delete("view");

        params.set("scope", "current");
      } else if (promotionId) {
        params.set("promotionId", promotionId);
      }

      params.set("dataset", dataset);
      params.set("format", format);

      const result = await downloadExportFile(`/admin/offers/export?${params.toString()}`);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      /*
       * A capped file is reported as a warning, not a success. The row cap
       * biting means the file is incomplete, and "Exported" would be a
       * misleading thing to say about financial data somebody is about to
       * reconcile.
       */
      if (result.truncated && result.total !== null) {
        toast.warning(
          `Exported ${result.count?.toLocaleString() ?? "some"} of ${result.total.toLocaleString()} rows — the cap was reached. Narrow the filters for the full set.`,
        );
      } else {
        toast.success(
          `${chosen?.label ?? "Export"} downloaded${
            result.count !== null ? ` — ${result.count.toLocaleString()} rows` : ""
          }.`,
        );
      }

      setOpen(false);
    } catch {
      toast.error("The export couldn't be created. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        leftIcon={<Download className="size-3.5" aria-hidden="true" />}
        onClick={() => setOpen(true)}
        className="h-11 shrink-0 rounded-lg px-3 text-xs font-medium sm:h-10"
      >
        Export
      </Button>

      <Modal
        isOpen={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Export offers data"
        description="Choose what to download, then pick a format."
        size="md"
      >
        <div className="flex flex-col gap-4">
          <Select
            label="What to export"
            value={dataset}
            onChange={(event) => setDataset(event.target.value as OfferExportDataset)}
            disabled={busy}
            options={DATASET_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            hint={chosen?.hint}
          />

          {dataset !== "campaigns" && !promotionId && (
            <p className="text-text-subtle text-xs">
              This covers every campaign. Open a single campaign to export just its own.
            </p>
          )}

          {dataset !== "campaigns" && (
            <p className="text-warning text-xs">
              Contains customer names. Internal use only.
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={busy}
              leftIcon={<FileText className="size-4" aria-hidden="true" />}
              onClick={() => download("pdf")}
            >
              PDF
            </Button>

            <Button
              disabled={busy}
              leftIcon={<FileSpreadsheet className="size-4" aria-hidden="true" />}
              onClick={() => download("excel")}
            >
              Excel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
