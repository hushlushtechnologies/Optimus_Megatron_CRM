import { DetailPageSkeleton } from "@/src/components/shared/page-skeletons";

export default function ReservationDetailLoading() {
  return <DetailPageSkeleton label="this reservation" tabs={3} aside="right" />;
}
