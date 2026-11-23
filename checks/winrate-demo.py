#!/usr/bin/env python3
"""
Demonstrates the win-rate cohort defect in getSalesReport.

The current formula, verbatim from sales-report-queries.ts line 252:

    winRate = round((completedRows.length / createdRows.length) * 100)

where
    completedRows = deals whose status is Completed AND completed_at in window
    createdRows   = deals whose created_at in window (ANY status)

Those are two different populations. A deal created in October and completed
in November appears in November's numerator and October's denominator, so the
ratio is not a rate of anything.
"""

# A deliberately ordinary November for a dealership with a ~2 month sales cycle.
deals = [
    # (created_month, completed_month or None)
    ("Sep", "Nov"), ("Sep", "Nov"), ("Sep", "Nov"),
    ("Oct", "Nov"), ("Oct", "Nov"), ("Oct", "Nov"), ("Oct", "Nov"),
    ("Oct", "Dec"), ("Oct", None),
    ("Nov", "Nov"), ("Nov", "Nov"),
    ("Nov", None), ("Nov", None), ("Nov", None), ("Nov", None),
]

WINDOW = "Nov"

created_in_window   = [d for d in deals if d[0] == WINDOW]
completed_in_window = [d for d in deals if d[1] == WINDOW]

current = round(len(completed_in_window) / len(created_in_window) * 100)

# Cohort-correct: of the deals CREATED in the window, how many have completed?
cohort_completed = [d for d in created_in_window if d[1] is not None]
cohort = round(len(cohort_completed) / len(created_in_window) * 100)

print(f"window: {WINDOW}")
print(f"  deals created in window   : {len(created_in_window)}")
print(f"  deals completed in window : {len(completed_in_window)}")
print()
print(f"  CURRENT formula  : {current}%   <-- shown on the Win rate card")
print(f"  cohort-correct   : {cohort}%   (of deals created in Nov, how many closed)")
print()
if current > 100:
    print(f"  The current figure EXCEEDS 100%, which a rate cannot.")
print(f"  The two differ by {abs(current - cohort)} percentage points on this ordinary month.")
