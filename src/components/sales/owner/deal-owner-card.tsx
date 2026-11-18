"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowRight, History, UserPlus, UserRoundCog } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/ui/modal";
import { CustomerAvatar } from "@/src/components/customers/customer-avatar";
import { DealOwnerDialog } from "@/src/components/sales/owner/deal-owner-dialog";
import { reassignDealAction } from "@/app/admin/sales/owner-actions";
import { useMotion } from "@/src/hooks/use-motion";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type { AssignmentHistoryItem } from "@/src/lib/types/sales-owner";
import type { SalesDealDetail } from "@/src/lib/types/sales-detail";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";

interface DealOwnerCardProps {
  deal: SalesDealDetail;
  /** null means the history couldn't be loaded. */
  assignments: AssignmentHistoryItem[] | null;
  permissions: SalesPermissions;
  currentUserId: string | null;
}

const CHANGEABLE = ["Draft", "Negotiation", "Reserved", "Confirmed"];
const INLINE_COUNT = 3;

function HistoryItem({ item }: { item: AssignmentHistoryItem }) {
  return (
    <li className="border-border border-l-2 pl-3">
      <p className="text-body-sm text-text-primary flex flex-wrap items-center gap-x-1.5">
        {item.previous_owner_name ? (
          <>
            {item.previous_owner_name}
            <ArrowRight className="text-text-subtle size-3.5" aria-label="handed to" />
            {item.new_owner_name ?? "No one"}
          </>
        ) : (
          <>Assigned to {item.new_owner_name ?? "No one"}</>
        )}
      </p>
      <p className="text-caption text-text-subtle">
        {formatDateTimeFull(item.changed_at)} · by {item.changed_by_name}
      </p>
      {item.reason && <p className="text-caption text-text-muted mt-0.5">Reason: {item.reason}</p>}
    </li>
  );
}

export function DealOwnerCard({ deal, assignments, permissions, currentUserId }: DealOwnerCardProps) {
  const { fadeUp } = useMotion();
  const router = useRouter();
  const [open, setOpen] = useState<"change" | "history" | null>(null);
  const [claiming, setClaiming] = useState(false);

  const changeable = CHANGEABLE.includes(deal.status);
  const canChange = permissions.assign && changeable;
  const canClaim = !deal.owner_id && permissions.edit && changeable && !!currentUserId;

  const claim = async () => {
    if (!currentUserId) return;
    setClaiming(true);
    try {
      const result = await reassignDealAction({
        id: deal.id,
        expectedUpdatedAt: deal.updated_at,
        newOwnerId: currentUserId,
        reason: "",
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("You now own this deal");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setClaiming(false);
    }
  };

  const done = () => {
    setOpen(null);
    router.refresh();
  };

  return (
    <motion.section {...fadeUp(1)} aria-label="Ownership" className="surface-card flex flex-col gap-4 p-5">
      <p className="text-label">Responsible sales executive</p>

      {deal.owner_name ? (
        <div className="flex items-center gap-3">
          <CustomerAvatar fullName={deal.owner_name} size="md" />
          <div className="min-w-0">
            <p className="text-text-primary truncate font-medium">{deal.owner_name}</p>
            <p className="text-caption text-text-subtle">Gets the credit for this sale</p>
          </div>
        </div>
      ) : (
        <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-3 py-4 text-center">
          Nobody owns this deal yet.
        </p>
      )}

      {(canChange || canClaim) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {canClaim && (
            <Button
              variant={canChange ? "secondary" : "gradient"}
              className="h-11 sm:h-10"
              leftIcon={<UserPlus className="size-4" aria-hidden="true" />}
              isLoading={claiming}
              onClick={claim}
            >
              Assign to me
            </Button>
          )}
          {canChange && (
            <Button
              variant="outline"
              className="h-11 sm:h-10"
              leftIcon={<UserRoundCog className="size-4" aria-hidden="true" />}
              onClick={() => setOpen("change")}
            >
              {deal.owner_id ? "Change owner" : "Assign owner"}
            </Button>
          )}
        </div>
      )}

      {!changeable && (
        <p className="text-caption text-text-subtle">
          The owner is fixed once a deal is completed or cancelled, so the credit can&apos;t move.
        </p>
      )}

      <div className="border-border flex flex-col gap-3 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption text-text-subtle">Handover history</p>
          {assignments && assignments.length > INLINE_COUNT && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<History className="size-3.5" aria-hidden="true" />}
              onClick={() => setOpen("history")}
            >
              All {assignments.length}
            </Button>
          )}
        </div>

        {assignments === null ? (
          <p
            role="alert"
            className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
          >
            The handover history couldn&apos;t be loaded. Refresh the page to try again.
          </p>
        ) : assignments.length === 0 ? (
          <p className="text-body-sm text-text-subtle">No owner has been assigned yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {assignments.slice(0, INLINE_COUNT).map((item) => (
              <HistoryItem key={item.id} item={item} />
            ))}
          </ol>
        )}
      </div>

      {open === "change" && <DealOwnerDialog deal={deal} onClose={() => setOpen(null)} onDone={done} />}

      {open === "history" && assignments && (
        <Modal
          isOpen
          onClose={() => setOpen(null)}
          size="md"
          title="Handover history"
          footer={<Button onClick={() => setOpen(null)}>Done</Button>}
        >
          <ol className="flex flex-col gap-4">
            {assignments.map((item) => (
              <HistoryItem key={item.id} item={item} />
            ))}
          </ol>
        </Modal>
      )}
    </motion.section>
  );
}
