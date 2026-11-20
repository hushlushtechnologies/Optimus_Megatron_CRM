"use client";

import { Sparkles } from "lucide-react";

import {
  EnquiryField,
  EnquiryFieldEmpty,
  EnquirySection,
} from "@/src/components/enquiries/enquiry-detail-section";
import { EnquiryDreamCarMatch } from "@/src/components/enquiries/enquiry-dream-car-match";
import {
  describeBudget,
  describeDreamCar,
  type EnquiryDreamCarDetails,
  type EnquiryStockCar,
} from "@/src/lib/types/enquiry-details";

interface EnquiryDreamCarCardProps {
  details: EnquiryDreamCarDetails;
  /** Used to write the match, so the card needs to know which enquiry. */
  enquiryId: string;
  /** The linked car read live from stock, so a sold car doesn't read as available. */
  matchedCar: EnquiryStockCar | null;
  canManage: boolean;
  index?: number;
}

/* =========================================================
   HELPERS
========================================================= */

/** A year range, however much of it they gave. */
function years(from: number | null, to: number | null): string | null {
  if (from !== null && to !== null) return from === to ? String(from) : `${from} – ${to}`;
  if (from !== null) return `${from} or newer`;
  if (to !== null) return `${to} or older`;

  return null;
}

/* =========================================================
   COMPONENT
========================================================= */

/**
 * The brief for a car the showroom hasn't got.
 *
 * Most of these briefs are half-filled, which is normal — somebody gave what
 * they knew over the phone. Empty fields read "No preference" rather than
 * being hidden, because the difference between "any colour will do" and
 * "nobody asked about colour" is what the next person needs to know before
 * they ring back.
 */
export function EnquiryDreamCarCard({
  details,
  enquiryId,
  matchedCar,
  canManage,
  index = 0,
}: EnquiryDreamCarCardProps) {
  const budget = describeBudget(details.budgetMin, details.budgetMax);
  const yearRange = years(details.yearFrom, details.yearTo);

  return (
    <EnquirySection
      title="What they're looking for"
      index={index}
      icon={<Sparkles className="size-4" aria-hidden="true" />}
      description={describeDreamCar(details)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <EnquiryField label="Years">
          {yearRange ?? <EnquiryFieldEmpty>No preference</EnquiryFieldEmpty>}
        </EnquiryField>

        <EnquiryField label="Budget">
          {budget ?? <EnquiryFieldEmpty>Not discussed</EnquiryFieldEmpty>}
        </EnquiryField>

        <EnquiryField label="Exterior">
          {details.exteriorColor ?? <EnquiryFieldEmpty>No preference</EnquiryFieldEmpty>}
        </EnquiryField>

        <EnquiryField label="Interior">
          {details.interiorColor ?? <EnquiryFieldEmpty>No preference</EnquiryFieldEmpty>}
        </EnquiryField>

        <EnquiryField label="Mileage limit">
          {details.maxMileageKm === null ? (
            <EnquiryFieldEmpty>No limit given</EnquiryFieldEmpty>
          ) : (
            `Up to ${details.maxMileageKm.toLocaleString()} km`
          )}
        </EnquiryField>

        <EnquiryField label="Specification">
          {details.spec ?? <EnquiryFieldEmpty>No preference</EnquiryFieldEmpty>}
        </EnquiryField>

        <EnquiryField label="Fuel">
          {details.fuelType ?? <EnquiryFieldEmpty>No preference</EnquiryFieldEmpty>}
        </EnquiryField>

        <EnquiryField label="Gearbox">
          {details.transmission ?? <EnquiryFieldEmpty>No preference</EnquiryFieldEmpty>}
        </EnquiryField>
      </div>

      {/* The one field worth its own row: it is usually the deciding one. */}
      <EnquiryField label="Must-haves">
        {details.features ?? <EnquiryFieldEmpty>None given</EnquiryFieldEmpty>}
      </EnquiryField>

      <EnquiryField label="Looking to buy">
        {details.timeline ?? <EnquiryFieldEmpty>Not discussed</EnquiryFieldEmpty>}
      </EnquiryField>

      {details.notes && <EnquiryField label="Notes">{details.notes}</EnquiryField>}

      <EnquiryDreamCarMatch
        enquiryId={enquiryId}
        matched={matchedCar}
        matchedAt={details.matchedAt}
        canManage={canManage}
      />
    </EnquirySection>
  );
}
