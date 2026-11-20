"use client";

import Image from "next/image";
import { Car, Info } from "lucide-react";

import {
  EnquiryField,
  EnquiryFieldEmpty,
  EnquirySection,
} from "@/src/components/enquiries/enquiry-detail-section";
import { EnquiryValuationForm } from "@/src/components/enquiries/enquiry-valuation-form";
import {
  describeCustomerVehicle,
  type EnquiryCustomerVehicle,
  type EnquiryPhoto,
} from "@/src/lib/types/enquiry-details";
import { formatMoney } from "@/src/lib/utils/sales-format";

interface EnquiryCustomerVehicleCardProps {
  vehicle: EnquiryCustomerVehicle;
  /** Only the photos belonging to this vehicle. */
  photos: EnquiryPhoto[];
  /** Whether this person holds enquiries.valuate. */
  canValuate: boolean;
  index?: number;
}

/* =========================================================
   DECLARATION
========================================================= */

/**
 * A yes / no / not-asked answer, read back.
 *
 * "Not asked" is shown rather than hidden, because on a car somebody is
 * about to be paid for, an unanswered question about accident history is
 * itself worth seeing.
 */
function declared(value: boolean | null, yes: string, no: string) {
  if (value === null) return <EnquiryFieldEmpty>Not asked</EnquiryFieldEmpty>;

  return value ? yes : no;
}

/* =========================================================
   COMPONENT
========================================================= */

/**
 * A car the customer owns.
 *
 * Reads as a record of what somebody said, not as a listing: no stock
 * number, no published price, and a line at the bottom saying nothing here
 * has been inspected. Our own figures sit below a divider at the end, so the
 * customer's declarations and our assessment never read as one set of facts.
 */
export function EnquiryCustomerVehicleCard({
  vehicle,
  photos,
  canValuate,
  index = 0,
}: EnquiryCustomerVehicleCardProps) {
  const title = vehicle.role === "trade_in" ? "Their trade-in" : "The car they're selling";

  return (
    <EnquirySection
      title={title}
      index={index}
      icon={<Car className="size-4" aria-hidden="true" />}
      description={describeCustomerVehicle(vehicle)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <EnquiryField label="Mileage">
          {vehicle.mileageKm === null ? (
            <EnquiryFieldEmpty>Not given</EnquiryFieldEmpty>
          ) : (
            `${vehicle.mileageKm.toLocaleString()} km`
          )}
        </EnquiryField>

        <EnquiryField label="Condition, as described">
          {vehicle.condition ?? <EnquiryFieldEmpty>Not discussed</EnquiryFieldEmpty>}
        </EnquiryField>

        <EnquiryField label="Registered in">
          {vehicle.registrationEmirate ?? <EnquiryFieldEmpty>Not discussed</EnquiryFieldEmpty>}
        </EnquiryField>

        <EnquiryField label="Specification">
          {vehicle.spec ?? <EnquiryFieldEmpty>Not discussed</EnquiryFieldEmpty>}
        </EnquiryField>

        <EnquiryField label="Colour">
          {[vehicle.exteriorColor, vehicle.interiorColor].filter(Boolean).join(" · ") || (
            <EnquiryFieldEmpty>Not given</EnquiryFieldEmpty>
          )}
        </EnquiryField>

        <EnquiryField label="Asking price">
          {vehicle.askingPrice === null ? (
            <EnquiryFieldEmpty>Not given</EnquiryFieldEmpty>
          ) : (
            formatMoney(vehicle.askingPrice)
          )}
        </EnquiryField>

        <EnquiryField label="Accident history">
          {declared(vehicle.hasAccidentHistory, "Yes, declared", "None declared")}
          {vehicle.accidentNotes && <span className="text-text-muted block">{vehicle.accidentNotes}</span>}
        </EnquiryField>

        <EnquiryField label="Service history">
          {declared(vehicle.hasServiceHistory, "Yes", "No")}
          {vehicle.serviceNotes && <span className="text-text-muted block">{vehicle.serviceNotes}</span>}
        </EnquiryField>
      </div>

      {vehicle.description && <EnquiryField label="Notes">{vehicle.description}</EnquiryField>}

      {/* ---- Photos ---- */}

      {photos.length > 0 && (
        <div>
          <p className="text-label">Photos</p>

          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((photo) =>
              photo.url ? (
                <li key={photo.id}>
                  {/*
                    A signed link, good for an hour. Opening in a new tab is
                    the whole viewer: a lightbox for photos somebody looks at
                    once would be more code than it earns.
                  */}
                  <a
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-visible:ring-primary block rounded-lg focus-visible:ring-2"
                  >
                    <Image
                      src={photo.url}
                      alt={photo.title ?? "Photo of the customer's vehicle"}
                      width={200}
                      height={150}
                      unoptimized
                      className="border-border aspect-[4/3] w-full rounded-lg border object-cover"
                    />
                  </a>
                </li>
              ) : (
                <li
                  key={photo.id}
                  className="border-border text-caption text-text-subtle flex aspect-[4/3] items-center justify-center rounded-lg border px-2 text-center"
                >
                  Couldn&apos;t load
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      {/* ---- What we think it's worth, kept apart from what they told us ---- */}

      <EnquiryValuationForm vehicle={vehicle} canValuate={canValuate} />

      <p className="text-caption text-text-subtle flex items-start gap-2">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Everything above is what the customer told us. The car has not been inspected, listed or priced.
      </p>
    </EnquirySection>
  );
}
