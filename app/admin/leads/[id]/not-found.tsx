import { RecordNotFound } from "@/src/components/shared/record-not-found";

export default function LeadNotFound() {
  return <RecordNotFound record="Lead" backHref="/admin/leads" backLabel="Leads" />;
}