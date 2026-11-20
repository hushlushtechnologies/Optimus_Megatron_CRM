"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import { Combobox } from "@/src/components/ui/combobox";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";

import { EnquiryFormSection, EnquiryReviewLine } from "@/src/components/enquiries/form/enquiry-form-section";
import { EnquiryCustomerPicker } from "@/src/components/enquiries/form/enquiry-customer-picker";
import {
  EMPTY_DREAM_CAR,
  EnquiryDreamCarFields,
  type DreamCarDraft,
} from "@/src/components/enquiries/form/enquiry-dream-car-fields";
import { EnquiryFinanceFields } from "@/src/components/enquiries/form/enquiry-finance-fields";
import { EnquiryGeneralFields } from "@/src/components/enquiries/form/enquiry-general-fields";
import type { StagedPhoto } from "@/src/components/enquiries/form/enquiry-photo-uploader";
import { EnquiryTradeInFields } from "@/src/components/enquiries/form/enquiry-trade-in-fields";
import {
  EMPTY_CUSTOMER_VEHICLE,
  EnquiryVehicleFields,
  type CustomerVehicleDraft,
} from "@/src/components/enquiries/form/enquiry-vehicle-fields";

import { createManualEnquiryAction } from "@/app/admin/enquiries/actions";
import { useMotion } from "@/src/hooks/use-motion";
import { useUnsavedChangesWarning } from "@/src/hooks/use-unsaved-changes-warning";
import {
  emptyEnquiryDraft,
  enquirySectionReady,
  generalReady,
  usesStockPicker,
  type EnquiryDraft,
} from "@/src/lib/types/enquiry-form";
import { ENQUIRY_PRIORITIES, PREFERRED_CONTACTS, type PreferredContact } from "@/src/lib/types/enquiry";
import {
  describeBudget,
  EMPTY_FINANCE_DETAILS,
  financeAmount,
  type EnquiryFinanceDetails,
} from "@/src/lib/types/enquiry-details";
import { formatMoney } from "@/src/lib/utils/sales-format";

/* =========================================================
   TYPES
========================================================= */

interface Option {
  key: string;
  label: string;
}

interface NewEnquiryFormProps {
  types: Option[];
  sources: Option[];
  staff: { id: string; full_name: string }[];
  locations: { id: string; name: string }[];
  cars: {
    id: string;
    display_title: string;
    stock_id: string;
    regular_price: number | null;
    location_name: string | null;
  }[];
  brands: { id: string; name: string }[];
  fuelTypes: string[];
  transmissions: string[];
  currentUserId: string;
}

/* =========================================================
   COMPONENT
========================================================= */

/**
 * Taking an enquiry by hand: over the phone, at the counter, or forwarded
 * from somebody's inbox.
 *
 * Sections appear as the ones before them are answered, so the first thing
 * on screen is one question rather than twenty fields. Everything already
 * answered stays visible above — somebody deciding what to type next usually
 * wants to see what they just typed, which a wizard hides behind a button.
 *
 * Only two things are genuinely required: a name, and one way to reply. The
 * rest can be filled in from the enquiry itself later, and asking for more
 * at the counter just means it gets written on paper instead.
 */
