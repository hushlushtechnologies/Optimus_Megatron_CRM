import {
  Archive,
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  Gavel,
  Inbox,
  PencilLine,
  RefreshCw,
  StickyNote,
  type LucideIcon,
} from "lucide-react";

import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type { EnquiryTimelineEntry, EnquiryTimelineKind } from "@/src/lib/types/enquiry-timeline";

const ICONS: Record<EnquiryTimelineKind, LucideIcon> = {
  created: Inbox,
  status: RefreshCw,
  assignment: ArrowRightLeft,
  converted: CheckCircle2,
  note: StickyNote,
  follow_up: CalendarClock,
  valuation: Gavel,
  edited: PencilLine,
  archived: Archive,
};

interface EnquiryTimelineProps {
  /** null means it couldn't be loaded, which is not the same as nothing happened. */
  entries: EnquiryTimelineEntry[] | null;
  emptyLabel?: string;
}

/**
 * What has happened to this enquiry, newest first.
 *
 * Reads as a sentence per line — what changed, who did it, when — because
 * the question somebody actually brings to a history is "who moved this and
 * why", not "what fields were written".
 */
export function EnquiryTimeline({
  entries,
  emptyLabel = "Nothing has happened to this enquiry yet.",
}: EnquiryTimelineProps) {
  if (entries === null) {
    return (
      <p
        role="alert"
        className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
      >
        The history couldn&apos;t be loaded. Refresh the page to try again.
      </p>
    );
  }

  if (entries.length === 0) {
    return <p className="text-body-sm text-text-muted">{emptyLabel}</p>;
  }

  return (
    <ol className="border-border relative flex flex-col gap-5 border-l pl-4">
      {entries.map((entry) => {
        const Icon = ICONS[entry.kind] ?? RefreshCw;

        return (
          <li key={entry.id} className="relative">
            {/* The dot sits on the rail, so the eye can run straight down it. */}
            <span className="bg-card border-border absolute top-0.5 -left-[25px] flex size-4 items-center justify-center rounded-full border">
              <Icon className="text-text-subtle size-2.5" aria-hidden="true" />
            </span>

            <p className="text-body-sm text-text-primary">{entry.title}</p>

            {entry.detail && <p className="text-body-sm text-text-muted mt-0.5">{entry.detail}</p>}

            <p className="text-caption text-text-subtle mt-0.5">
              {formatDateTimeFull(entry.at)}
              {entry.actorName ? ` · ${entry.actorName}` : " · from the website"}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
