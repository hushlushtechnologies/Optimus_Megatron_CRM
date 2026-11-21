import { CalendarClock, Infinity as InfinityIcon } from "lucide-react";

import { cn } from "@/src/lib/utils/cn";
import { describeCampaignWindow } from "@/src/lib/utils/campaign-window";
import type { PromotionStatus } from "@/src/lib/types/offers";

interface CampaignTimelineProps {
  startsAt: string | null;
  endsAt: string | null;
  status: PromotionStatus;
  className?: string;
}

/**
 * When a campaign runs, and where it is in that window.
 *
 * All the date reasoning lives in describeCampaignWindow, which takes `now`
 * as a parameter — so this renders what it is given and the arithmetic is
 * tested on its own.
 */
export function CampaignTimeline({ startsAt, endsAt, status, className }: CampaignTimelineProps) {
  const { label, progress, remaining } = describeCampaignWindow(startsAt, endsAt);

  const openEnded = startsAt === null && endsAt === null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {openEnded ? (
          <InfinityIcon className="text-text-muted size-4 shrink-0" aria-hidden="true" />
        ) : (
          <CalendarClock className="text-text-muted size-4 shrink-0" aria-hidden="true" />
        )}

        <span className="text-body-sm text-text-primary">{label}</span>

        {remaining && status === "active" && (
          <span
            className={cn(
              "text-caption",
              remaining === "ends today" || remaining === "ended"
                ? "text-text-primary font-medium"
                : "text-text-muted",
            )}
          >
            · {remaining}
          </span>
        )}
      </div>

      {progress !== null && (
        <div
          className="bg-card-hover h-1.5 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="How far through its window this campaign is"
        >
          <div
            className="bg-gradient-primary h-full rounded-full transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
