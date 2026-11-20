"use client";

import { ArrowRight, Car, Info, Store } from "lucide-react";

import { Combobox } from "@/src/components/ui/combobox";
import { Input } from "@/src/components/ui/input";

import {
  EnquiryVehicleFields,
  type CustomerVehicleDraft,
} from "@/src/components/enquiries/form/enquiry-vehicle-fields";
import type { StagedPhoto } from "@/src/components/enquiries/form/enquiry-photo-uploader";

import { formatMoney } from "@/src/lib/utils/sales-format";

/* =========================================================
   TYPES
========================================================= */

export interface StockCar {
  id: string;
  display_title: string;
  stock_id: string;
  regular_price: number | null;
  location_name: string | null;
}

interface EnquiryTradeInFieldsProps {
  /** Vehicle A: the car the customer already owns. */
  vehicle: CustomerVehicleDraft;
  onVehicleChange: (next: CustomerVehicleDraft) => void;

  /** Vehicle B: one of ours, from stock. */
  carId: string | null;
  onCarChange: (id: string | null) => void;
  /** What they want, when it isn't anything currently in stock. */
  vehicleText: string;
  onVehicleTextChange: (next: string) => void;

  cars: StockCar[];
  brands: { id: string; name: string }[];
  locations: { id: string; name: string }[];

  photoFolder: string;
  photos: StagedPhoto[];
  onPhotosChange: (next: StagedPhoto[]) => void;
}

/* =========================================================
   PANEL
========================================================= */

/** One side of the trade, titled so the two can never be read as one car. */
function Side({
  title,
  subtitle,
  icon,
  tone,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: "theirs" | "ours";
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={
        tone === "ours"
          ? "border-primary/25 bg-primary/[0.03] flex flex-col gap-4 rounded-xl border p-4"
          : "border-border bg-card-hover/30 flex flex-col gap-4 rounded-xl border p-4"
      }
    >
      <div className="flex items-start gap-2.5">
        <span
          className={
            tone === "ours" ? "text-primary-text mt-0.5 shrink-0" : "text-text-muted mt-0.5 shrink-0"
          }
        >
          {icon}
        </span>

        <div>
          <h3 className="text-body text-text-primary font-medium">{title}</h3>
          <p className="text-caption text-text-subtle mt-0.5">{subtitle}</p>
        </div>
      </div>

      {children}
    </section>
  );
}

/* =========================================================
   COMPONENT
========================================================= */

/**
 * A trade-in: the customer's car, and one of ours.
 *
 * Two panels rather than one long form, because these are two different
 * cars and the single worst thing this screen could do is let somebody read
 * a mileage from one and a price from the other. They are titled, coloured
 * and bordered apart, side by side where there is room and stacked where
 * there isn't.
 *
 * Only our side carries a price that means anything. The customer's figure
 * is what they hope for; what the car is actually worth is decided after
 * somebody has seen it.
 */
export function EnquiryTradeInFields({
  vehicle,
  onVehicleChange,
  carId,
  onCarChange,
  vehicleText,
  onVehicleTextChange,
  cars,
  brands,
  locations,
  photoFolder,
  photos,
  onPhotosChange,
}: EnquiryTradeInFieldsProps) {
  const chosen = cars.find((car) => car.id === carId) ?? null;

  /*
   * What is left to pay, if both figures exist. Subtraction on two numbers
   * somebody just entered — not a quote, and nothing is stored from it.
   */
  const listed = chosen?.regular_price ?? null;
  const expected = vehicle.askingPrice;
  const balance = listed !== null && expected !== null ? listed - expected : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ===================================================
            VEHICLE A — THEIRS
        =================================================== */}

        <Side
          title="Their car"
          subtitle="The one coming off the price. Not ours, and not in stock."
          icon={<Car className="size-4" aria-hidden="true" />}
          tone="theirs"
        >
          <EnquiryVehicleFields
            role="trade_in"
            value={vehicle}
            onChange={onVehicleChange}
            brands={brands}
            locations={locations}
            photoFolder={photoFolder}
            photos={photos}
            onPhotosChange={onPhotosChange}
          />
        </Side>

        {/* ===================================================
            VEHICLE B — OURS
        =================================================== */}

        <Side
          title="The car they want"
          subtitle="One of ours, from stock."
          icon={<Store className="size-4" aria-hidden="true" />}
          tone="ours"
        >
          <Combobox
            label="From stock"
            value={carId}
            onChange={onCarChange}
            options={cars.map((car) => ({
              id: car.id,
              label: `${car.display_title} · ${car.stock_id}`,
            }))}
            placeholder="Search by name or stock number"
          />

          {/*
            Read from the chosen car rather than typed. A listed price
            somebody can edit here is a listed price that stops matching
            the listing.
          */}
          {chosen && (
            <dl className="divide-border divide-y">
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-body-sm text-text-muted">Listed at</dt>
                <dd className="text-body-sm text-text-primary font-medium">
                  {chosen.regular_price === null ? "No price set" : formatMoney(chosen.regular_price)}
                </dd>
              </div>

              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-body-sm text-text-muted">Showroom</dt>
                <dd className="text-body-sm text-text-primary">{chosen.location_name ?? "Not set"}</dd>
              </div>

              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-body-sm text-text-muted">Stock number</dt>
                <dd className="text-body-sm text-text-primary tabular-nums">{chosen.stock_id}</dd>
              </div>
            </dl>
          )}

          <Input
            label="Or what they described"
            placeholder="e.g. a white Q7, 2023 or newer"
            maxLength={200}
            value={vehicleText}
            onChange={(event) => onVehicleTextChange(event.target.value)}
            hint="For when they want something we don't have yet."
          />
        </Side>
      </div>

      {/* ===================================================
          THE SUM
      =================================================== */}

      {balance !== null && (
        <p className="text-body-sm text-text-muted surface-card flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3">
          <span className="text-text-primary font-medium">{formatMoney(listed ?? 0)}</span>
          <span>less</span>
          <span className="text-text-primary font-medium">{formatMoney(expected ?? 0)}</span>
          <ArrowRight className="text-text-subtle size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="text-text-primary font-medium">{formatMoney(Math.max(0, balance))}</span> to pay
          </span>

          {balance < 0 && <span className="text-amber-400">— they expect more than the car costs.</span>}
        </p>
      )}

      <p className="text-caption text-text-subtle flex items-start gap-2">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        The figure on the left is what the customer hopes for. Nothing here values their car or reserves ours.
      </p>
    </div>
  );
}
