import "server-only";

import { createClient } from "@/src/lib/supabase/server";

/*
|------------------------------------------------------------------------------
| Reading the state of the background jobs
|------------------------------------------------------------------------------
|
| Sprint 10: "do not display fake backup, uptime, or security status
| information", "do not invent a system health status". So every state this
| module can report comes from a row in maintenance_runs or from a query
| against the data itself. There is no computed "healthy" anywhere.
|
| In particular, "no runs recorded" is reported as exactly that, and not as
| "up to date". Those look similar on a screen and mean opposite things: one
| is a scheduler nobody has installed, the other is a scheduler that ran last
| night and found nothing to do.
|
|------------------------------------------------------------------------------
*/

/** The four jobs sql/14 schedules, in the order it runs them. */
export const MAINTENANCE_JOBS = [
  {
    key: "promotion_statuses",
    label: "Campaign statuses",
    what: "Moves campaigns that have started to active, and finished ones to expired.",
    /** What is wrong while this does not run. */
    consequence:
      "Discounts stay correct either way — eligibility is checked against the dates on every read. What goes stale is the stored status, which the campaign lists and the Promotions report read.",
    writes: true,
  },
  {
    key: "loyalty_reservations",
    label: "Abandoned point holds",
    what: "Releases points held for deals that went quiet, so customers can spend them again.",
    consequence:
      "Points stay locked on holds that will never complete. The customer sees a balance they cannot use.",
    writes: true,
  },
  {
    key: "loyalty_expiry",
    label: "Points expiry",
    what: "Ages out earned points once they pass their expiry date.",
    consequence:
      "Points that should have expired are still counted in balances. The first run clears the whole backlog at once, so check the preview before scheduling this.",
    writes: true,
  },
  {
    key: "loyalty_wallet_check",
    label: "Wallet integrity check",
    what: "Reports any customer whose balance disagrees with their own ledger. Changes nothing.",
    consequence:
      "A balance that has drifted from its ledger goes unnoticed until somebody questions it. This job only reports; it never rewrites a balance, because that would destroy the evidence of how it drifted.",
    writes: false,
  },
] as const;

export type MaintenanceJobKey = (typeof MAINTENANCE_JOBS)[number]["key"];

export interface MaintenanceRun {
  id: number;
  job: string;
  startedAt: string;
  finishedAt: string | null;
  outcome: "ok" | "failed" | "skipped";
  detail: Record<string, unknown> | null;
  error: string | null;
  triggeredBy: string;
}

export interface JobPreview {
  job: string;
  wouldAffect: number;
  detail: Record<string, unknown> | null;
}

export type SchedulerState =
  /** sql/14 has not been run: the log table does not exist. */
  | { status: "not_installed" }
  /** Installed, but nothing has ever run. */
  | { status: "installed_never_run"; preview: JobPreview[] | null }
  | { status: "running"; runs: MaintenanceRun[]; preview: JobPreview[] | null }
  | { status: "error" };

/**
 * Everything the page needs, in one call.
 *
 * The three installed/never-run/running states are kept apart because the
 * page says something different for each, and because guessing between them
 * is how a page ends up claiming a scheduler is fine when it was never set
 * up.
 */
export async function getSchedulerState(): Promise<SchedulerState> {
  const supabase = await createClient();

  const runs = await supabase
    .from("maintenance_runs")
    .select("id, job, started_at, finished_at, outcome, detail, error, triggered_by")
    .order("started_at", { ascending: false })
    .limit(40);

  if (runs.error) {
    /*
     * 42P01 is "relation does not exist", which here means sql/14 has not
     * been run. That is a different thing from a query that failed, and the
     * page tells the two apart: one has an instruction, the other has an
     * apology.
     */
    if (runs.error.code === "42P01") {
      return { status: "not_installed" };
    }
    console.error("getSchedulerState runs error:", runs.error);
    return { status: "error" };
  }

  const preview = await loadPreview(supabase);

  const mapped: MaintenanceRun[] = (
    (runs.data ?? []) as unknown as {
      id: number;
      job: string;
      started_at: string;
      finished_at: string | null;
      outcome: "ok" | "failed" | "skipped";
      detail: Record<string, unknown> | null;
      error: string | null;
      triggered_by: string;
    }[]
  ).map((row) => ({
    id: row.id,
    job: row.job,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    outcome: row.outcome,
    detail: row.detail,
    error: row.error,
    triggeredBy: row.triggered_by,
  }));

  if (mapped.length === 0) {
    return { status: "installed_never_run", preview };
  }
  return { status: "running", runs: mapped, preview };
}

async function loadPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<JobPreview[] | null> {
  const { data, error } = await supabase.rpc("preview_maintenance");

  if (error) {
    console.error("preview_maintenance error:", error);
    return null;
  }

  return ((data ?? []) as { job: string; would_affect: number; detail: Record<string, unknown> | null }[])
    .map((row) => ({
      job: row.job,
      wouldAffect: Number(row.would_affect ?? 0),
      detail: row.detail,
    }))
    .sort(
      (a, b) =>
        MAINTENANCE_JOBS.findIndex((job) => job.key === a.job) -
        MAINTENANCE_JOBS.findIndex((job) => job.key === b.job),
    );
}

/** The most recent run of each job, keyed by job name. */
export function latestByJob(runs: readonly MaintenanceRun[]): Map<string, MaintenanceRun> {
  const latest = new Map<string, MaintenanceRun>();
  runs.forEach((run) => {
    // runs arrive newest first, so the first one seen for a job is its latest.
    if (!latest.has(run.job)) latest.set(run.job, run);
  });
  return latest;
}
