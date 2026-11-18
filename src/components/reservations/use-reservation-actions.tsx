"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ReservationActionDialog } from "@/src/components/reservations/reservation-action-dialog";
import type {
  ReservationActionKind,
  ReservationListRow,
  ReservationSettings,
} from "@/src/lib/types/reservations";

/** Opens the right dialog for a requested step. After success it refreshes, or goes to the deal after Create deal. */
export function useReservationActions(settings: ReservationSettings | null): {
  request: (kind: ReservationActionKind, row: ReservationListRow) => void;
  dialogs: ReactNode;
} {
  const router = useRouter();
  const [open, setOpen] = useState<{ kind: ReservationActionKind; row: ReservationListRow } | null>(null);

  const dialogs = open ? (
    <ReservationActionDialog
      key={`${open.kind}:${open.row.id}`}
      kind={open.kind}
      row={open.row}
      settings={settings}
      onClose={() => setOpen(null)}
      onDone={(result) => {
        setOpen(null);
        if (result.dealId) router.push(`/admin/sales/${result.dealId}`);
        else router.refresh();
      }}
    />
  ) : null;

  return { request: (kind, row) => setOpen({ kind, row }), dialogs };
}
