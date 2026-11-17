"use client";

import { AnimatePresence, motion } from "motion/react";
import { Ban, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { useMotion } from "@/src/hooks/use-motion";
import type { ContextMessages } from "@/src/lib/utils/sales-deal-form";
import { cn } from "@/src/lib/utils/cn";

type Tone = "blocker" | "warning" | "note";

const STYLE: Record<Tone, { box: string; icon: LucideIcon; iconClass: string }> = {
  blocker: { box: "border-red-500/40 bg-red-500/10", icon: Ban, iconClass: "text-red-400" },
  warning: { box: "border-amber-500/30 bg-amber-500/10", icon: TriangleAlert, iconClass: "text-amber-400" },
  note: { box: "border-border bg-card-hover/40", icon: Info, iconClass: "text-text-muted" },
};

/** The blockers, warnings and notes for the chosen vehicle. Items slide in and out as the answer changes. */
export function DealNotices({ blockers, warnings, notes }: ContextMessages) {
  const { reduce, transition } = useMotion();

  const items = [
    ...blockers.map((text) => ({ tone: "blocker" as const, text })),
    ...warnings.map((text) => ({ tone: "warning" as const, text })),
    ...notes.map((text) => ({ tone: "note" as const, text })),
  ];

  return (
    <div role="status" aria-live="polite" className="flex flex-col">
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const { box, icon: Icon, iconClass } = STYLE[item.tone];
          return (
            <motion.div
              key={`${item.tone}:${item.text}`}
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={transition(0.2)}
              className="overflow-hidden"
            >
              <p
                className={cn(
                  "text-body-sm text-text-primary mb-2 flex items-start gap-2 rounded-md border px-3 py-2.5",
                  box,
                )}
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", iconClass)} aria-hidden="true" />
                <span>
                  {item.tone === "blocker" && <span className="sr-only">Blocked: </span>}
                  {item.text}
                </span>
              </p>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}