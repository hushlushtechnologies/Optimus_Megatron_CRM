import { Clock, Database, ListChecks, Terminal } from "lucide-react";
import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { SettingsLoadError } from "@/src/components/settings/settings-load-error";
import {
  DiscrepancyBadge,
  OutcomeBadge,
  RunMaintenanceButton,
} from "@/src/components/settings/scheduler-client";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import {
  canEditCategory,
  canOpenSettingsPage,
  currentSettingsAccess,
} from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import {
  MAINTENANCE_JOBS,
  getSchedulerState,
  latestByJob,
} from "@/src/lib/supabase/maintenance-queries";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";

export const metadata = {
  title: "Scheduled jobs · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| SCHEDULED JOBS — PHASE 20
|--------------------------------------------------------------------------
|
| Every state on this page comes from a row in maintenance_runs or from a
| query against the data itself. Sprint 10 forbids inventing a system
| health status, and the way to keep that promise is to have nothing to
| invent with: there is no "healthy" calculation here.
|
| The three states are kept apart on purpose:
|
|   not installed   sql/14 has not been run; the log table is absent
|   never run       installed, nothing has run yet
|   running         there is history to show
|
| "Nothing has run yet" and "ran last night, found nothing" look almost
| identical on a screen and mean opposite things. One is a scheduler
| nobody set up.
|
| TWO JOBS ARE NOT HERE, and that is the honest finding of this phase.
| notifyOfferExpiringSoon and notifyPointsExpiringSoon are TypeScript, not
| SQL, and pg_cron cannot call TypeScript. They need an HTTP mechanism —
| a route this app exposes plus pg_net, or an edge function. Writing SQL
| copies of them would mean two places creating notifications, which is
| worse than two mechanisms. The section at the bottom says so rather than
| leaving them out.
*/

function jobSpec(key: string) {
  return MAINTENANCE_JOBS.find((job) => job.key === key);
}

function detailLine(job: string, detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  const n = (key: string) => Number(detail[key] ?? 0);

  switch (job) {
    case "promotion_statuses":
      return n("changed") === 0 ? "Nothing to change." : `${n("changed")} campaign status(es) moved.`;
    case "loyalty_reservations":
      return n("released") === 0
        ? "No holds to release."
        : `${n("released")} hold(s) released back to customers.`;
    case "loyalty_expiry":
      return n("points_expired") === 0
        ? "No points due to expire."
        : `${n("points_expired").toLocaleString("en-GB")} points expired across ${n("customers_affected")} customer(s).`;
    case "loyalty_wallet_check":
      return n("discrepancies") === 0
        ? "Every balance agrees with its ledger."
        : `${n("discrepancies")} wallet(s) disagree with their ledger.`;
    default:
      return null;
  }
}

export default async function SchedulerSettingsPage() {
  const page = findSettingsPage("reminders");
  if (!page) throw new Error("Settings registry is missing the 'reminders' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  // Reading the page is a communications matter. Setting a points-expiry
  // backlog running is not, so the button needs the system permission.
  const canRun = canEditCategory(access, "system");
  const state = await getSchedulerState();

  if (state.status === "error") {
    return (
      <SettingsPageLayout page={page}>
        <SettingsLoadError what="The job history" />
      </SettingsPageLayout>
    );
  }

  if (state.status === "not_installed") {
    return (
      <SettingsPageLayout
        page={page}
        readOnlyNote="No scheduler is installed yet. Nothing on this page is running."
      >
        <SettingsSection
          title="Not installed"
          icon={Terminal}
          description="Sprint 8 built four maintenance functions. Nothing has ever scheduled them."
        >
          <p className="text-body-sm text-text-muted">
            Run <code className="text-text-primary">sql/14-sprint-10-maintenance-scheduler.sql</code> in
            Supabase. It installs the job wrapper, a run log and a read-only preview, and it changes no
            campaign, no reservation and no points balance. The nightly schedule at the end of that file is
            commented out — the file explains what to look at before enabling it.
          </p>
          <p className="text-body-sm text-text-muted">
            Until then: discounts are still correct, because eligibility is checked against dates on every
            read. What is stale is the stored campaign status, abandoned point holds that have never been
            released, and points past their expiry that are still counted in balances.
          </p>
        </SettingsSection>
      </SettingsPageLayout>
    );
  }

  const latest = state.status === "running" ? latestByJob(state.runs) : new Map();
  const preview = state.preview;
  const backlog = (preview ?? []).some((row) => row.wouldAffect > 0);

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote={
        state.status === "installed_never_run"
          ? "Installed, but nothing has run yet. If the nightly schedule is enabled this will fill in after it first runs."
          : undefined
      }
    >
      <div className="flex flex-col gap-6 pb-12">
        <SettingsSection
          title="The jobs"
          icon={ListChecks}
          description="What each one does, and when it last ran."
        >
          <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
            {MAINTENANCE_JOBS.map((job) => {
              const run = latest.get(job.key);
              const waiting = preview?.find((row) => row.job === job.key);

              return (
                <li key={job.key} className="flex flex-col gap-1.5 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-body-sm text-text-primary font-medium">
                      {job.label}
                      {!job.writes && (
                        <span className="text-caption text-text-subtle ml-2 font-normal">
                          reports only
                        </span>
                      )}
                    </p>
                    {run ? <OutcomeBadge outcome={run.outcome} /> : null}
                  </div>

                  <p className="text-caption text-text-muted">{job.what}</p>

                  {run ? (
                    <>
                      <p className="text-caption text-text-subtle">
                        Last run {formatDateTimeFull(run.startedAt)}
                        {run.triggeredBy === "cron" ? " by the schedule" : " by hand"}
                        {detailLine(job.key, run.detail) ? ` — ${detailLine(job.key, run.detail)}` : ""}
                      </p>
                      {run.outcome === "failed" && (
                        <p
                          role="alert"
                          className="text-caption text-text-primary rounded border border-red-500/40 bg-red-500/10 px-2 py-1"
                        >
                          It failed with: {run.error ?? "no message recorded"}
                        </p>
                      )}
                      {job.key === "loyalty_wallet_check" && run.detail ? (
                        <DiscrepancyBadge count={Number(run.detail.discrepancies ?? 0)} />
                      ) : null}
                    </>
                  ) : (
                    <p className="text-caption text-text-subtle">Has never run.</p>
                  )}

                  {waiting && waiting.wouldAffect > 0 && (
                    <p className="text-caption text-amber-500">
                      {waiting.wouldAffect} item(s) waiting for this job.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </SettingsSection>

        <SettingsSection
          title="What is waiting"
          icon={Database}
          description="Read live from your data. Nothing here has been changed."
          effect="This is what the next run would do. The points expiry figure is the one to read carefully: it has never run, so the first run clears the whole backlog at once."
        >
          {preview === null ? (
            <p
              role="alert"
              className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
            >
              The preview couldn&apos;t be read, so there is no figure to show. Nothing has been changed.
            </p>
          ) : (
            <>
              <dl className="flex flex-col gap-2">
                {preview.map((row) => (
                  <div
                    key={row.job}
                    className="border-border bg-card-hover/40 flex flex-wrap items-baseline justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <dt className="text-body-sm text-text-primary">
                      {jobSpec(row.job)?.label ?? row.job}
                    </dt>
                    <dd className="text-body-sm text-text-primary tabular-nums">
                      {row.job === "loyalty_expiry" && row.detail
                        ? `${Number(row.detail.points_to_expire ?? 0).toLocaleString("en-GB")} points, ${Number(row.detail.customers ?? 0)} customer(s)`
                        : row.job === "loyalty_reservations" && row.detail
                          ? `${Number(row.detail.points_to_release ?? 0).toLocaleString("en-GB")} points held`
                          : row.job === "loyalty_wallet_check"
                            ? `${row.wouldAffect} disagree`
                            : `${row.wouldAffect} waiting`}
                    </dd>
                  </div>
                ))}
              </dl>

              {preview.find((row) => row.job === "loyalty_expiry")?.detail?.expiry_months_setting ===
                null && (
                <p className="text-body-sm text-text-muted">
                  Points expiry is switched off in your loyalty settings, so that job has nothing to do
                  however long it has been since it last ran.
                </p>
              )}
            </>
          )}

          {canRun && <RunMaintenanceButton hasBacklog={backlog} />}
          {!canRun && (
            <p className="text-caption text-text-subtle">
              Running the jobs needs the system settings permission. Three of the four move loyalty points
              or campaign states.
            </p>
          )}
        </SettingsSection>

        {state.status === "running" && (
          <SettingsSection
            title="Run history"
            icon={Clock}
            description="Every run, including the ones that failed and the ones skipped because another was already going."
          >
            <ol className="flex flex-col gap-2">
              {state.runs.slice(0, 20).map((run) => (
                <li key={run.id} className="border-border flex flex-col gap-0.5 border-l-2 pl-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-body-sm text-text-primary">
                      {jobSpec(run.job)?.label ?? run.job}
                    </p>
                    <OutcomeBadge outcome={run.outcome} />
                  </div>
                  <p className="text-caption text-text-subtle">
                    {formatDateTimeFull(run.startedAt)} ·{" "}
                    {run.triggeredBy === "cron" ? "the schedule" : "by hand"}
                    {detailLine(run.job, run.detail) ? ` · ${detailLine(run.job, run.detail)}` : ""}
                  </p>
                  {run.error && <p className="text-caption text-red-500">{run.error}</p>}
                </li>
              ))}
            </ol>
          </SettingsSection>
        )}

        <SettingsSection
          title="Two reminder jobs need a different mechanism"
          icon={Terminal}
          description="Why they are not in the list above."
        >
          <p className="text-body-sm text-text-muted">
            Sprint 8 wrote two notifications that are due at a time rather than in response to an action —
            an offer expiring soon, and a customer&apos;s points expiring soon. Neither has ever been
            called.
          </p>
          <p className="text-body-sm text-text-muted">
            They are TypeScript rather than SQL, and the database&apos;s scheduler can only call SQL. So
            they need an HTTP route this app exposes, called either by Supabase&apos;s <code>pg_net</code>{" "}
            or by an edge function. Writing SQL copies of them would mean two different places creating
            notifications, each able to drift from the other — worse than having two mechanisms.
          </p>
          <p className="text-body-sm text-text-muted">
            That belongs with the notification work rather than here, because the route needs to know who
            should receive each reminder, and there is no notification preference storage yet.
          </p>
        </SettingsSection>
      </div>
    </SettingsPageLayout>
  );
}
