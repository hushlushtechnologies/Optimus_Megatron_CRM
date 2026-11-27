import Link from "next/link";
import { Activity, Database, ShieldQuestion } from "lucide-react";
import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { OutcomeBadge } from "@/src/components/settings/scheduler-client";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { canOpenSettingsPage, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import { MAINTENANCE_JOBS, getSchedulerState, latestByJob } from "@/src/lib/supabase/maintenance-queries";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";

export const metadata = {
  title: "System health · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| SYSTEM HEALTH — PHASE 23
|--------------------------------------------------------------------------
|
| Sprint 10: "do not display fake backup, uptime, or security status
| information. Do not invent a system health status."
|
| So there is no green tick and no "All systems operational" anywhere on
| this page. There is exactly one thing this application can honestly
| report on, and it is the thing Batch 4 built: whether the nightly
| maintenance jobs ran, and what they found. Everything else a health
| page would normally show — uptime, backups, database load, error rates
| — lives in Supabase and Vercel, which this app cannot read. The page
| says so and points at where they are, rather than showing a number it
| made up.
|
| The wallet integrity check is the useful part. It is the one signal here
| that can tell you something is actually wrong with your data rather than
| with a job.
*/

export default async function SystemHealthPage() {
  const page = findSettingsPage("health");
  if (!page) throw new Error("Settings registry is missing the 'health' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const state = await getSchedulerState();
  const latest = state.status === "running" ? latestByJob(state.runs) : new Map();

  const walletRun = latest.get("loyalty_wallet_check");
  const discrepancies = walletRun?.detail ? Number(walletRun.detail.discrepancies ?? 0) : null;
  const anyFailed = state.status === "running" && state.runs.some((run) => run.outcome === "failed");

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote="Only what this application can actually check. Uptime, backups and database load are in Supabase and Vercel, not here."
    >
      <div className="flex flex-col gap-6 pb-12">
        <SettingsSection
          title="Nightly maintenance"
          icon={Activity}
          description="Whether the background jobs are running, and what they last found."
        >
          {state.status === "not_installed" ? (
            <p className="border-border bg-card-hover/40 text-body-sm text-text-muted rounded-md border px-3 py-2.5">
              No scheduler is installed, so nothing is running and there is nothing to report.{" "}
              <Link
                href="/admin/settings/communications/reminders"
                className="text-primary focus-visible:ring-primary rounded underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                Scheduled reminders
              </Link>{" "}
              says what to run.
            </p>
          ) : state.status === "installed_never_run" ? (
            <p className="border-border bg-card-hover/40 text-body-sm text-text-muted rounded-md border px-3 py-2.5">
              Installed, but nothing has run yet. That is not the same as everything being fine — there is
              simply nothing to report until it runs once.
            </p>
          ) : state.status === "error" ? (
            <p role="alert" className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2">
              The job history couldn&apos;t be read, so this page cannot tell you whether the jobs are
              running. That is a gap in the reporting, not a statement that anything is wrong.
            </p>
          ) : (
            <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
              {MAINTENANCE_JOBS.map((job) => {
                const run = latest.get(job.key);
                return (
                  <li key={job.key} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                    <div>
                      <p className="text-body-sm text-text-primary">{job.label}</p>
                      <p className="text-caption text-text-subtle">
                        {run ? `Last run ${formatDateTimeFull(run.startedAt)}` : "Has never run."}
                      </p>
                    </div>
                    {run ? <OutcomeBadge outcome={run.outcome} /> : null}
                  </li>
                );
              })}
            </ul>
          )}

          {anyFailed && (
            <p role="alert" className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2">
              At least one job failed on its last run.{" "}
              <Link
                href="/admin/settings/communications/reminders"
                className="text-primary focus-visible:ring-primary rounded underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                Scheduled reminders
              </Link>{" "}
              has the error it reported.
            </p>
          )}
        </SettingsSection>

        <SettingsSection
          title="Loyalty data integrity"
          icon={Database}
          description="Whether every customer's balance still agrees with their own ledger."
        >
          {discrepancies === null ? (
            <p className="text-body-sm text-text-muted">
              Not checked yet. The wallet check runs as part of the nightly maintenance and reports here
              once it has run.
            </p>
          ) : discrepancies === 0 ? (
            <p className="text-body-sm text-text-muted">
              Every balance agreed with its ledger when this last ran
              {walletRun ? ` on ${formatDateTimeFull(walletRun.startedAt)}` : ""}. This is a real check
              against your data, not a status light.
            </p>
          ) : (
            <p
              role="alert"
              className="text-body-sm text-text-primary rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5"
            >
              {discrepancies} customer balance{discrepancies === 1 ? "" : "s"} disagree with their ledger.
              The ledger is the authoritative record. This is worth looking into rather than rebuilding
              automatically — a balance rewritten on sight destroys the evidence of how it drifted.
            </p>
          )}
        </SettingsSection>

        <SettingsSection
          title="What this page cannot tell you"
          icon={ShieldQuestion}
          description="So an empty section is not mistaken for a clean bill of health."
        >
          <p className="text-body-sm text-text-muted">
            Uptime, backup status, database size and load, connection counts and error rates are all in
            your Supabase project dashboard. Deployment and request metrics are in Vercel. This
            application has no access to any of them, and inventing a value for them would be worse than
            leaving the space empty.
          </p>
          <p className="text-body-sm text-text-muted">
            There is no uptime monitoring and no backup verification wired into this app. If you want
            either reported here, they need a real source first.
          </p>
        </SettingsSection>
      </div>
    </SettingsPageLayout>
  );
}
