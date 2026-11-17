"use client";

import { motion } from "motion/react";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { useMotion } from "@/src/hooks/use-motion";
import type { ReadinessGroup } from "@/src/lib/types/sales-detail";
import { cn } from "@/src/lib/utils/cn";

/** What is still missing for each next step. Renders nothing for a finished deal. */
export function DealReadinessCard({ groups }: { groups: ReadinessGroup[] }) {
  const { fadeUp } = useMotion();
  if (groups.length === 0) return null;

  return (
    <section aria-label="What is needed next" className="surface-card flex flex-col gap-5 p-5">
      <header className="flex items-center gap-2.5">
        <ListChecks className="text-primary size-5" aria-hidden="true" />
        <h2 className="text-h3">What&apos;s needed next</h2>
      </header>

      {groups.map((group, groupIndex) => (
        <div key={group.title} className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-body-sm text-text-primary font-semibold">
              {group.title}
              {group.optional && <span className="text-caption text-text-subtle ml-2 font-normal">optional</span>}
            </h3>
            <span
              className={cn(
                "text-caption rounded-full border px-2 py-0.5",
                group.ready ? "border-success/40 bg-success/10 text-success" : "border-border text-text-muted",
              )}
            >
              {group.ready ? "Ready" : `${group.items.filter((item) => item.done).length} of ${group.items.length} done`}
            </span>
          </div>

          <ul className="flex flex-col gap-2">
            {group.items.map((item, index) => {
              const Icon = item.done ? CheckCircle2 : Circle;
              return (
                <motion.li
                  key={item.key}
                  {...fadeUp(groupIndex * 3 + index)}
                  className="border-border bg-card-hover/30 flex items-start gap-3 rounded-md border px-3 py-2.5"
                >
                  <Icon
                    className={cn("mt-0.5 size-4 shrink-0", item.done ? "text-success" : "text-text-subtle")}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className={cn("text-body-sm", item.done ? "text-text-primary" : "text-text-muted")}>
                      {item.label}
                      <span className="sr-only">{item.done ? " (done)" : " (still needed)"}</span>
                    </p>
                    {item.detail && <p className="text-caption text-text-subtle">{item.detail}</p>}
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}