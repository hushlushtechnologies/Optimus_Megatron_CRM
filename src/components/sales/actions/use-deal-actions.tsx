"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DealTransitionDialog } from "@/src/components/sales/actions/deal-transition-dialog";
import type { DealTransitionKind } from "@/src/lib/types/sales-actions";
import type { ReadinessGroup, SalesDealDetail } from "@/src/lib/types/sales-detail";

interface Options {
  deal: SalesDealDetail;
  readiness: ReadinessGroup[];
  holdConflict: string | null;
}

/** Opens the right dialog for a requested step, and refreshes the page after it succeeds. */
export function useDealActions({ deal, readiness, holdConflict }: Options): {
  request: (kind: DealTransitionKind) => void;
  dialogs: ReactNode;
} {
  const router = useRouter();
  const [open, setOpen] = useState<DealTransitionKind | null>(null);

  const dialogs = open ? (
    <DealTransitionDialog
      key={open}
      kind={open}
      deal={deal}
      readiness={readiness}
      holdConflict={holdConflict}
      onClose={() => setOpen(null)}
      onDone={() => {
        setOpen(null);
        router.refresh();
      }}
    />
  ) : null;

  return { request: setOpen, dialogs };
}
