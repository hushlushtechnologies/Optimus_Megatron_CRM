import { MetricCard } from "@/src/components/shared/metric-card";
import { Skeleton } from "@/src/components/ui/skeleton";

/*
|--------------------------------------------------------------------------
| PAGE SKELETONS
|--------------------------------------------------------------------------
|
| The three shapes every admin route falls into. Test Drives and Sales had
| hand-written skeletons; Leads, Customers, Inventory and Reservations had
| none and fell back to the dashboard skeleton, so their layout jumped on
| every navigation.
|
| These match the real pages closely enough that nothing moves when the
| content arrives, and each one announces itself to screen readers once.
*/

interface ListPageSkeletonProps {
  /** The metric labels above the table, in order. Omit when the page has none. */
  metricLabels?: string[];
  /** Whether the page header has a primary action button. */
  hasPrimaryAction?: boolean;
  /** What is loading, for the screen reader announcement: "leads", "customers". */
  label: string;
}

/** List pages: header, optional metric row, toolbar, table. */
export function ListPageSkeleton({ metricLabels, hasPrimaryAction = true, label }: ListPageSkeletonProps) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label={`Loading ${label}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        {hasPrimaryAction && <Skeleton className="h-10 w-40" />}
      </div>

      {metricLabels && metricLabels.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {metricLabels.map((metric) => (
            <MetricCard key={metric} label={metric} value={0} isLoading />
          ))}
        </div>
      )}

      {/* Toolbar: search, filters, view switch */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full sm:max-w-xs" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>

      <Skeleton className="h-96 w-full" />
    </div>
  );
}

interface DetailPageSkeletonProps {
  /** Number of tabs to outline. */
  tabs?: number;
  /**
   * Where the secondary column sits. "right" matches the customer and deal
   * pages; "none" matches a single-column detail page.
   */
  aside?: "right" | "none";
  label: string;
}

/** Detail pages: back link, header with avatar and actions, tabs, body. */
export function DetailPageSkeleton({ tabs = 6, aside = "right", label }: DetailPageSkeletonProps) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label={`Loading ${label}`}>
      <Skeleton className="h-4 w-28" />

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <Skeleton className="size-16 shrink-0 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-28" />
            <div className="mt-1 flex gap-1.5">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-border flex gap-2 overflow-hidden border-b pb-2">
        {Array.from({ length: tabs }, (_, index) => (
          <Skeleton key={index} className="h-8 w-24 shrink-0" />
        ))}
      </div>

      {/* Body */}
      <div className={aside === "right" ? "grid grid-cols-1 gap-4 lg:grid-cols-3" : "grid grid-cols-1 gap-4"}>
        <div className={aside === "right" ? "flex flex-col gap-4 lg:col-span-2" : "flex flex-col gap-4"}>
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>

        {aside === "right" && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        )}
      </div>
    </div>
  );
}

interface FormPageSkeletonProps {
  /** Number of form sections to outline. */
  sections?: number;
  label: string;
}

/** Create and edit pages: header, stacked sections, sticky summary. */
export function FormPageSkeleton({ sections = 4, label }: FormPageSkeletonProps) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label={`Loading ${label}`}>
      <Skeleton className="h-4 w-28" />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          {Array.from({ length: sections }, (_, index) => (
            <div key={index} className="surface-card flex flex-col gap-4 p-5">
              <Skeleton className="h-3 w-32" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </div>
  );
}
