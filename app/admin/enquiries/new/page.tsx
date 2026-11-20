import { getMyEnquiryPermissions } from "@/src/lib/supabase/enquiry-permissions";
import { getEnquiryLookups } from "@/src/lib/supabase/enquiry-queries";
import { getEnquiryWorkflow } from "@/src/lib/supabase/enquiry-workflow-queries";
import { createClient } from "@/src/lib/supabase/server";
import { activeSources, activeTypes } from "@/src/lib/utils/enquiry-workflow";

import { EnquiryAccessDenied } from "@/src/components/enquiries/enquiry-access-denied";
import { NewEnquiryForm } from "@/src/components/enquiries/form/new-enquiry-form";

export default async function NewEnquiryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const permissions = user ? await getMyEnquiryPermissions(supabase) : null;

  if (!user || !permissions || !permissions.manage) {
    return (
      <EnquiryAccessDenied
        action="add an enquiry"
        reason="Ask an administrator if you take enquiries by phone or at the showroom."
        backHref="/admin/enquiries"
        backLabel="Back to enquiry requests"
      />
    );
  }

  const [lookups, workflow] = await Promise.all([getEnquiryLookups(), getEnquiryWorkflow()]);

  const types = activeTypes(workflow).map((item) => ({ key: item.key, label: item.label }));

  /*
   * Website is left out on purpose. An enquiry entered here came in some
   * other way, and letting somebody label a phone call as a website enquiry
   * would quietly corrupt the one figure this module exists to report on.
   */
  const sources = activeSources(workflow)
    .filter((item) => item.key !== "Website")
    .map((item) => ({ key: item.key, label: item.label }));

  return (
    <NewEnquiryForm
      types={types}
      sources={sources}
      staff={lookups.staff}
      locations={lookups.locations}
      cars={lookups.cars}
      brands={lookups.brands}
      fuelTypes={lookups.fuelTypes}
      transmissions={lookups.transmissions}
      currentUserId={user.id}
    />
  );
}
