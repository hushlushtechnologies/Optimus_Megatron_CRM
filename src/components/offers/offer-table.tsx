"use client";

import { useState } from "react";
import { Archive, Pause, Play } from "lucide-react";
import { toast } from "sonner";

import { BulkActionBar } from "@/src/components/shared/bulk-action-bar";
import { DataTable } from "@/src/components/shared/data-table/data-table";
import { TableCustomizer } from "@/src/components/shared/data-table/table-customizer";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";

import {
  CUSTOMIZABLE_OFFER_COLUMNS,
  DEFAULT_OFFER_COLUMN_ORDER,
  DEFAULT_OFFER_COLUMN_VISIBILITY,
  getOfferColumns,
  type OfferRowAction,
} from "@/src/components/offers/offer-columns";

import {
  bulkArchiveOffersAction,
  bulkSetOfferStatusAction,
  type OfferBulkResult,
} from "@/app/admin/offers/actions";
import { useTablePreferences } from "@/src/hooks/use-table-preferences";
import type { OfferListRow } from "@/src/lib/types/offer-list";

/* =========================================================
   TYPES
========================================================= */

interface OfferTableProps {
  rows: OfferListRow[];
  canManage: boolean;
  canPublish: boolean;
  /** The row with an action in flight, if any. */
  busyId: string | null;
  onRowAction: (row: OfferListRow, action: OfferRowAction) => void;
  rowSelection: Record<string, boolean>;
  onRowSelectionChange: (selection: Record<string, boolean>) => void;
  /** Re-reads the list once something has changed. */
  onChanged: () => void;
}

/* =========================================================
   COMPONENT
========================================================= */

/**
 * The campaign list as a table.
 *
 * Shown from the large breakpoint up; below that the same rows are cards,
 * because thirteen columns on a phone is a horizontal scrollbar nobody uses.
 */
export function OfferTable({
  rows,
  canManage,
  canPublish,
  busyId,
  onRowAction,
  rowSelection,
  onRowSelectionChange,
  onChanged,
}: OfferTableProps) {
  const { columnVisibility, setColumnVisibility, columnOrder, setColumnOrder, reset, isHydrated } =
    useTablePreferences("omc-offers-table", {
      columnVisibility: DEFAULT_OFFER_COLUMN_VISIBILITY,
      columnOrder: DEFAULT_OFFER_COLUMN_ORDER,
      sorting: [],
    });

  const [running, setRunning] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [pausing, setPausing] = useState(false);

  /*
   * Only rows on this page count. A tick made on page 2 can't linger after
   * paging back, and acting on an id that is no longer on screen is how
   * somebody pauses a campaign they can't see.
   */
  const selected = rows.filter((row) => rowSelection[row.id]);
  const selectedIds = selected.map((row) => row.id);

  /*
   * What the selection can actually have done to it.
   *
   * A mixed selection is normal — somebody ticks six rows without checking
   * each status — so the bar offers what applies to any of them and the
   * server refuses the rest row by row. The counts here are what the
   * confirmation says, so the person knows before clicking that four of
   * their six will be skipped.
   */
  const pausableCount = selected.filter((row) => row.status === "active").length;
  const resumableCount = selected.filter((row) => row.status === "paused").length;

  const columns = getOfferColumns({ canManage, canPublish, busyId, onAction: onRowAction });

  /* =======================================================
     BULK

     Every bulk call reports how many it actually changed, because the
     lifecycle legitimately refuses some rows — a draft can't be paused, an
     expired campaign can't be resumed — and saying "done" over the top of
     that would be a lie.
  ======================================================= */

  const report = (result: OfferBulkResult, verb: string) => {
    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.done === 0) {
      toast.error(result.firstProblem ?? `Nothing could be ${verb}.`);
      return;
    }

    if (result.skipped > 0) {
      toast.warning(
        `${result.done} ${verb}, ${result.skipped} skipped. ${result.firstProblem ?? ""}`.trim(),
      );
    } else {
      toast.success(`${result.done} ${verb}.`);
    }

    onRowSelectionChange({});
    onChanged();
  };

  const run = async (work: () => Promise<OfferBulkResult>, verb: string) => {
    setRunning(true);

    try {
      report(await work(), verb);
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setRunning(false);
    }
  };

  const bulkActions = canPublish
    ? [
        {
          label: "Pause",
          icon: Pause,
          disabled: running || pausableCount === 0,
          onClick: () => setPausing(true),
        },
        {
          label: "Resume",
          icon: Play,
          disabled: running || resumableCount === 0,
          onClick: () =>
            void run(
              () => bulkSetOfferStatusAction({ ids: selectedIds, status: "active", reason: "" }),
              "resumed",
            ),
        },
        {
          label: "Archive",
          icon: Archive,
          variant: "destructive" as const,
          disabled: running,
          onClick: () => setArchiving(true),
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <TableCustomizer
          columns={CUSTOMIZABLE_OFFER_COLUMNS}
          visibility={columnVisibility}
          onVisibilityChange={(id, visible) =>
            setColumnVisibility({ ...columnVisibility, [id]: visible })
          }
          onReset={reset}
        />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        enableRowSelection={canPublish || canManage}
        rowSelection={rowSelection}
        onRowSelectionChange={onRowSelectionChange}
        columnVisibility={isHydrated ? columnVisibility : DEFAULT_OFFER_COLUMN_VISIBILITY}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={isHydrated ? columnOrder : DEFAULT_OFFER_COLUMN_ORDER}
        onColumnOrderChange={setColumnOrder}
        enableColumnResizing
        ariaLabel="Campaigns table"
      />

      <BulkActionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => onRowSelectionChange({})}
        actions={bulkActions}
      />

      {/*
        Pausing asks, because it stops a discount customers may be part-way
        through using, and the count tells the person what will actually
        happen to a mixed selection before they commit to it.
      */}
      <ConfirmDialog
        isOpen={pausing}
        onClose={() => setPausing(false)}
        onConfirm={() => {
          setPausing(false);
          void run(
            () => bulkSetOfferStatusAction({ ids: selectedIds, status: "paused", reason: "" }),
            "paused",
          );
        }}
        title="Pause these campaigns?"
        description={
          pausableCount === selectedIds.length
            ? `${pausableCount} ${pausableCount === 1 ? "campaign" : "campaigns"} will stop applying straight away. Nothing already sold is affected, and you can resume them.`
            : `${pausableCount} of the ${selectedIds.length} selected will be paused. The rest aren't running, so there's nothing to pause. Nothing already sold is affected.`
        }
        confirmLabel="Pause"
        isLoading={running}
      />

      <ConfirmDialog
        isOpen={archiving}
        onClose={() => setArchiving(false)}
        onConfirm={() => {
          setArchiving(false);
          void run(() => bulkArchiveOffersAction({ ids: selectedIds, archived: true }), "archived");
        }}
        title="Archive these campaigns?"
        description={`${selectedIds.length} ${selectedIds.length === 1 ? "campaign" : "campaigns"} will come off the lists and stop applying to new deals. Completed sales keep the discount they were given, nothing is deleted, and they can be restored.`}
        confirmLabel="Archive"
        variant="danger"
        isLoading={running}
      />
    </div>
  );
}
