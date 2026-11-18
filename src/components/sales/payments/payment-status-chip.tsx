import type { PaymentStatus } from "@/src/lib/types/sales";

const STATUS_RAW: Record<PaymentStatus, string> = {
  Recorded: "#f59e0b",
  Verified: "#34d399",
  Rejected: "#f87171",
  Reversed: "#94a3b8",
};

const STATUS_TEXT: Record<PaymentStatus, string> = {
  Recorded: "Awaiting verification",
  Verified: "Verified",
  Rejected: "Rejected",
  Reversed: "Reversed",
};

export function PaymentStatusChip({ status }: { status: PaymentStatus }) {
  const raw = STATUS_RAW[status];
  return (
    <span
      className="text-caption inline-flex items-center rounded-full border px-2 py-0.5 whitespace-nowrap text-[var(--omc-status-text)]"
      style={
        {
          "--omc-status-raw": raw,
          backgroundColor: `${raw}1A`,
          borderColor: `${raw}66`,
        } as React.CSSProperties
      }
    >
      {STATUS_TEXT[status]}
    </span>
  );
}
