"use client";

import { Info } from "lucide-react";

import { Combobox } from "@/src/components/ui/combobox";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";

import { describeBudget, PURCHASE_TIMELINES, VEHICLE_SPECS } from "@/src/lib/types/enquiry-details";

/* =========================================================
   DRAFT
========================================================= */

/** The brief, as the form holds it. */
export interface DreamCarDraft {
  brandId: string | null;
  brandOther: string;
  model: string;
  variant: string;
  yearFrom: number | null;
  yearTo: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  exteriorColor: string;
  interiorColor: string;
  maxMileageKm: number | null;
  fuelType: string;
  transmission: string;
  spec: string;
  features: string;
  timeline: string;
  notes: string;
}

export const EMPTY_DREAM_CAR: DreamCarDraft = {
  brandId: null,
  brandOther: "",
  model: "",
  variant: "",
  yearFrom: null,
  yearTo: null,
  budgetMin: null,
  budgetMax: null,
  exteriorColor: "",
  interiorColor: "",
  maxMileageKm: null,
  fuelType: "",
  transmission: "",
  spec: "",
  features: "",
  timeline: "",
  notes: "",
};

/* =========================================================
   COMPONENT
========================================================= */

interface EnquiryDreamCarFieldsProps {
  value: DreamCarDraft;
  onChange: (next: DreamCarDraft) => void;
  brands: { id: string; name: string }[];
  fuelTypes: string[];
  transmissions: string[];
}

/**
 * What a customer wants that the showroom hasn't got.
 *
 * Nothing on this form is required and nothing needs to exist in stock.
 * That is the point of the phase: a dream car request is a brief, and
 * somebody who says only "a white G-Class, 2021 or newer, under 400" has
 * given a useful one. A form that demanded a variant and a mileage limit
 * would mean the brief got written on a sticky note instead.
 *
 * The fuel and gearbox lists come from the same lookups inventory uses, so
 * that when a person compares this brief against stock they are comparing
 * the same words. Nothing here does that comparison automatically.
 */
