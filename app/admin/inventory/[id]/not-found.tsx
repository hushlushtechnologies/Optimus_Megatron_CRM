import { RecordNotFound } from "@/src/components/shared/record-not-found";

export default function VehicleNotFound() {
  return (
    <RecordNotFound
      record="Vehicle"
      backHref="/admin/inventory"
      backLabel="Inventory"
      description="This vehicle doesn't exist, or the link is wrong. It may have been archived, deleted, or the address mistyped."
    />
  );
}