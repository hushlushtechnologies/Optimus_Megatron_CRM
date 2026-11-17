import { Skeleton } from "@/src/components/ui/skeleton";

export default function SalesDealLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading deal">
      <Skeleton className="h-5 w-24" />
      <div className="surface-card flex flex-col gap-5 p-5">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-11 w-full max-w-md" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}