export function NewEnquiryForm({
  types,
  sources,
  staff,
  locations,
  cars,
  brands,
  fuelTypes,
  transmissions,
  currentUserId,
}: NewEnquiryFormProps) {
  const router = useRouter();
  const { fadeUp } = useMotion();

  const [draft, setDraft] = useState<EnquiryDraft>(() => emptyEnquiryDraft(currentUserId));
  const [finance, setFinance] = useState<EnquiryFinanceDetails>(EMPTY_FINANCE_DETAILS);
  const [vehicle, setVehicle] = useState<CustomerVehicleDraft>(EMPTY_CUSTOMER_VEHICLE);
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [dreamCar, setDreamCar] = useState<DreamCarDraft>(EMPTY_DREAM_CAR);

  /*
   * Where photos go in the bucket. Generated once when the form opens,
   * because they are attached before the enquiry they belong to exists.
   */
  const [photoFolder] = useState(() => `drafts/${crypto.randomUUID()}`);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* Closing the tab mid-enquiry loses a phone call's worth of typing. */
  useUnsavedChangesWarning(touched && !saving);

  const set = <K extends keyof EnquiryDraft>(key: K, value: EnquiryDraft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  /* =======================================================
     WHAT IS REVEALED

     Each section waits for the one before it. Nothing is hidden once it has
     appeared, so a change higher up never pulls the page out from under
     somebody mid-sentence.
  ======================================================= */

  /*
   * Which kind of enquiry this is. Matched on the type key, which is a
   * database value — a dealership that renames a type in settings renames
   * its key too, so these follow it.
   */
  const isFinance = draft.enquiryType === "Finance";
  const isSelling = draft.enquiryType === "Sell My Car";
  const isTradeIn = draft.enquiryType === "Trade-In";
  const isDreamCar = draft.enquiryType === "Dream Car";
  const isGeneral = draft.enquiryType === "General";

  /*
   * A trade-in asks the vehicle question as a comparison of two cars, so the
   * shared "which vehicle?" step steps aside and lets it own both.
   */
  const ownsVehicle = isSelling || isTradeIn;

  const typeDone = enquirySectionReady.type(draft);
  const customerDone = enquirySectionReady.customer(draft);

  const showCustomer = typeDone;
  const showVehicle = customerDone && usesStockPicker(draft.enquiryType);
  const showDetails = customerDone;
  const showHandling = customerDone;
  const showReview = customerDone;

  const contactName = draft.customerMode === "existing" ? draft.customerLabel : draft.fullName.trim() || "";

  /* =======================================================
     SUBMIT
  ======================================================= */

  const submit = async () => {
    setError(null);
    setSaving(true);

    try {
      const result = await createManualEnquiryAction({
        fullName: draft.customerMode === "existing" ? draft.customerLabel : draft.fullName,
        email: draft.email,
        phone: draft.phone,
        message: draft.message,
        enquiryType: draft.enquiryType,
        source: draft.source,
        preferredContact: draft.preferredContact === "" ? undefined : draft.preferredContact,
        carId: draft.carId,
        vehicleText: draft.vehicleText,
        priority: draft.priority,
        subject: draft.subject,
        assignedTo: draft.assignedTo,
        customerId: draft.customerId,
        locationId: draft.locationId,
        /* Only a General enquiry may carry one; the table refuses it elsewhere. */
        generalCategory: isGeneral ? draft.generalCategory : null,
        /*
         * Each type's own block, sent only for that type, so no other kind
         * writes an empty row that then looks like a request it never was.
         */
        finance: isFinance ? finance : undefined,
        sellingVehicle: isSelling ? { ...vehicle, photoPaths: photos.map((photo) => photo.path) } : undefined,
        tradeInVehicle: isTradeIn ? { ...vehicle, photoPaths: photos.map((photo) => photo.path) } : undefined,
        dreamCar: isDreamCar ? dreamCar : undefined,
      });

      if (result.error || !result.id) {
        setError(result.error ?? "Unable to save this enquiry. Please try again.");
        return;
      }

      /* Cleared before navigating, or the guard fires on the way out. */
      setTouched(false);
      toast.success("Enquiry saved.");
      router.push(`/admin/enquiries/${result.id}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const carOptions = cars.map((car) => ({
    id: car.id,
    label: `${car.display_title} · ${car.stock_id}`,
  }));

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <motion.div {...fadeUp(0)}>
        <Link
          href="/admin/enquiries"
          className="text-body-sm text-text-muted hover:text-text-primary inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to enquiry requests
        </Link>

        <h1 className="text-h3 mt-2">New enquiry</h1>

        <p className="text-body-sm text-text-muted mt-1">
          For anything that came in by phone, in person, or forwarded from an inbox. Website enquiries arrive
          here on their own.
        </p>
      </motion.div>

      {/* ===================================================
          1. WHAT KIND
      =================================================== */}

      <EnquiryFormSection
        step={1}
        title="What are they asking about?"
        description="This decides what else the form asks for."
        done={typeDone}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Kind of enquiry"
            required
            options={[
              { value: "", label: "Choose one" },
              ...types.map((item) => ({ value: item.key, label: item.label })),
            ]}
            value={draft.enquiryType}
            onChange={(event) => set("enquiryType", event.target.value)}
          />

          <Select
            label="How it reached us"
            required
            options={sources.map((item) => ({ value: item.key, label: item.label }))}
            value={draft.source}
            onChange={(event) => set("source", event.target.value)}
          />
        </div>
      </EnquiryFormSection>

      {/* ===================================================
          2. WHO
      =================================================== */}

      {showCustomer && (
        <EnquiryFormSection
          step={2}
          title="Who is asking?"
          description="Link a customer already on file, or just take their details."
          done={customerDone}
        >
          <div className="flex flex-col gap-4">
            {/*
              Two ways in, stated as a choice rather than guessed from
              whether a search returned anything: somebody taking a call
              knows which one they are doing.
            */}
            <div role="group" aria-label="Customer" className="flex flex-wrap gap-2">
              {(["existing", "new"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={draft.customerMode === mode ? "secondary" : "outline"}
                  aria-pressed={draft.customerMode === mode}
                  onClick={() => {
                    set("customerMode", mode);
                    set("customerId", null);
                    set("customerLabel", "");
                  }}
                >
                  {mode === "existing" ? "Already a customer" : "New to us"}
                </Button>
              ))}
            </div>

            {draft.customerMode === "existing" ? (
              <EnquiryCustomerPicker
                value={draft.customerId}
                label={draft.customerLabel}
                onPick={(customer) => {
                  setTouched(true);
                  setDraft((current) => ({
                    ...current,
                    customerId: customer.id,
                    customerLabel: customer.full_name,
                    /* Prefilled so the enquiry carries contact details of its own. */
                    phone: customer.phone ?? current.phone,
                    email: customer.email ?? current.email,
                  }));
                }}
                onClear={() => {
                  setTouched(true);
                  setDraft((current) => ({ ...current, customerId: null, customerLabel: "" }));
                }}
              />
            ) : (
              <Input
                label="Their name"
                required
                value={draft.fullName}
                onChange={(event) => set("fullName", event.target.value)}
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Phone"
                type="tel"
                inputMode="tel"
                value={draft.phone}
                onChange={(event) => set("phone", event.target.value)}
                hint="A phone number or an email. One of the two."
              />

              <Input
                label="Email"
                type="email"
                value={draft.email}
                onChange={(event) => set("email", event.target.value)}
              />
            </div>

            <Select
              label="How they would rather be contacted"
              options={[
                { value: "", label: "No preference" },
                ...PREFERRED_CONTACTS.map((item) => ({ value: item, label: item })),
              ]}
              value={draft.preferredContact}
              onChange={(event) => set("preferredContact", event.target.value as PreferredContact | "")}
            />
          </div>
        </EnquiryFormSection>
      )}

      {/* ===================================================
          3. WHICH VEHICLE
      =================================================== */}

      {showVehicle && (
        <EnquiryFormSection
          step={3}
          title="Which vehicle?"
          description="Pick one from stock, or write down what they described."
          optional
          done={draft.carId !== null || draft.vehicleText.trim() !== ""}
        >
          <div className="flex flex-col gap-4">
            <Combobox
              label="From stock"
              value={draft.carId}
              onChange={(id) => set("carId", id)}
              options={carOptions}
              placeholder="Search by name or stock number"
            />

            {/*
              Free text as well as the list, because a customer asking about
              a car the showroom doesn't have is still an enquiry worth
              recording — often the most interesting kind.
            */}
            <Input
              label="Or in their words"
              placeholder="e.g. black Range Rover Sport, 2022 or newer"
              value={draft.vehicleText}
              onChange={(event) => set("vehicleText", event.target.value)}
            />
          </div>
        </EnquiryFormSection>
      )}

      {/* ===================================================
          4. TYPE-SPECIFIC DETAILS

          The slot the per-type sections fill. Until then it says what it is
          waiting for rather than pretending the step doesn't exist.
      =================================================== */}

      {showDetails && (
        <EnquiryFormSection
          step={4}
          title="Details"
          description={
            isGeneral
              ? "A category, the question, and what they said."
              : isDreamCar
                ? "What they want, and what they'd accept."
                : isTradeIn
                  ? "Their car, and the one they want from us."
                  : `What else matters for a ${draft.enquiryType.toLowerCase()} enquiry.`
          }
          optional
          done={
            draft.subject.trim() !== "" ||
            draft.message.trim() !== "" ||
            (isFinance && finance.vehiclePrice !== null) ||
            (ownsVehicle && (vehicle.brandId !== null || vehicle.brandOther.trim() !== "")) ||
            (isDreamCar &&
              (dreamCar.brandId !== null ||
                dreamCar.brandOther.trim() !== "" ||
                dreamCar.budgetMax !== null)) ||
            (isGeneral && generalReady(draft))
          }
        >
          <div className="flex flex-col gap-4">
            {isDreamCar && (
              <EnquiryDreamCarFields
                value={dreamCar}
                onChange={(next) => {
                  setTouched(true);
                  setDreamCar(next);
                }}
                brands={brands}
                fuelTypes={fuelTypes}
                transmissions={transmissions}
              />
            )}

            {isTradeIn && (
              <EnquiryTradeInFields
                vehicle={vehicle}
                onVehicleChange={(next) => {
                  setTouched(true);
                  setVehicle(next);
                }}
                carId={draft.carId}
                onCarChange={(id) => set("carId", id)}
                vehicleText={draft.vehicleText}
                onVehicleTextChange={(next) => set("vehicleText", next)}
                cars={cars}
                brands={brands}
                locations={locations}
                photoFolder={photoFolder}
                photos={photos}
                onPhotosChange={(next) => {
                  setTouched(true);
                  setPhotos(next);
                }}
              />
            )}

            {isSelling && (
              <EnquiryVehicleFields
                value={vehicle}
                onChange={(next) => {
                  setTouched(true);
                  setVehicle(next);
                }}
                brands={brands}
                locations={locations}
                photoFolder={photoFolder}
                photos={photos}
                onPhotosChange={(next) => {
                  setTouched(true);
                  setPhotos(next);
                }}
              />
            )}

            {isFinance && (
              <EnquiryFinanceFields
                value={finance}
                onChange={(next) => {
                  setTouched(true);
                  setFinance(next);
                }}
              />
            )}

            {isGeneral ? (
              <EnquiryGeneralFields
                category={draft.generalCategory}
                onCategoryChange={(next) => set("generalCategory", next)}
                subject={draft.subject}
                onSubjectChange={(next) => set("subject", next)}
                message={draft.message}
                onMessageChange={(next) => set("message", next)}
              />
            ) : (
              <>
                <Input
                  label="One-line summary"
                  placeholder="What this is about, in a few words"
                  maxLength={160}
                  value={draft.subject}
                  onChange={(event) => set("subject", event.target.value)}
                  hint="Shown in the list, so colleagues can tell enquiries apart at a glance."
                />

                <Textarea
                  label="What they said"
                  rows={4}
                  maxLength={4000}
                  value={draft.message}
                  onChange={(event) => set("message", event.target.value)}
                />
              </>
            )}
          </div>
        </EnquiryFormSection>
      )}

      {/* ===================================================
          5 TO 7. HANDLING
      =================================================== */}

      {showHandling && (
        <EnquiryFormSection
          step={5}
          title="Who deals with it"
          description="An enquiry with an owner skips the unassigned queue."
          done={draft.assignedTo !== null}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Assigned to"
              options={[
                { value: "", label: "Nobody yet" },
                ...staff.map((person) => ({ value: person.id, label: person.full_name })),
              ]}
              value={draft.assignedTo ?? ""}
              onChange={(event) => set("assignedTo", event.target.value || null)}
            />

            <Select
              label="Priority"
              options={ENQUIRY_PRIORITIES.map((item) => ({ value: item, label: item }))}
              value={draft.priority}
              onChange={(event) => set("priority", event.target.value as EnquiryDraft["priority"])}
            />

            <Select
              label="Showroom"
              options={[
                { value: "", label: "Not tied to one" },
                ...locations.map((place) => ({ value: place.id, label: place.name })),
              ]}
              value={draft.locationId ?? ""}
              onChange={(event) => set("locationId", event.target.value || null)}
            />
          </div>
        </EnquiryFormSection>
      )}

      {/* ===================================================
          8. REVIEW AND SUBMIT
      =================================================== */}

      {showReview && (
        <EnquiryFormSection step={6} title="Check it over" description="Then save it.">
          <div className="flex flex-col gap-4">
            <div className="divide-border divide-y">
              <EnquiryReviewLine label="Kind" value={draft.enquiryType} />
              <EnquiryReviewLine label="Came in by" value={draft.source} />
              <EnquiryReviewLine label="Customer" value={contactName} />
              <EnquiryReviewLine
                label="Reply to"
                value={[draft.phone, draft.email].filter((part) => part.trim()).join(" · ")}
              />
              {isGeneral && <EnquiryReviewLine label="About" value={draft.generalCategory} />}
              {usesStockPicker(draft.enquiryType) && (
                <EnquiryReviewLine
                  label="Vehicle"
                  value={
                    draft.carId
                      ? (carOptions.find((car) => car.id === draft.carId)?.label ?? null)
                      : draft.vehicleText
                  }
                />
              )}
              <EnquiryReviewLine
                label="Assigned to"
                value={staff.find((person) => person.id === draft.assignedTo)?.full_name ?? null}
              />
              {isFinance && (
                <EnquiryReviewLine
                  label="To finance"
                  value={financeAmount(finance) === null ? null : formatMoney(financeAmount(finance) ?? 0)}
                />
              )}
              {ownsVehicle && (
                <EnquiryReviewLine
                  label="Their car"
                  value={
                    [
                      vehicle.year ? String(vehicle.year) : null,
                      brands.find((brand) => brand.id === vehicle.brandId)?.name ?? vehicle.brandOther,
                      vehicle.model,
                    ]
                      .filter((part) => part && String(part).trim())
                      .join(" ") || null
                  }
                />
              )}
              {ownsVehicle && photos.length > 0 && (
                <EnquiryReviewLine label="Photos" value={`${photos.length} attached`} />
              )}
              {isTradeIn && (
                <EnquiryReviewLine
                  label="Against our"
                  value={cars.find((car) => car.id === draft.carId)?.display_title ?? draft.vehicleText}
                />
              )}
              {isDreamCar && (
                <EnquiryReviewLine
                  label="Looking for"
                  value={
                    [
                      brands.find((brand) => brand.id === dreamCar.brandId)?.name ?? dreamCar.brandOther,
                      dreamCar.model,
                    ]
                      .filter((part) => part && part.trim())
                      .join(" ") || null
                  }
                />
              )}
              {isDreamCar && (
                <EnquiryReviewLine
                  label="Budget"
                  value={describeBudget(dreamCar.budgetMin, dreamCar.budgetMax)}
                />
              )}
              <EnquiryReviewLine label="Priority" value={draft.priority} />
            </div>

            {error && (
              <p
                role="alert"
                className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void submit()} isLoading={saving} disabled={saving || !customerDone}>
                Save enquiry
              </Button>

              <Button variant="outline" onClick={() => router.push("/admin/enquiries")} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </EnquiryFormSection>
      )}
    </div>
  );
}
