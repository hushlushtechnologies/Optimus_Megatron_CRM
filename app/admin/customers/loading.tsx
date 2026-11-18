import { ListPageSkeleton } from "@/src/components/shared/page-skeletons";

const METRICS = ["Active Customers", "New Today", "New This Month", "With Active Deals", "Inactive"];

export default function CustomersLoading() {
  return <ListPageSkeleton label="customers" metricLabels={METRICS} />;
}
