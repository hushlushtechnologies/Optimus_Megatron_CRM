import { RecordNotFound } from "@/src/components/shared/record-not-found";

export default function EnquiryNotFound() {
  return (
    <RecordNotFound
      record="Enquiry"
      backHref="/admin/enquiries"
      backLabel="Enquiry requests"
      description="This enquiry doesn't exist, or you don't have permission to see it. It may also have been deleted as spam."
    />
  );
}
