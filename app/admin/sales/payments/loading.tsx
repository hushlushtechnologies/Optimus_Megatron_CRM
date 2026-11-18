import { ListPageSkeleton } from "@/src/components/shared/page-skeletons";

const METRICS = ["Awaiting verification", "Verified this month", "Reversed", "Total collected"];

export default function PaymentsLoading() {
  return <ListPageSkeleton label="payments" metricLabels={METRICS} hasPrimaryAction={false} />;
}