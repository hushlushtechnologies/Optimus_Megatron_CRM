import { ListPageSkeleton } from "@/src/components/shared/page-skeletons";

const METRICS = ["Deals created", "Completed", "Still open", "Win rate", "Cancelled", "Collected"];

export default function ReportsLoading() {
  return <ListPageSkeleton label="sales reports" metricLabels={METRICS} hasPrimaryAction={false} />;
}
