"use client";

import { Info } from "lucide-react";

import { Combobox } from "@/src/components/ui/combobox";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";

import {
  EnquiryPhotoUploader,
  type StagedPhoto,
} from "@/src/components/enquiries/form/enquiry-photo-uploader";

import { REGISTRATION_EMIRATES, VEHICLE_CONDITIONS, VEHICLE_SPECS } from "@/src/lib/types/enquiry-details";

/* =========================================================
   DRAFT
========================================================= */

/** What the form holds about a car the customer owns. */
export interface CustomerVehicleDraft {
  brandId: string | null;
  brandOther: string;
  model: string;
  variant: string;
  year: number | null;
  mileageKm: number | null;
  registrationEmirate: string;
  spec: string;
  exteriorColor: string;
  interiorColor: string;
  condition: string;
  hasAccidentHistory: boolean | null;
  hasServiceHistory: boolean | null;
  accidentNotes: string;
  serviceNotes: string;
  askingPrice: number | null;
  locationId: string | null;
  description: string;
}

export const EMPTY_CUSTOMER_VEHICLE: CustomerVehicleDraft = {
  brandId: null,
  brandOther: "",
  model: "",
  variant: "",
  year: null,
  mileageKm: null,
  registrationEmirate: "",
  spec: "",
  exteriorColor: "",
  interiorColor: "",
  condition: "",
  hasAccidentHistory: null,
  hasServiceHistory: null,
  accidentNotes: "",
  serviceNotes: "",
  askingPrice: null,
  locationId: null,
  description: "",
};

/* =========================================================
   DECLARATION
========================================================= */

/**
 * A yes / no / not-asked question.
 *
 * Three states rather than a checkbox, because "they said no accidents" and
 * "nobody asked" are different facts, and a checkbox left unticked says the
 * first when it means the second. On a car somebody is about to be paid for,
 * that difference matters.
 */
