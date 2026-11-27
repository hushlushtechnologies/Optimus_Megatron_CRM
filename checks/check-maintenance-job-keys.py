#!/usr/bin/env python3
"""
The job names the SQL writes must be exactly the keys the page looks for.

WHY THIS CHECK EXISTS

The scheduler page matches run-log rows to jobs by name:

    maintenance_runs.job  ==  MAINTENANCE_JOBS[].key

The SQL writes those names as string literals inside run_maintenance_jobs().
The page holds them as string literals in maintenance-queries.ts. Nothing
connects the two — not a type, not an import, not a foreign key.

So a rename on either side fails silently and in the worst possible
direction. The page would show "Has never run" for a job that is running
perfectly well every night, and "Has never run" is exactly the state that
means somebody should go and install a scheduler. The one thing this page
exists to report would be wrong, and nothing would error.

A type checker cannot see across a .ts file and a .sql file. Hence a script.

WHAT IT CHECKS

  1. every key in MAINTENANCE_JOBS is written by the SQL
  2. every job name the SQL writes is in MAINTENANCE_JOBS
  3. the preview function reports on the same set

Rule 2 matters as much as rule 1: a job the SQL runs and logs but the page
does not know about is a job whose failures nobody sees.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQL = ROOT / "sql" / "14-sprint-10-maintenance-scheduler.sql"
TS = ROOT / "src" / "lib" / "supabase" / "maintenance-queries.ts"

# 'all' is the name used for the whole-run row written when a run is skipped
# because another held the advisory lock. It is not a job and the page does
# not list it.
NOT_A_JOB = {"all"}


def main():
    for path in (SQL, TS):
        if not path.exists():
            print(f"  FAIL  {path.relative_to(ROOT)} does not exist")
            return 1

    sql = SQL.read_text(encoding="utf-8")
    ts = TS.read_text(encoding="utf-8")

    # What the SQL inserts into maintenance_runs.
    logged = set()
    for match in re.finditer(r"values\s*\(\s*'([a-z_]+)'", sql):
        name = match.group(1)
        if name not in NOT_A_JOB:
            logged.add(name)

    # What the SQL's preview reports on. Scoped to that function's body: an
    # unscoped scan picks up the 'all'::text row that run_maintenance_jobs
    # returns when a run is skipped, which is not a preview row at all. This
    # script flagged that on its first run, which is the behaviour you want
    # from it — but the pattern was wrong, not the SQL.
    preview_start = sql.find("create or replace function public.preview_maintenance")
    preview_end = sql.find("revoke all on function public.preview_maintenance", preview_start)
    previewed = set()
    if preview_start != -1 and preview_end != -1:
        for match in re.finditer(r"select\s*\n?\s*'([a-z_]+)'::text,", sql[preview_start:preview_end]):
            name = match.group(1)
            if name not in NOT_A_JOB:
                previewed.add(name)

    # What the page looks for. Scoped to the MAINTENANCE_JOBS array so a
    # `key:` elsewhere in the file is not picked up.
    start = ts.find("MAINTENANCE_JOBS")
    end = ts.find("] as const", start)
    if start == -1 or end == -1:
        print("  FAIL  could not find the MAINTENANCE_JOBS array in maintenance-queries.ts")
        return 1
    page = set(re.findall(r'key:\s*"([a-z_]+)"', ts[start:end]))

    print("=" * 70)
    print("SPRINT 10 — MAINTENANCE JOB NAMES MATCH ACROSS SQL AND TYPESCRIPT")
    print("=" * 70)
    print(f"\n  sql/14 logs:     {', '.join(sorted(logged)) or '(none found)'}")
    print(f"  sql/14 previews: {', '.join(sorted(previewed)) or '(none found)'}")
    print(f"  the page lists:  {', '.join(sorted(page)) or '(none found)'}\n")

    problems = []

    if not logged:
        problems.append("no job names found in the SQL — this script's pattern is stale")
    if not page:
        problems.append("no job keys found in the page — this script's pattern is stale")
    if not previewed:
        problems.append("no preview rows found — this script's pattern is stale, or preview_maintenance is gone")

    for name in sorted(page - logged):
        problems.append(
            f'the page lists "{name}" but the SQL never logs it — '
            f'that job would read as "Has never run" forever'
        )
    for name in sorted(logged - page):
        problems.append(
            f'the SQL logs "{name}" but the page does not list it — '
            f"its failures would not be shown anywhere"
        )
    for name in sorted(logged - previewed):
        problems.append(
            f'the SQL logs "{name}" but the preview does not report on it — '
            f"there would be no way to size its first run"
        )
    for name in sorted(previewed - logged):
        problems.append(f'the preview reports on "{name}" but no job writes it')

    if problems:
        for problem in problems:
            print(f"  FAIL  {problem}")
        print(f"\n{len(problems)} problem(s).")
        return 1

    print(f"All {len(page)} job(s) agree across the SQL, its preview and the page.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
