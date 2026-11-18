import { RecordNotFound } from "@/src/components/shared/record-not-found";

export default function CustomerNotFound() {
  return <RecordNotFound record="Customer" backHref="/admin/customers" backLabel="Customers" />;
}