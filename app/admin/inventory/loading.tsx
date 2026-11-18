import { ListPageSkeleton } from "@/src/components/shared/page-skeletons";

const METRICS = ["Total Cars", "Available", "Reserved", "Sold", "Coming Soon", "Draft"];

export default function InventoryLoading() {
  return <ListPageSkeleton label="inventory" metricLabels={METRICS} />;
}