function Declaration({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean | null;
  onChange: (next: boolean | null) => void;
}) {
  const options: { label: string; value: boolean | null }[] = [
    { label: "Yes", value: true },
    { label: "No", value: false },
    { label: "Didn't ask", value: null },
  ];

  return (
    <fieldset>
      <legend className="text-label">{label}</legend>

      {hint && <p className="text-caption text-text-subtle mt-0.5">{hint}</p>}

      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option.value;

          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={
                active
                  ? "border-primary bg-primary/12 text-primary-text text-body-sm min-h-11 rounded-lg border px-3.5 font-medium transition-colors sm:min-h-9"
                  : "border-border bg-card hover:bg-card-hover text-body-sm text-text-muted min-h-11 rounded-lg border px-3.5 transition-colors sm:min-h-9"
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/* =========================================================
   COMPONENT
========================================================= */

interface EnquiryVehicleFieldsProps {
  /**
   * Which side of the deal this car is on.
   *
   * Only changes wording. A trade-in's price is what the customer expects
   * taken off ours, not what they want paid to them, and calling both
   * "asking price" is how the two get confused.
   */
  role?: "selling" | "trade_in";
  value: CustomerVehicleDraft;
  onChange: (next: CustomerVehicleDraft) => void;
  brands: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  /** Draft folder for photos, since the enquiry doesn't exist yet. */
  photoFolder: string;
  photos: StagedPhoto[];
  onPhotosChange: (next: StagedPhoto[]) => void;
}

/**
 * A car the customer owns and wants the showroom to buy.
 *
 * This car may never have been near the forecourt. There is no stock number
 * here, no listing, and nothing on this form publishes anything: it records
 * what the customer says they have, so somebody can look at it and decide.
 *
 * The make can be typed rather than picked for the same reason — a customer
 * selling a Lexus to a showroom that has never stocked one still has a Lexus.
 */
export function EnquiryVehicleFields({
  role = "selling",
  value,
  onChange,
  brands,
  locations,
  photoFolder,
  photos,
  onPhotosChange,
}: EnquiryVehicleFieldsProps) {
  const set = <K extends keyof CustomerVehicleDraft>(key: K, next: CustomerVehicleDraft[K]) => {
    onChange({ ...value, [key]: next });
  };

  const thisYear = new Date().getFullYear();
  const tradeIn = role === "trade_in";

  return (
    <div className="flex flex-col gap-5">
      {/* ---- What it is ---- */}

      <div className="grid gap-4 sm:grid-cols-2">
        <Combobox
          label="Make"
          value={value.brandId}
          onChange={(id) => set("brandId", id)}
          options={brands.map((brand) => ({ id: brand.id, label: brand.name }))}
          placeholder="Search makes"
        />

        <Input
          label="Or type the make"
          placeholder="If it isn't in the list"
          maxLength={60}
          value={value.brandOther}
          onChange={(event) => set("brandOther", event.target.value)}
          hint="One of these two is needed."
        />

        <Input
          label="Model"
          maxLength={60}
          value={value.model}
          onChange={(event) => set("model", event.target.value)}
        />

        <Input
          label="Variant"
          placeholder="e.g. Platinum, S-Line"
          maxLength={60}
          value={value.variant}
          onChange={(event) => set("variant", event.target.value)}
        />

        <Input
          label="Year"
          type="number"
          inputMode="numeric"
          min={1950}
          max={thisYear + 1}
          placeholder={String(thisYear - 3)}
          value={value.year === null ? "" : String(value.year)}
          onChange={(event) => set("year", event.target.value ? Number(event.target.value) : null)}
        />

        <Input
          label="Mileage"
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          placeholder="km"
          value={value.mileageKm === null ? "" : String(value.mileageKm)}
          onChange={(event) => set("mileageKm", event.target.value ? Number(event.target.value) : null)}
        />
      </div>

      {/* ---- Where it is from ---- */}

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Registered in"
          options={[
            { value: "", label: "Not discussed" },
            ...REGISTRATION_EMIRATES.map((item) => ({ value: item, label: item })),
          ]}
          value={value.registrationEmirate}
          onChange={(event) => set("registrationEmirate", event.target.value)}
        />

        <Select
          label="Specification"
          options={[
            { value: "", label: "Not discussed" },
            ...VEHICLE_SPECS.map((item) => ({ value: item, label: item })),
          ]}
          value={value.spec}
          onChange={(event) => set("spec", event.target.value)}
          hint="GCC cars usually value higher here than imports."
        />

        <Input
          label="Exterior colour"
          maxLength={40}
          value={value.exteriorColor}
          onChange={(event) => set("exteriorColor", event.target.value)}
        />

        <Input
          label="Interior colour"
          maxLength={40}
          value={value.interiorColor}
          onChange={(event) => set("interiorColor", event.target.value)}
        />
      </div>

      {/* ---- What they say about it ---- */}

      <div className="flex flex-col gap-4">
        <Select
          label="Condition, as described"
          options={[
            { value: "", label: "Not discussed" },
            ...VEHICLE_CONDITIONS.map((item) => ({ value: item, label: item })),
          ]}
          value={value.condition}
          onChange={(event) => set("condition", event.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Declaration
            label="Any accident history?"
            hint="What they told you. Nobody has inspected it."
            value={value.hasAccidentHistory}
            onChange={(next) => set("hasAccidentHistory", next)}
          />

          <Declaration
            label="Full service history?"
            value={value.hasServiceHistory}
            onChange={(next) => set("hasServiceHistory", next)}
          />
        </div>

        {value.hasAccidentHistory === true && (
          <Textarea
            label="What happened"
            rows={2}
            maxLength={1000}
            value={value.accidentNotes}
            onChange={(event) => set("accidentNotes", event.target.value)}
          />
        )}

        {value.hasServiceHistory === true && (
          <Input
            label="Serviced where"
            maxLength={1000}
            placeholder="Agency, specialist, mixed…"
            value={value.serviceNotes}
            onChange={(event) => set("serviceNotes", event.target.value)}
          />
        )}
      </div>

      {/* ---- The ask ---- */}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={tradeIn ? "Expected trade-in value" : "Asking price"}
          type="number"
          inputMode="decimal"
          min={0}
          step={500}
          placeholder="AED"
          value={value.askingPrice === null ? "" : String(value.askingPrice)}
          onChange={(event) => set("askingPrice", event.target.value ? Number(event.target.value) : null)}
          hint={
            tradeIn
              ? "What they hope it takes off the price. Not a valuation."
              : "What they want for it, not what we would pay."
          }
        />

        <Select
          label="Where the car is"
          options={[
            { value: "", label: "Not said" },
            ...locations.map((place) => ({ value: place.id, label: place.name })),
          ]}
          value={value.locationId ?? ""}
          onChange={(event) => set("locationId", event.target.value || null)}
        />
      </div>

      <Textarea
        label="Anything else about the car"
        rows={3}
        maxLength={2000}
        value={value.description}
        onChange={(event) => set("description", event.target.value)}
      />

      {/* ---- Photos ---- */}

      <div className="flex flex-col gap-2">
        <p className="text-label">Photos</p>

        <EnquiryPhotoUploader folder={photoFolder} photos={photos} onChange={onPhotosChange} />
      </div>

      <p className="text-caption text-text-subtle flex items-start gap-2">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {tradeIn
          ? "Nothing here values the car. Somebody has to see it before any figure is offered."
          : "Saving this does not list the car or price it. Somebody has to see it first."}
      </p>
    </div>
  );
}
