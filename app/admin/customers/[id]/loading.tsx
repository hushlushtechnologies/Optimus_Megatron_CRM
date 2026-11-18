import { DetailPageSkeleton } from "@/src/components/shared/page-skeletons";

export default function CustomerDetailLoading() {
  return <DetailPageSkeleton label="this customer" tabs={8} aside="right" />;
}