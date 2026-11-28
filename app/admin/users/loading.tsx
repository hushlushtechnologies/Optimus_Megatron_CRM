import { ListPageSkeleton } from "@/src/components/shared/page-skeletons";

export default function Loading() {
  return (
    <ListPageSkeleton
      label="Loading staff accounts"
      metricLabels={["Total Staff", "Active", "Invited", "Suspended", "Deactivated", "No Role"]}
    />
  );
}
