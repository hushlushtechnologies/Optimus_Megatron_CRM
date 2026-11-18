import { RecordNotFound } from "@/src/components/shared/record-not-found";

export default function DealNotFound() {
  return (
    <RecordNotFound
      record="Deal"
      backHref="/admin/sales"
      backLabel="Sales"
      description="This deal doesn't exist, or you don't have permission to see it. If you believe you should, ask an administrator."
    />
  );
}
