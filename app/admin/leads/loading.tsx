import { ListPageSkeleton } from "@/src/components/shared/page-skeletons";

const METRICS = ["Total Leads", "New Leads", "Follow-Ups Due", "Hot Leads", "Won", "Lost"];

export default function LeadsLoading() {
  return <ListPageSkeleton label="leads" metricLabels={METRICS} />;
}
