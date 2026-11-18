import { Ban, BadgeCheck, Clock, ShieldCheck, Timer, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/src/lib/utils/cn";
import type { ReservationStatus } from "@/src/lib/types/sales";

export const RESERVATION_STATUS_META: Record<
  ReservationStatus,
  { icon: LucideIcon; raw: string; description: string }
> = {
  Requested: { icon: Clock, raw: "#f59e0b", description: "Waiting for review. The vehicle is not held" },
  Confirmed: { icon: ShieldCheck, raw: "#34d399", description: "The vehicle is held for the customer" },
  Converted: { icon: BadgeCheck, raw: "#d4af37", description: "Became a confirmed deal" },
  Cancelled: { icon: XCircle, raw: "#94a3b8", description: "The request was cancelled" },
  Released: { icon: Ban, raw: "#60a5fa", description: "The hold was released early" },
  Expired: { icon: Timer, raw: "#fb923c", description: "The hold ran out" },
  Rejected: { icon: XCircle, raw: "#f87171", description: "The request was declined" },
};

/** A confirmed hold past its expiry looks and reads as expired, even before the tidy-up job runs. */
export function effectiveReservationStatus(row: {
  status: ReservationStatus;
  is_live: boolean;
}): ReservationStatus {
  return row.status === "Confirmed" && !row.is_live ? "Expired" : row.status;
}

interface ReservationStatusBadgeProps {
  status: ReservationStatus;
  size?: "sm" | "md";
  className?: string;
}

export function ReservationStatusBadge({ status, size = "md", className }: ReservationStatusBadgeProps) {
  const { icon: Icon, raw } = RESERVATION_STATUS_META[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border text-[var(--omc-status-text)]",
        size === "sm" ? "text-caption px-2 py-0.5" : "text-body-sm px-2.5 py-1",
        className,
      )}
      style={
        {
          "--omc-status-raw": raw,
          backgroundColor: `${raw}1A`,
          borderColor: `${raw}66`,
        } as React.CSSProperties
      }
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden="true" />
      {status}
    </span>
  );
}
