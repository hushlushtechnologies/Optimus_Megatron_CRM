"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CircleSlash, Play, XCircle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { runMaintenanceNowAction } from "@/app/admin/settings/communications/maintenance-actions";

/*
|--------------------------------------------------------------------------
| RUN NOW
|--------------------------------------------------------------------------
|
| Deliberately plain. The outcome comes from the action, which reports
| what the database actually returned per job — including the case where
| some jobs worked and others failed, which a single success toast would
| misreport.
|
| No optimistic update and no spinner-then-assume. The jobs can take real
| time on a first run with a backlog, and the only honest thing to show
| afterwards is the run history, which the refresh brings in.
*/

export function RunMaintenanceButton({ hasBacklog }: { hasBacklog: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const result = await runMaintenanceNowAction();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.summary ?? "The jobs finished.");
      }
      router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page to see whether anything ran.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={hasBacklog ? "primary" : "secondary"}
        size="sm"
        isLoading={running}
        leftIcon={<Play className="size-4" aria-hidden="true" />}
        onClick={() => void run()}
      >
        Run the jobs now
      </Button>
      {hasBacklog && (
        <p className="text-caption text-text-muted">
          There is a backlog waiting. Read what it contains above before running this — the points
          expiry job takes all of it off customers&apos; balances in one go.
        </p>
      )}
    </div>
  );
}

export function OutcomeBadge({ outcome }: { outcome: "ok" | "failed" | "skipped" }) {
  const map = {
    ok: { Icon: CheckCircle2, label: "Finished", className: "text-emerald-500" },
    failed: { Icon: XCircle, label: "Failed", className: "text-red-500" },
    skipped: { Icon: CircleSlash, label: "Skipped", className: "text-text-subtle" },
  } as const;
  const { Icon, label, className } = map[outcome];

  return (
    <span className={`text-caption inline-flex items-center gap-1 ${className}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * A discrepancy found by the wallet check is not a failed job — the job
 * worked and found something. It still needs to stand out, so it gets its own
 * marker rather than being folded into either state.
 */
export function DiscrepancyBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="text-caption inline-flex items-center gap-1 text-amber-500">
      <AlertTriangle className="size-3.5" aria-hidden="true" />
      {count} wallet{count === 1 ? "" : "s"} disagree with their ledger
    </span>
  );
}
