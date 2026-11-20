"use client";

import { useState } from "react";
import { Archive, Download, Flag, ShieldAlert, UserCog, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { BulkActionBar } from "@/src/components/shared/bulk-action-bar";
import { DataTable } from "@/src/components/shared/data-table/data-table";
import { TableCustomizer } from "@/src/components/shared/data-table/table-customizer";
import { SelectActionDialog } from "@/src/components/shared/select-action-dialog";

import {
  CUSTOMIZABLE_ENQUIRY_COLUMNS,
  DEFAULT_ENQUIRY_COLUMN_ORDER,
  DEFAULT_ENQUIRY_COLUMN_VISIBILITY,
  getEnquiryColumns,
  type EnquiryRowAction,
} from "@/src/components/enquiries/enquiry-columns";

import {
  bulkArchiveEnquiriesAction,
  bulkAssignEnquiriesAction,
  bulkSetEnquiryPriorityAction,
  bulkSetEnquiryStatusAction,
} from "@/app/admin/enquiries/actions";
import { useTablePreferences } from "@/src/hooks/use-table-preferences";
import { ENQUIRY_PRIORITIES, type EnquiryBulkResult, type EnquiryListRow } from "@/src/lib/types/enquiry";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";
import { triggerDownloadFromUrl } from "@/src/lib/utils/trigger-download";

/* =========================================================
   TYPES
========================================================= */

interface EnquiryTableProps {
  rows: EnquiryListRow[];
  currentUserId: string;
  canManage: boolean;
  /** enquiries.export, which is separate from being able to manage. */
  canExport: boolean;
  /** The row with an action in flight, if any. */
  busyId: string | null;
  onRowAction: (row: EnquiryListRow, action: EnquiryRowAction) => void;
  rowSelection: Record<string, boolean>;
  onRowSelectionChange: (selection: Record<string, boolean>) => void;
  staff: { id: string; full_name: string }[];
  /** Re-reads the list once something has changed. */
  onChanged: () => void;
}

/* =========================================================
   COMPONENT
========================================================= */

/**
 * The enquiry list as a table.
 *
 * Shown from the large breakpoint up; below that the same rows are cards,
 * because thirteen columns on a phone is a horizontal scrollbar nobody uses.
 * Both read the same data and offer the same actions.
 */
export function EnquiryTable({
  rows,
  currentUserId,
  canManage,
  canExport,
  busyId,
  onRowAction,
  rowSelection,
  onRowSelectionChange,
  staff,
  onChanged,
}: EnquiryTableProps) {
  const { columnVisibility, setColumnVisibility, columnOrder, setColumnOrder, reset, isHydrated } =
    useTablePreferences("omc-enquiries-table", {
      columnVisibility: DEFAULT_ENQUIRY_COLUMN_VISIBILITY,
      columnOrder: DEFAULT_ENQUIRY_COLUMN_ORDER,
      sorting: [],
    });

  const [assigning, setAssigning] = useState(false);
  const [running, setRunning] = useState(false);

  /*
   * Only rows on this page count. A tick made on page 2 can't linger after
   * paging back, and acting on an id that is no longer on screen is how
   * somebody marks an enquiry they can't see.
   */
  const selectedIds = rows.filter((row) => rowSelection[row.id]).map((row) => row.id);

  /*
   * Excel for a selection: somebody ticking rows is pulling a working list
   * together, and a spreadsheet is what gets worked from. The PDF scopes
   * live on the header menu.
   */
  const exportSelection = async () => {
    try {
      const params = new URLSearchParams({
        format: "excel",
        scope: "selected",
        ids: selectedIds.join(","),
      });

      const result = await triggerDownloadFromUrl(`/admin/enquiries/export?${params.toString()}`);

      if (result.error) throw new Error(result.error);

      toast.success("Excel export started");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Unable to export enquiries");
    }
  };

  const [prioritising, setPrioritising] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const columns = getEnquiryColumns({ currentUserId, canManage, busyId, onAction: onRowAction });

  /* =======================================================
     BULK

     Every bulk call reports how many it actually changed, because the
     workflow legitimately refuses some rows — already converted, already
     spam — and saying "done" over the top of that would be a lie.
  ======================================================= */

  const report = (result: EnquiryBulkResult, verb: string) => {
    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.done === 0) {
      toast.error(result.firstProblem ?? `Nothing could be ${verb}.`);
      return;
    }

    if (result.skipped > 0) {
      toast.warning(`${result.done} ${verb}, ${result.skipped} skipped. ${result.firstProblem ?? ""}`.trim());
    } else {
      toast.success(`${result.done} ${verb}.`);
    }

    onRowSelectionChange({});
    onChanged();
  };

  const run = async (work: () => Promise<EnquiryBulkResult>, verb: string) => {
    setRunning(true);

    try {
      report(await work(), verb);
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setRunning(false);
    }
  };

  const bulkActions = canManage
    ? [
        {
          label: "Take these on",
          icon: UserPlus,
          disabled: running,
          onClick: () =>
            void run(
              () => bulkAssignEnquiriesAction({ ids: selectedIds, assignedTo: currentUserId, reason: "" }),
              "taken on",
            ),
        },
        {
          label: "Assign staff",
          icon: UserCog,
          disabled: running || staff.length === 0,
          onClick: () => setAssigning(true),
        },
        ...(canExport
          ? [
              {
                label: "Export selection",
                icon: Download,
                disabled: running,
                onClick: () => void exportSelection(),
              },
            ]
          : []),
        {
          label: "Set priority",
          icon: Flag,
          disabled: running,
          onClick: () => setPrioritising(true),
        },
        {
          label: "Archive",
          icon: Archive,
          disabled: running,
          onClick: () => setArchiving(true),
        },
        {
          label: "Mark as spam",
          icon: ShieldAlert,
          variant: "destructive" as const,
          disabled: running,
          onClick: () =>
            void run(
              () => bulkSetEnquiryStatusAction({ ids: selectedIds, status: "Spam", reason: "" }),
              "moved to Spam",
            ),
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <TableCustomizer
          columns={CUSTOMIZABLE_ENQUIRY_COLUMNS}
          visibility={columnVisibility}
          onVisibilityChange={(id, visible) => setColumnVisibility({ ...columnVisibility, [id]: visible })}
          onReset={reset}
        />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        enableRowSelection={canManage}
        rowSelection={rowSelection}
        onRowSelectionChange={onRowSelectionChange}
        columnVisibility={isHydrated ? columnVisibility : DEFAULT_ENQUIRY_COLUMN_VISIBILITY}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={isHydrated ? columnOrder : DEFAULT_ENQUIRY_COLUMN_ORDER}
        onColumnOrderChange={setColumnOrder}
        enableColumnResizing
        ariaLabel="Enquiries table"
      />

      <BulkActionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => onRowSelectionChange({})}
        actions={bulkActions}
      />

      <SelectActionDialog
        isOpen={assigning}
        onClose={() => setAssigning(false)}
        title="Assign these enquiries"
        description={`${selectedIds.length} ${selectedIds.length === 1 ? "enquiry" : "enquiries"} will be handed to the person you pick. Any that are already closed are left alone.`}
        selectLabel="Who should handle them"
        options={staff.map((person) => ({ value: person.id, label: person.full_name }))}
        confirmLabel="Assign"
        onConfirm={async (value) => {
          setAssigning(false);
          await run(
            () => bulkAssignEnquiriesAction({ ids: selectedIds, assignedTo: value, reason: "" }),
            "assigned",
          );
        }}
      />

      <SelectActionDialog
        isOpen={prioritising}
        onClose={() => setPrioritising(false)}
        title="Set the priority"
        description={`${selectedIds.length} ${selectedIds.length === 1 ? "enquiry" : "enquiries"} will be set to the priority you pick.`}
        selectLabel="Priority"
        options={ENQUIRY_PRIORITIES.map((value) => ({ value, label: value }))}
        confirmLabel="Set priority"
        onConfirm={async (value) => {
          setPrioritising(false);
          await run(() => bulkSetEnquiryPriorityAction({ ids: selectedIds, priority: value }), "updated");
        }}
      />

      {/*
        Archiving is reversible but it takes rows off everybody's list, so a
        hundred at once is worth one confirmation.
      */}
      <ConfirmDialog
        isOpen={archiving}
        onClose={() => setArchiving(false)}
        onConfirm={() => {
          setArchiving(false);
          void run(() => bulkArchiveEnquiriesAction({ ids: selectedIds, archived: true }), "archived");
        }}
        title="Archive these enquiries?"
        description={`${selectedIds.length} ${selectedIds.length === 1 ? "enquiry" : "enquiries"} will come off the lists, counts and dashboard. Nothing is deleted, and they can be restored.`}
        confirmLabel="Archive"
        isLoading={running}
      />
    </div>
  );
}
