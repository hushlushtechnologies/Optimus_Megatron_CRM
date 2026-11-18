import { RecordNotFound } from "@/src/components/shared/record-not-found";

export default function ReservationNotFound() {
  return (
    <RecordNotFound
      record="Reservation"
      backHref="/admin/reservations"
      backLabel="Reservations"
      description="This reservation doesn't exist, or you don't have permission to see it. If you believe you should, ask an administrator."
    />
  );
}
