"use client";

import { Activity, ShieldCheck, UserCog } from "lucide-react";

import type { StaffHistoryEntry } from "@/src/lib/supabase/staff-detail-queries";

/*
| Everything that has happened to this account, newest first.
|
| Three sources merged into one list: status changes, role changes and audit
| events. Merged rather than tabbed because the question a reader has is "what
| happened to this account", not "what happened to this account in the status
| table" — and the answer usually spans two of them, a suspension and the note
| explaining it arriving a second apart.
|
| WHY AN EMPTY LIST AND A FAILED READ LOOK DIFFERENT
|
| A blank history can mean nothing has happened, or it can mean the reader is
| not allowed to see what happened. Those are opposite facts and a reader
| cannot tell them apart from an empty panel, so a failed read says so.
|
| The rows come from database triggers, so a change made directly in SQL
| appears here exactly like one made from a button.
*/

const KIND_ICON = {
  status: ShieldCheck,
  role: UserCog,
  event: Activity,
} as const;

const KIND_TINT = {
  status: "text-primary",
  role: "text-warning",
  event: "text-text-muted",
} as const;

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  // Dubai is fixed UTC+04:00 and has had no daylight saving since 1990, so an
  // explicit zone here is stable rather than a guess about the reader.
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });
}

interface StaffHistoryTimelineProps {
  history: StaffHistoryEntry[];
  readFailed: boolean;
}

export function StaffHistoryTimeline({ history, readFailed }: StaffHistoryTimelineProps) {
  if (readFailed) {
    return (
      <div className="border-danger/30 bg-danger/[0.04] rounded-xl border px-4 py-3">
        <p className="text-text-primary text-[13px] font-semibold">This account&apos;s history couldn&apos;t be read</p>
        <p className="text-text-muted mt-0.5 text-[12px]">
          That is a read failure, not an empty history. Nothing has been changed.
        </p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <p className="text-text-muted py-6 text-center text-[13px]">
        Nothing has changed on this account since it was created.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0">
      {history.map((entry, index) => {
        const Icon = KIND_ICON[entry.kind];
        const last = index === history.length - 1;

        return (
          <li key={entry.id} className="relative flex gap-3 pb-5">
            {/* The connecting line, stopped before the final entry so the
                timeline ends rather than trailing off. */}
            {!last && <span className="bg-border absolute top-7 left-[13px] h-full w-px" aria-hidden="true" />}

            <span
              className={`border-border bg-card relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border ${KIND_TINT[entry.kind]}`}
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-text-primary text-[13px] font-medium">{entry.summary}</p>

              <p className="text-text-muted mt-0.5 text-[12px]">
                {formatWhen(entry.at)}
                {entry.actorName && <> · by {entry.actorName}</>}
              </p>

              {entry.reason && (
                <p className="border-border text-text-muted mt-1.5 border-l-2 pl-2.5 text-[12px] italic">
                  {entry.reason}
                </p>
              )}

              {entry.detail && <p className="text-text-subtle mt-1 text-[12px]">{entry.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
