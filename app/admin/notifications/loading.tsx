import { Skeleton } from "@/src/components/ui/skeleton";

export default function NotificationsLoading() {
  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Filter */}
      <Skeleton className="h-11 w-40 rounded-lg" />

      {/* Groups */}
      {[0, 1].map((group) => (
        <div key={group} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />

          <div className="surface-card divide-border divide-y">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-start gap-3 p-4">
                <Skeleton className="size-8 shrink-0 rounded-full" />

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3 w-28" />
                </div>

                <Skeleton className="size-9 shrink-0 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <span className="sr-only" role="status">
        Loading notifications
      </span>
    </div>
  );
}
