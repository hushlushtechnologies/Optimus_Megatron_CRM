"use client";

import { motion } from "motion/react";
import { Check, Minus, X } from "lucide-react";
import { useMotion } from "@/src/hooks/use-motion";
import type { SalesDealStatus } from "@/src/lib/types/sales";
import { cn } from "@/src/lib/utils/cn";

const STEPS: { status: SalesDealStatus; optional?: boolean }[] = [
  { status: "Draft" },
  { status: "Negotiation" },
  { status: "Reserved", optional: true },
  { status: "Confirmed" },
  { status: "Completed" },
];

type StepState = "done" | "skipped" | "current" | "stopped" | "upcoming";

interface DealStepperProps {
  status: SalesDealStatus;
  /** For a cancelled deal: the step it was on. */
  stoppedAt: SalesDealStatus | null;
  /** Statuses the deal went through. null when the history couldn't be loaded. */
  visited: Set<SalesDealStatus> | null;
}

const CIRCLE: Record<StepState, string> = {
  done: "border-primary bg-primary text-[#0b1220]",
  current: "border-primary bg-primary/15 text-primary ring-primary/25 ring-4",
  skipped: "border-border bg-card text-text-subtle border-dashed",
  stopped: "border-red-500/60 bg-red-500/10 text-red-400",
  upcoming: "border-border bg-card text-text-subtle",
};

const SPOKEN: Record<StepState, string> = {
  done: "completed",
  current: "current step",
  skipped: "skipped",
  stopped: "stopped here, deal cancelled",
  upcoming: "not reached",
};

export function DealStepper({ status, stoppedAt, visited }: DealStepperProps) {
  const { reduce, transition } = useMotion();
  const cancelled = status === "Cancelled";
  const reference = cancelled ? stoppedAt : status;
  const current = reference ? STEPS.findIndex((step) => step.status === reference) : -1;

  const stateOf = (index: number): StepState => {
    if (current === -1) return "upcoming";
    if (index < current) {
      const step = STEPS[index];
      return step.optional && visited && !visited.has(step.status) ? "skipped" : "done";
    }
    if (index === current) return cancelled ? "stopped" : status === "Completed" ? "done" : "current";
    return "upcoming";
  };

  return (
    <ol aria-label="Deal progress" className="flex w-full items-start">
      {STEPS.map((step, index) => {
        const state = stateOf(index);
        const showLabel = state === "current" || state === "stopped";
        const filled = current !== -1 && index < current;

        return (
          <li
            key={step.status}
            aria-current={state === "current" ? "step" : undefined}
            className="flex flex-1 items-start last:flex-none"
          >
            <div className="flex flex-col items-center gap-1.5">
              <motion.span
                initial={reduce ? false : { scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={transition(0.3, index * 0.07)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border text-xs font-semibold",
                  CIRCLE[state],
                )}
              >
                {state === "done" ? (
                  <Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
                ) : state === "stopped" ? (
                  <X className="size-4" aria-hidden="true" />
                ) : state === "skipped" ? (
                  <Minus className="size-4" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </motion.span>
              <span
                className={cn(
                  "text-caption w-16 text-center leading-tight",
                  showLabel ? "text-text-primary font-semibold" : "text-text-subtle hidden sm:block",
                )}
              >
                {step.status}
                {step.optional && <span className="text-text-subtle block font-normal">optional</span>}
                <span className="sr-only"> ({SPOKEN[state]})</span>
              </span>
            </div>

            {index < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="bg-border relative mx-1 mt-4 h-0.5 flex-1 overflow-hidden rounded-full"
              >
                <motion.span
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: filled ? "100%" : "0%" }}
                  transition={transition(0.45, 0.15 + index * 0.1)}
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full",
                    cancelled ? "bg-text-subtle/50" : "bg-primary",
                  )}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
