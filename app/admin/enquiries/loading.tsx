import { ListPageSkeleton } from "@/src/components/shared/page-skeletons";

/* Matches the six cards on the dashboard, so nothing jumps when they land. */
const METRICS = [
  "Total Enquiries",
  "New Requests",
  "In Progress",
  "Pending Follow-Ups",
  "Completed",
  "Urgent Requests",
];

export default function EnquiriesLoading() {
  return <ListPageSkeleton label="enquiries" metricLabels={METRICS} />;
}
