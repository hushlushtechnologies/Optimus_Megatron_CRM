"use client";

import { BadgeCheck, Handshake, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { canTransitionDeal, type SalesDealStatus } from "@/src/lib/types/sales";
import type { DealTransitionKind } from "@/src/lib/types/sales-actions";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";

interface DealActionBarProps {
  status: SalesDealStatus;
  permissions: SalesPermissions;
  /** The deal is in negotiation and has an active, confirmed reservation linked to it. */
  canReserve: boolean;
  onRequest: (kind: DealTransitionKind) => void;
}

/** Shows only the steps this person may take on this deal right now. Renders nothing when there are none. */
export function DealActionBar({ status, permissions, canReserve, onRequest }: DealActionBarProps) {
  const canNegotiate = permissions.edit && status === "Draft" && canTransitionDeal(status, "Negotiation");
  const canHold = permissions.edit && canReserve && canTransitionDeal(status, "Reserved");
  const canConfirm =
    permissions.confirm && (status === "Negotiation" || status === "Reserved") && canTransitionDeal(status, "Confirmed");
  const canCancel = permissions.cancel && canTransitionDeal(status, "Cancelled");

  if (!canNegotiate && !canHold && !canConfirm && !canCancel) return null;

  return (
    <div className="border-border flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap sm:items-center">
      {canNegotiate && (
        <Button
          variant="gradient"
          className="h-11 sm:h-10"
          leftIcon={<Handshake className="size-4" aria-hidden="true" />}
          onClick={() => onRequest("negotiation")}
        >
          Start negotiation
        </Button>
      )}
      {canHold && (
        <Button
          variant="outline"
          className="h-11 sm:h-10"
          leftIcon={<ShieldCheck className="size-4" aria-hidden="true" />}
          onClick={() => onRequest("reserve")}
        >
          Reserve vehicle
        </Button>
      )}
      {canConfirm && (
        <Button
          variant="gradient"
          className="h-11 sm:h-10"
          leftIcon={<BadgeCheck className="size-4" aria-hidden="true" />}
          onClick={() => onRequest("confirm")}
        >
          Confirm deal
        </Button>
      )}
      {canCancel && (
        <Button
          variant="destructive"
          className="h-11 sm:ml-auto sm:h-10"
          leftIcon={<XCircle className="size-4" aria-hidden="true" />}
          onClick={() => onRequest("cancel")}
        >
          Cancel deal
        </Button>
      )}
    </div>
  );
}