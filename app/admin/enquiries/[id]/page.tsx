import { notFound } from "next/navigation";

import { getMyEnquiryPermissions } from "@/src/lib/supabase/enquiry-permissions";
import {
  findCustomerMatches,
  getEnquiry,
  getEnquiryCustomerVehicles,
  getEnquiryDreamCarDetails,
  getEnquiryFinanceDetails,
  getEnquiryLookups,
  getEnquiryPhotos,
  getEnquiryStockCar,
  getEnquiryTimeline,
} from "@/src/lib/supabase/enquiry-queries";
import { getEnquiryFollowUps, getEnquiryNotes } from "@/src/lib/supabase/enquiry-work-queries";
import { getEnquiryWorkflow } from "@/src/lib/supabase/enquiry-workflow-queries";
import { getEnquiryLinks } from "@/src/lib/supabase/enquiry-link-queries";
import { createClient } from "@/src/lib/supabase/server";

import { EnquiryDetailClient } from "@/src/components/enquiries/enquiry-detail-client";
import { EnquiryAccessDenied } from "@/src/components/enquiries/enquiry-access-denied";

interface EnquiryDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function EnquiryDetailPage({ params }: EnquiryDetailPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const permissions = user ? await getMyEnquiryPermissions(supabase) : null;

  if (!user || !permissions || !permissions.view) {
    return (
      <EnquiryAccessDenied
        action="view enquiries"
        reason="Enquiries hold the contact details of people who have written in, so access is granted by role. Ask an administrator if you need it."
      />
    );
  }

  const enquiry = await getEnquiry(id);

  if (!enquiry) notFound();

  /*
   * The matches lookup is skipped once a customer is attached: the question it
   * answers — "is this somebody we know?" — has already been answered.
   */
  /*
   * Only the kinds that can have one pay for the query. Most enquiries are
   * neither a finance request nor a car somebody is selling.
   */
  const ownsVehicle = enquiry.enquiry_type === "Sell My Car" || enquiry.enquiry_type === "Trade-In";

  const [
    lookups,
    matches,
    finance,
    vehicles,
    photos,
    stockCar,
    dreamCar,
    timeline,
    workflow,
    notes,
    followUps,
    links,
  ] = await Promise.all([
    getEnquiryLookups(),
    enquiry.customer_id ? Promise.resolve([]) : findCustomerMatches(enquiry.email, enquiry.phone),
    enquiry.enquiry_type === "Finance" ? getEnquiryFinanceDetails(id) : Promise.resolve(null),
    ownsVehicle ? getEnquiryCustomerVehicles(id) : Promise.resolve([]),
    ownsVehicle ? getEnquiryPhotos(id) : Promise.resolve([]),
    /* Our half of a trade-in, read live so the price matches the listing. */
    enquiry.enquiry_type === "Trade-In" && enquiry.car_id
      ? getEnquiryStockCar(enquiry.car_id)
      : Promise.resolve(null),
    enquiry.enquiry_type === "Dream Car" ? getEnquiryDreamCarDetails(id) : Promise.resolve(null),
    getEnquiryTimeline(id),
    getEnquiryWorkflow(),
    getEnquiryNotes(id),
    getEnquiryFollowUps(id),
    getEnquiryLinks(enquiry),
  ]);

  /*
   * The linked car can only be fetched once we know there is one, so it
   * costs a second round-trip — but only on a dream-car enquiry that has a
   * match. Read live rather than stored with the match, so a car that has
   * sold since says so instead of still reading as available.
   */
  const matchedCar = dreamCar?.matchedCarId ? await getEnquiryStockCar(dreamCar.matchedCarId) : null;

  return (
    <EnquiryDetailClient
      enquiry={enquiry}
      matches={matches}
      stages={lookups.stages}
      staff={lookups.staff}
      finance={finance}
      vehicles={vehicles}
      photos={photos}
      stockCar={stockCar}
      dreamCar={dreamCar}
      matchedCar={matchedCar}
      timeline={timeline}
      notes={notes}
      followUps={followUps}
      links={links}
      workflow={workflow}
      permissions={permissions}
      currentUserId={user.id}
    />
  );
}
