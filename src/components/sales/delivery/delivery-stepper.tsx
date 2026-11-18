"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";
import { useMotion } from "@/src/hooks/use-motion";
import type { DeliveryStatus } from "@/src/lib/types/sales-delivery";
import { cn } from "@/src/lib/utils/cn";

const STEPS: { status: Exclude<DeliveryStatus, "Cancelled">; label: string }[] = [
  { status: "Preparing", label: "Preparing" },
  { status: "Scheduled", label: "Planned" },
  { status: "Delivered", label: "Handed over" },
];

export function DeliveryStepper({ status }: { status: Exclude<DeliveryStatus, "Cancelled"> }) {
  const { reduce, transition } = useMotion();
  const current = STEPS.findIndex((step) => step.status === status);

  return (
    <ol aria-label="Delivery progress" className="flex w-full items-start">
      {STEPS.map((step, index) => {
        const done = index < current || status === "Delivered";
        const active = index === current && status !== "Delivered";

        return (
          <li
            key={step.status}
            aria-current={active ? "step" : undefined}
            className="flex flex-1 items-start last:flex-none"
          >
            <div className="flex flex-col items-center gap-1.5">
              <motion.span
                initial={reduce ? false : { scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={transition(0.3, index * 0.08)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border text-xs font-semibold",
                  done && "border-primary bg-primary text-[#0b1220]",
                  active && "border-primary bg-primary/15 text-primary ring-primary/25 ring-4",
                  !done && !active && "border-border bg-card text-text-subtle",
                )}
              >
                {done ? <Check className="size-4" strokeWidth={2.5} aria-hidden="true" /> : index + 1}
              </motion.span>
              <span
                className={cn(
                  "text-caption w-20 text-center leading-tight",
                  active || done ? "text-text-primary font-semibold" : "text-text-subtle",
                )}
              >
                {step.label}
                <span className="sr-only">
                  {done ? " (done)" : active ? " (current step)" : " (not reached)"}
                </span>
              </span>
            </div>

            {index < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="bg-border relative mx-1 mt-4 h-0.5 flex-1 overflow-hidden rounded-full"
              >
                <motion.span
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: index < current || status === "Delivered" ? "100%" : "0%" }}
                  transition={transition(0.45, 0.15 + index * 0.1)}
                  className="bg-primary absolute inset-y-0 left-0 rounded-full"
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