export function EnquiryDreamCarFields({
  value,
  onChange,
  brands,
  fuelTypes,
  transmissions,
}: EnquiryDreamCarFieldsProps) {
  const set = <K extends keyof DreamCarDraft>(key: K, next: DreamCarDraft[K]) => {
    onChange({ ...value, [key]: next });
  };

  const thisYear = new Date().getFullYear();

  /* Caught here so a backwards range reads as a note, not a failed save. */
  const yearsBackwards = value.yearFrom !== null && value.yearTo !== null && value.yearFrom > value.yearTo;

  const budgetBackwards =
    value.budgetMin !== null && value.budgetMax !== null && value.budgetMin > value.budgetMax;

  const budget = describeBudget(value.budgetMin, value.budgetMax);

  return (
    <div className="flex flex-col gap-5">
      {/* ---- What they're after ---- */}

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
          hint="They can want something we've never stocked."
        />

        <Input
          label="Model"
          maxLength={60}
          value={value.model}
          onChange={(event) => set("model", event.target.value)}
        />

        <Input
          label="Variant"
          placeholder="e.g. AMG Line, Trail Edition"
          maxLength={60}
          value={value.variant}
          onChange={(event) => set("variant", event.target.value)}
        />
      </div>

      {/* ---- Year range ---- */}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Year, from"
          type="number"
          inputMode="numeric"
          min={1950}
          max={thisYear + 1}
          placeholder={String(thisYear - 2)}
          value={value.yearFrom === null ? "" : String(value.yearFrom)}
          onChange={(event) => set("yearFrom", event.target.value ? Number(event.target.value) : null)}
          hint="Leave either side blank for an open-ended range."
        />

        <Input
          label="Year, to"
          type="number"
          inputMode="numeric"
          min={1950}
          max={thisYear + 1}
          value={value.yearTo === null ? "" : String(value.yearTo)}
          onChange={(event) => set("yearTo", event.target.value ? Number(event.target.value) : null)}
          error={yearsBackwards ? "The later year can't be before the earlier one." : undefined}
        />
      </div>

      {/* ---- Budget ---- */}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Budget, from"
          type="number"
          inputMode="decimal"
          min={0}
          step={5000}
          placeholder="AED"
          value={value.budgetMin === null ? "" : String(value.budgetMin)}
          onChange={(event) => set("budgetMin", event.target.value ? Number(event.target.value) : null)}
        />

        <Input
          label="Budget, up to"
          type="number"
          inputMode="decimal"
          min={0}
          step={5000}
          placeholder="AED"
          value={value.budgetMax === null ? "" : String(value.budgetMax)}
          onChange={(event) => set("budgetMax", event.target.value ? Number(event.target.value) : null)}
          error={budgetBackwards ? "The top of the budget can't be below the bottom." : undefined}
        />
      </div>

      {/* Read back, because most people only fill in one side of it. */}
      {budget && !budgetBackwards && (
        <p className="text-body-sm text-text-muted bg-card-hover rounded-md px-3 py-2.5">
          Budget recorded as <span className="text-text-primary font-medium">{budget}</span>.
        </p>
      )}

      {/* ---- Preferences ---- */}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Exterior colour"
          placeholder="Or colours they'd accept"
          maxLength={40}
          value={value.exteriorColor}
          onChange={(event) => set("exteriorColor", event.target.value)}
        />

        <Input
          label="Interior"
          placeholder="e.g. black leather"
          maxLength={40}
          value={value.interiorColor}
          onChange={(event) => set("interiorColor", event.target.value)}
        />

        <Input
          label="Mileage limit"
          type="number"
          inputMode="numeric"
          min={0}
          step={5000}
          placeholder="km"
          value={value.maxMileageKm === null ? "" : String(value.maxMileageKm)}
          onChange={(event) => set("maxMileageKm", event.target.value ? Number(event.target.value) : null)}
          hint="The most they'd accept."
        />

        <Select
          label="Specification"
          options={[
            { value: "", label: "No preference" },
            ...VEHICLE_SPECS.map((item) => ({ value: item, label: item })),
          ]}
          value={value.spec}
          onChange={(event) => set("spec", event.target.value)}
        />

        <Select
          label="Fuel"
          options={[
            { value: "", label: "No preference" },
            ...fuelTypes.map((item) => ({ value: item, label: item })),
          ]}
          value={value.fuelType}
          onChange={(event) => set("fuelType", event.target.value)}
        />

        <Select
          label="Gearbox"
          options={[
            { value: "", label: "No preference" },
            ...transmissions.map((item) => ({ value: item, label: item })),
          ]}
          value={value.transmission}
          onChange={(event) => set("transmission", event.target.value)}
        />
      </div>

      {/* ---- Features and timing ---- */}

      <Textarea
        label="Must-haves"
        rows={3}
        maxLength={2000}
        placeholder="Sunroof, 360 camera, seven seats, full agency service history…"
        value={value.features}
        onChange={(event) => set("features", event.target.value)}
        hint="Free text on purpose. Somebody reading this will know what matters."
      />

      <Select
        label="When they're looking to buy"
        options={[
          { value: "", label: "Not discussed" },
          ...PURCHASE_TIMELINES.map((item) => ({ value: item, label: item })),
        ]}
        value={value.timeline}
        onChange={(event) => set("timeline", event.target.value)}
        hint="Decides who gets called first when something lands."
      />

      <Textarea
        label="Anything else"
        rows={2}
        maxLength={2000}
        value={value.notes}
        onChange={(event) => set("notes", event.target.value)}
      />

      <p className="text-caption text-text-subtle flex items-start gap-2">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Nothing here is matched against stock automatically. A colleague links a car when they see one that
        fits.
      </p>
    </div>
  );
}
