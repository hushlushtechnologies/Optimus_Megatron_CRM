import { ListPageSkeleton } from "@/src/components/shared/page-skeletons";

const METRICS = ["New", "In review", "Unassigned", "Waiting over a day", "Converted this month"];

export default function EnquiriesLoading() {
  return <ListPageSkeleton label="enquiries" metricLabels={METRICS} />;
}
