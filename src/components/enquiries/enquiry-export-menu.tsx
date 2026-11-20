"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/ui/modal";
import { Select } from "@/src/components/ui/select";

import { triggerDownloadFromUrl } from "@/src/lib/utils/trigger-download";
import type { EnquiryTab } from "@/src/lib/types/enquiry";

interface EnquiryExportMenuProps {
  tab: EnquiryTab;
  search: string;
  /** The type tab in use, or "" on All. */
  enquiryType: string;
}

type Scope = "current" | "type";

/**
 * Downloading the list, as PDF or Excel.
 *
 * Two scopes here. Exporting the ticked rows is the third, and it lives on
 * the bulk bar instead, because that is where a selection exists — a button
 * up here saying "selected" when nothing is ticked would be a dead control
 * most of the time.
 *
 * The current scope passes the live query string straight through — which
 * is why the filters are not a prop here. The route parses them with the
 * same parser the page used, so the file holds the rows on screen rather
 * than a second interpretation of the same filters.
 */
export function EnquiryExportMenu({ tab, search, enquiryType }: EnquiryExportMenuProps) {
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("current");
  const [busy, setBusy] = useState(false);

  const download = async (format: "pdf" | "excel") => {
    setBusy(true);

    try {
      const params = new URLSearchParams(searchParams.toString());

      /* Paging is about the screen, not about the file. */
      params.delete("page");
      params.delete("pageSize");

      params.set("format", format);
      params.set("scope", scope);
      params.set("tab", tab);

      if (search) params.set("q", search);

      if (scope === "type") params.set("type", enquiryType);

      const result = await triggerDownloadFromUrl(`/admin/enquiries/export?${params.toString()}`);

      if (result.error) throw new Error(result.error);

      toast.success(format === "pdf" ? "PDF export started" : "Excel export started");
      setOpen(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Unable to export enquiries");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="min-h-11"
        onClick={() => {
          /* On the All tab there is no single type to offer. */
          setScope(enquiryType ? "type" : "current");
          setOpen(true);
        }}
        leftIcon={<Download className="size-4" aria-hidden="true" />}
      >
        Export
      </Button>

      <Modal
        isOpen={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        size="sm"
        title="Export enquiries"
        description="The file holds customer contact details, so keep it internal."
      >
        <div className="flex flex-col gap-4">
          <Select
            label="What to include"
            value={scope}
            onChange={(event) => setScope(event.target.value as Scope)}
            options={[
              { value: "current", label: "Everything matching the current filters" },
              ...(enquiryType ? [{ value: "type", label: `Every ${enquiryType} enquiry` }] : []),
            ]}
            hint={enquiryType ? undefined : "Pick a type tab first to export one type on its own."}
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              variant="outline"
              disabled={busy}
              onClick={() => void download("excel")}
              leftIcon={<FileSpreadsheet className="size-4" aria-hidden="true" />}
            >
              Excel
            </Button>

            <Button
              className="flex-1"
              variant="outline"
              disabled={busy}
              onClick={() => void download("pdf")}
              leftIcon={<FileText className="size-4" aria-hidden="true" />}
            >
              PDF
            </Button>
          </div>

          <p className="text-caption text-text-subtle">Up to 2,000 enquiries per file, newest first.</p>
        </div>
      </Modal>
    </>
  );
}
