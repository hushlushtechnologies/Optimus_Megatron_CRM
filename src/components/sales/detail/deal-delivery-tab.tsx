"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { CalendarClock, PackageCheck, Truck, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { DeliveryStepper } from "@/src/components/sales/delivery/delivery-stepper";
import { DeliveryChecklist } from "@/src/components/sales/delivery/delivery-checklist";
import { DeliveryPlanDialog } from "@/src/components/sales/delivery/delivery-plan-dialog";
import { DeliveryCompleteDialog } from "@/src/components/sales/delivery/delivery-complete-dialog";
import { prepareDeliveryAction } from "@/app/admin/sales/delivery-actions";
import { useMotion } from "@/src/hooks/use-motion";
import { checklistProgress, deliveryPlace } from "@/src/lib/utils/sales-delivery";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type { DealDeliveryResult, DeliveryLookups } from "@/src/lib/types/sales-delivery";
import type { SalesDealDetail } from "@/src/lib/types/sales-detail";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";

interface DealDeliveryTabProps {
  deal: SalesDealDetail;
  result: DealDeliveryResult;
  /** null when the people and showrooms couldn't be loaded. Planning is paused until they can. */
  lookups: DeliveryLookups | null;
  permissions: SalesPermissions;
}

function Notice({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="surface-card flex items-start gap-3 p-5">
      <span className="text-text-subtle mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-body-sm text-text-primary font-medium">{title}</p>
        {children && <div className="text-body-sm text-text-muted mt-1">{children}</div>}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-caption text-text-subtle shrink-0">{label}</dt>
      <dd className="text-body-sm text-text-primary min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

export function DealDeliveryTab({ deal, result, lookups, permissions }: DealDeliveryTabProps) {
  const router = useRouter();
  const { fadeUp } = useMotion();
  const [open, setOpen] = useState<"plan" | "complete" | null>(null);
  const [preparing, setPreparing] = useState(false);

  if (result.status === "error") {
    return (
      <p
        role="alert"
        className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
        The delivery couldn&apos;t be loaded. Refresh the page to try again.
      </p>
    );
  }

  const { delivery, items } = result;

  const prepare = async () => {
    setPreparing(true);
    try {
      const outcome = await prepareDeliveryAction({ dealId: deal.id });
      if (outcome.error) {
        toast.error(outcome.error);
        return;
      }
      toast.success("Delivery preparation started");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setPreparing(false);
    }
  };

  const done = () => {
    setOpen(null);
    router.refresh();
  };

  if (!delivery) {
    if (deal.status === "Cancelled") {
      return (
        <Notice icon={<XCircle className="size-5" aria-hidden="true" />} title="This deal was cancelled, so there is no delivery." />
      );
    }
    if (deal.status !== "Confirmed") {
      return (
        <Notice icon={<Truck className="size-5" aria-hidden="true" />} title="Delivery starts once the deal is confirmed.">
          A confirmed sale isn&apos;t a delivered vehicle. When this deal is confirmed, you can prepare the handover here.
        </Notice>
      );
    }
    return (
      <motion.section {...fadeUp(0)} aria-label="Delivery" className="surface-card flex flex-col items-start gap-4 p-5">
        <div className="flex items-start gap-3">
          <Truck className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-body-sm text-text-primary font-medium">The deal is confirmed. Prepare the delivery.</p>
            <p className="text-body-sm text-text-muted mt-1">
              This starts the handover checklist and lets you plan when, where and by whom the vehicle is handed over. The
              deal is completed when the handover is recorded.
            </p>
          </div>
        </div>
        {permissions.complete ? (
          <Button
            variant="gradient"
            className="h-11 sm:h-10"
            isLoading={preparing}
            leftIcon={<PackageCheck className="size-4" aria-hidden="true" />}
            onClick={() => void prepare()}
          >
            Prepare delivery
          </Button>
        ) : (
          <p className="text-caption text-text-subtle">You don&apos;t have permission to manage deliveries.</p>
        )}
      </motion.section>
    );
  }

  const cancelled = delivery.status === "Cancelled";
  const delivered = delivery.status === "Delivered";
  const open_ = !cancelled && !delivered;
  const progress = checklistProgress(items);
  const place = deliveryPlace(delivery);
  const canManage = permissions.complete && open_;

  return (
    <div className="flex flex-col gap-6">
      {cancelled ? (
        <Notice icon={<XCircle className="size-5" aria-hidden="true" />} title="This delivery was cancelled because the deal was cancelled." />
      ) : (
        <motion.section {...fadeUp(0)} aria-label="Delivery progress" className="surface-card p-5">
          <DeliveryStepper status={delivery.status as "Preparing" | "Scheduled" | "Delivered"} />
        </motion.section>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <DeliveryChecklist items={items} editable={open_} canTick={permissions.complete} canWaive={permissions.confirm} />

          {delivered && (
            <motion.section {...fadeUp(1)} aria-label="Handover" className="surface-card flex flex-col gap-2 p-5">
              <p className="text-label">Handover</p>
              <dl className="divide-border divide-y">
                <Row label="Handed over">{delivery.delivered_at ? formatDateTimeFull(delivery.delivered_at) : "—"}</Row>
                <Row label="By">{delivery.handed_over_by_name ?? "—"}</Row>
                <Row label="Notes">{delivery.handover_notes ?? <span className="text-text-subtle">None</span>}</Row>
              </dl>
            </motion.section>
          )}

          {open_ && (
            <motion.section {...fadeUp(1)} aria-label="Complete the handover" className="surface-card flex flex-col gap-3 p-5">
              <p className="text-label">Complete the handover</p>
              {progress.allReady ? (
                <p className="text-body-sm text-text-muted">
                  Every required check is ready. When the customer has the vehicle, record the handover. This also completes
                  the deal.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-body-sm text-text-muted">The handover can&apos;t be completed yet. Still to do:</p>
                  <ul className="flex flex-col gap-1">
                    {progress.notReady.map((item) => (
                      <li key={item.id} className="text-body-sm text-text-primary">
                        • {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {permissions.complete && (
                <div>
                  <Button
                    variant="gradient"
                    className="h-11 sm:h-10"
                    disabled={!progress.allReady}
                    leftIcon={<PackageCheck className="size-4" aria-hidden="true" />}
                    onClick={() => setOpen("complete")}
                  >
                    Complete handover
                  </Button>
                </div>
              )}
            </motion.section>
          )}
        </div>

        <motion.section {...fadeUp(2)} aria-label="Handover plan" className="surface-card flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-label">Handover plan</p>
            {canManage && (
              <Button
                size="sm"
                variant={delivery.planned_at ? "outline" : "gradient"}
                leftIcon={<CalendarClock className="size-4" aria-hidden="true" />}
                disabled={!lookups}
                onClick={() => setOpen("plan")}
              >
                {delivery.planned_at ? "Change plan" : "Plan handover"}
              </Button>
            )}
          </div>

          {canManage && !lookups && (
            <p role="alert" className="text-caption text-red-400">
              The people and showrooms couldn&apos;t be loaded, so planning is paused. Refresh the page to try again.
            </p>
          )}

          {delivery.planned_at ? (
            <dl className="divide-border divide-y">
              <Row label="When">{formatDateTimeFull(delivery.planned_at)}</Row>
              <Row label="Where">{place ?? "—"}</Row>
              <Row label="Handed over by">{delivery.handover_staff_name ?? "—"}</Row>
              {delivery.prep_notes && <Row label="Preparation">{delivery.prep_notes}</Row>}
            </dl>
          ) : (
            <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-3 py-4 text-center">
              No date has been planned yet.
            </p>
          )}

          <p className="text-caption text-text-subtle">
            Delivery prepared {formatDateTimeFull(delivery.created_at)}
            {delivery.created_by_name ? ` by ${delivery.created_by_name}` : ""}.
          </p>
        </motion.section>
      </div>

      {open === "plan" && lookups && (
        <DeliveryPlanDialog
          dealId={deal.id}
          delivery={delivery}
          lookups={lookups}
          onClose={() => setOpen(null)}
          onDone={done}
        />
      )}
      {open === "complete" && (
        <DeliveryCompleteDialog deal={deal} delivery={delivery} items={items} onClose={() => setOpen(null)} onDone={done} />
      )}
    </div>
  );
}