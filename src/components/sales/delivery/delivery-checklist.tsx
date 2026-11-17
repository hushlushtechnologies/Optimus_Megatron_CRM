"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { DeliveryWaiveDialog } from "@/src/components/sales/delivery/delivery-waive-dialog";
import { setDeliveryItemAction } from "@/app/admin/sales/delivery-actions";
import { useMotion } from "@/src/hooks/use-motion";
import { DELIVERY_RULE_NOTE, checklistProgress } from "@/src/lib/utils/sales-delivery";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type { DeliveryItem } from "@/src/lib/types/sales-delivery";
import { cn } from "@/src/lib/utils/cn";

interface DeliveryChecklistProps {
  items: DeliveryItem[];
  /** Whether the checks can still change (the delivery isn't delivered or cancelled). */
  editable: boolean;
  canTick: boolean;
  canWaive: boolean;
}

export function DeliveryChecklist({ items, editable, canTick, canWaive }: DeliveryChecklistProps) {
  const router = useRouter();
  const { fadeUp, transition, reduce } = useMotion();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [waiving, setWaiving] = useState<DeliveryItem | null>(null);

  const progress = checklistProgress(items);
  const percent = progress.requiredTotal === 0 ? 100 : Math.round((progress.requiredReady / progress.requiredTotal) * 100);

  const run = async (item: DeliveryItem, action: "done" | "undo" | "unwaive") => {
    setBusyId(item.id);
    try {
      const result = await setDeliveryItemAction({ itemId: item.id, action, expectedState: item.state, note: "" });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label="Handover checklist" className="surface-card flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-label">Handover checklist</p>
          <p className="text-caption text-text-subtle tabular-nums" role="status">
            {progress.requiredReady} of {progress.requiredTotal} required checks ready
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Required checks ready"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="bg-border/70 h-1.5 overflow-hidden rounded-full"
        >
          <motion.div
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={transition(0.5)}
            className={cn("h-full rounded-full", progress.allReady ? "bg-success" : "bg-primary")}
          />
        </div>
      </div>

      {items.length === 0 ? (
        <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-6 text-center">
          There are no checks on this delivery. Add some in Sales settings for future deliveries.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => {
            const Icon = item.state === "waived" ? MinusCircle : item.is_ready ? CheckCircle2 : Circle;
            const iconTone =
              item.state === "waived" ? "text-amber-400" : item.is_ready ? "text-success" : "text-text-subtle";

            return (
              <motion.li
                key={item.id}
                {...fadeUp(index)}
                className="border-border bg-card-hover/30 flex flex-col gap-3 rounded-md border px-3 py-3"
              >
                <div className="flex items-start gap-3">
                  <Icon className={cn("mt-0.5 size-5 shrink-0", iconTone)} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-body-sm", item.is_ready ? "text-text-primary" : "text-text-muted")}>
                      {item.label}
                      <span className="sr-only">
                        {item.state === "waived" ? " (waived)" : item.is_ready ? " (ready)" : " (not ready)"}
                      </span>
                    </p>
                    <p className="text-caption text-text-subtle">
                      {item.is_required ? "Required" : "Optional"}
                      {item.rule ? ` · ${DELIVERY_RULE_NOTE[item.rule]}` : ""}
                    </p>
                    {item.state !== "pending" && item.actioned_at && (
                      <p className="text-caption text-text-subtle">
                        {item.state === "waived" ? "Waived" : "Ticked"}
                        {item.actioned_by_name ? ` by ${item.actioned_by_name}` : ""} on {formatDateTimeFull(item.actioned_at)}
                      </p>
                    )}
                    {item.state === "waived" && item.note && (
                      <p className="text-caption text-text-muted">Reason: {item.note}</p>
                    )}
                  </div>
                </div>

                {editable && (
                  <div className="flex flex-wrap gap-2 pl-8">
                    {item.state === "pending" && !item.rule && canTick && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-11 sm:h-9"
                        isLoading={busyId === item.id}
                        onClick={() => void run(item, "done")}
                      >
                        Mark done
                      </Button>
                    )}
                    {item.state === "done" && !item.rule && canTick && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-11 sm:h-9"
                        isLoading={busyId === item.id}
                        onClick={() => void run(item, "undo")}
                      >
                        Undo
                      </Button>
                    )}
                    {item.state === "pending" && !item.rule_met && canWaive && (
                      <Button size="sm" variant="outline" className="h-11 sm:h-9" onClick={() => setWaiving(item)}>
                        Waive
                      </Button>
                    )}
                    {item.state === "waived" && canWaive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-11 sm:h-9"
                        isLoading={busyId === item.id}
                        onClick={() => void run(item, "unwaive")}
                      >
                        Restore check
                      </Button>
                    )}
                  </div>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}

      {waiving && (
        <DeliveryWaiveDialog
          item={waiving}
          onClose={() => setWaiving(null)}
          onDone={() => {
            setWaiving(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}