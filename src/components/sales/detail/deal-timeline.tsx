"use client";

import { motion } from "motion/react";
import {
  ArrowRightLeft,
  BadgeCheck,
  Plus,
  Tag,
  Timer,
  Truck,
  UserRound,
  Wallet,
  XCircle,
  FileText,
  
  type LucideIcon,
} from "lucide-react";
import { useMotion } from "@/src/hooks/use-motion";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type { DealActivityItem } from "@/src/lib/types/sales-detail";

function iconFor(type: string): { Icon: LucideIcon; raw: string } {
  if (type === "created") return { Icon: Plus, raw: "#d4af37" };
    if (
    type === "status_cancelled" ||
    type === "payment_rejected" ||
    type === "payment_reversed" ||
    type === "discount_approval_withdrawn"
  )
    return { Icon: XCircle, raw: "#f87171" };
  if (type === "status_completed" || type === "delivered") return { Icon: Truck, raw: "#d4af37" };
  if (type.startsWith("status_")) return { Icon: ArrowRightLeft, raw: "#60a5fa" };
  if (type.startsWith("owner_")) return { Icon: UserRound, raw: "#818cf8" };
  if (type === "discount_approved") return { Icon: BadgeCheck, raw: "#34d399" };
  if (type.startsWith("price_")) return { Icon: Tag, raw: "#f59e0b" };
  if (type.startsWith("payment_")) return { Icon: Wallet, raw: "#34d399" };
  if (type.startsWith("reservation_")) return { Icon: Timer, raw: "#f59e0b" };
    if (type.startsWith("document_")) return { Icon: FileText, raw: type === "document_voided" ? "#f87171" : "#60a5fa" };
      if (type.startsWith("delivery_")) return { Icon: Truck, raw: type === "delivery_completed" ? "#34d399" : "#60a5fa" };
  return { Icon: ArrowRightLeft, raw: "#94a3b8" };
}

export function DealTimeline({ entries }: { entries: DealActivityItem[] }) {
  const { fadeUp } = useMotion();

  if (entries.length === 0) {
    return <p className="text-body-sm text-text-subtle">No activity recorded yet.</p>;
  }

  return (
    <ol className="relative flex flex-col gap-5">
      <span aria-hidden="true" className="bg-border absolute top-2 bottom-2 left-4 w-px" />
      {entries.map((entry, index) => {
        const { Icon, raw } = iconFor(entry.activity_type);
        return (
          <motion.li key={entry.id} {...fadeUp(index)} className="relative flex gap-4">
            <span
              aria-hidden="true"
              className="bg-card relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border"
              style={{ borderColor: `${raw}66`, color: raw }}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-body-sm text-text-primary">{entry.description}</p>
              <p className="text-caption text-text-subtle">
                {formatDateTimeFull(entry.changed_at)} · {entry.changedByName}
              </p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}