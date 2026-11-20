import { FormPageSkeleton } from "@/src/components/shared/page-skeletons";

/*
 * One section, because that is all the form shows until the first question
 * is answered. Three would collapse to one the moment it loaded.
 */
export default function NewEnquiryLoading() {
  return <FormPageSkeleton sections={1} label="the enquiry form" />;
}
