"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/ui/modal";

import { downloadExportFile } from "@/src/lib/utils/download-export-file";
import { EXPORTABLE_SECTION_IDS } from "@/src/lib/types/report-export";

/*
|--------------------------------------------------------------------------
| DOWNLOADING THE REPORT ON SCREEN
|--------------------------------------------------------------------------
|
| One control in the reports layout rather than one per section. The thing
| being exported is always "the report you are looking at, as you have
| filtered it", so a per-section menu would be the same two buttons six
| times over, with six chances for one of them to fall behind.
|
| The section comes from the path and the filters from the live query
| string, both passed straight through. The route parses that query string
| with the same helpers the page used, so the file holds what the screen
| holds rather than a second interpretation of the same filters. Passing
| them as props would mean the parent re-rendering on every filter change
| just to keep a button honest.
*/

/** "/admin/reports/inventory" → "inventory". */
function sectionFromPath(pathname: string): string | null {
  const match = pathname.match(/\/admin\/reports\/([^/?#]+)/);
  return match ? match[1] : null;
}

export function ReportExportMenu() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const section = sectionFromPath(pathname ?? "");

  /*
   * Hidden rather than disabled on sections that cannot be exported yet.
   * A greyed-out button invites a click and then explains nothing; the
   * overview is a set of links into other reports, and there is no file
   * that would be the honest answer to exporting it.
   */
  if (!section || !(EXPORTABLE_SECTION_IDS as readonly string[]).includes(section)) {
    return null;
  }

  const download = async (format: "pdf" | "excel") => {
    setBusy(true);

    try {
      const params = new URLSearchParams();

      /* The live view, minus the parameters that are about the screen. */
      for (const [key, value] of searchParams.entries()) {
        params.set(key, value);
      }

      params.delete("page");
      params.delete("pageSize");
      params.delete("view");

      params.set("section", section);
      params.set("format", format);

      const result = await downloadExportFile(`/admin/reports/export?${params.toString()}`);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      /*
       * A capped file is reported as a warning, not a success.
       *
       * The cap biting means the file is incomplete, and "Exported" would
       * be a misleading thing to say about figures somebody is about to
       * put in front of a manager. The per-table counts are in the file;
       * what matters here is that the person knows before they send it on.
       */
      if (result.truncated) {
        toast.warning(
          "Exported, but some tables reached the row cap and are incomplete. They are marked in the file — narrow the period or filters for the full set.",
          { duration: 8000 },
        );
      } else {
        toast.success(
          `Report downloaded${result.count !== null ? ` — ${result.count.toLocaleString()} rows` : ""}.`,
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
        title="Export this report"
        description="The file covers the period and filters currently applied."
        size="md"
      >
        <div className="flex flex-col gap-4">
          <p className="text-text-subtle text-xs">
            Every figure carries its definition and what date it is counted by, so the
            file can be read on its own. Figures that couldn&apos;t be calculated are
            marked as such rather than shown as zero.
          </p>

          <p className="text-text-subtle text-xs">
            Excel gives one sheet per table and keeps Arabic names intact. The PDF is
            laid out to print.
          </p>

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
