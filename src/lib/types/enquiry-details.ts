/*
|--------------------------------------------------------------------------
| TYPE-SPECIFIC ENQUIRY DETAILS
|--------------------------------------------------------------------------
|
| One shape per kind of enquiry, matching the table Phase 1 created for it.
| They live apart from EnquiryListRow because none of them belongs on a list:
| a finance figure is something you open an enquiry to read, not something
| you scan forty rows of.
*/

export const EMPLOYMENT_TYPES = ["Salaried", "Self-Employed", "Business Owner", "Other"] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/**
 * A request for help arranging finance.
 *
 * Every figure is what the customer said they had in mind, not anything
 * verified, and not an application. Income, documents and identification are
 * deliberately absent: a dealership CRM has no secure workflow for them, and
 * a field that exists will be filled in eventually.
 */
export interface EnquiryFinanceDetails {
  /** The price the conversation was built on, which may not be today's list price. */
  vehiclePrice: number | null;
  downPayment: number | null;
  termMonths: number | null;
  monthlyBudget: number | null;
  employmentType: EmploymentType | null;
  bankPreference: string | null;
  notes: string | null;
}

export const EMPTY_FINANCE_DETAILS: EnquiryFinanceDetails = {
  vehiclePrice: null,
  downPayment: null,
  termMonths: null,
  monthlyBudget: null,
  employmentType: null,
  bankPreference: null,
  notes: null,
};

/**
 * The terms a UAE dealership actually quotes.
 *
 * Offered as a list rather than a free number because these are the ones
 * banks here price, and a customer saying "about four years" means 48.
 */
export const FINANCE_TERMS = [12, 24, 36, 48, 60, 72, 84] as const;

/**
 * What is left to finance, if both figures are known.
 *
 * null rather than a guess when either is missing: a down payment with no
 * price tells you nothing about the loan, and showing zero would read as an
 * answer rather than an absence.
 */
export function financeAmount(details: EnquiryFinanceDetails): number | null {
  if (details.vehiclePrice === null || details.downPayment === null) return null;

  return Math.max(0, details.vehiclePrice - details.downPayment);
}

/**
 * Whether the customer's monthly budget could plausibly cover the balance.
 *
 * Deliberately crude: balance divided by months, no interest, no fees. It is
 * a sanity check for whoever picks the enquiry up — "this is roughly in
 * range" or "this is nowhere near" — and is never shown to a customer or
 * called an estimate. Real figures come from the bank.
 */
export function financeIsPlausible(details: EnquiryFinanceDetails): boolean | null {
  const balance = financeAmount(details);

  if (balance === null || details.termMonths === null || details.monthlyBudget === null) return null;
  if (details.termMonths <= 0) return null;

  /* The 1.15 leaves room for the profit rate this sum deliberately ignores. */
  return details.monthlyBudget * details.termMonths * 1.15 >= balance;
}

/* =========================================================
   A CUSTOMER'S OWN VEHICLE
========================================================= */

export const REGISTRATION_EMIRATES = [
  "Dubai",
  "Abu Dhabi",
  "Sharjah",
  "Ajman",
  "Fujairah",
  "Ras Al Khaimah",
  "Umm Al Quwain",
] as const;

export const VEHICLE_SPECS = ["GCC", "Import", "Japanese", "American", "European", "Other"] as const;

export const VEHICLE_CONDITIONS = ["Excellent", "Very Good", "Good", "Fair", "Needs Work"] as const;

export type RegistrationEmirate = (typeof REGISTRATION_EMIRATES)[number];
export type VehicleSpec = (typeof VEHICLE_SPECS)[number];
export type VehicleCondition = (typeof VEHICLE_CONDITIONS)[number];

/** Which side of the deal this car is on. */
export type CustomerVehicleRole = "selling" | "trade_in";

/**
 * A car the customer owns.
 *
 * Not an inventory vehicle, and deliberately not shaped like one. This car
 * may never have been near the showroom: there is no stock number, no
 * listing and no published price, and nothing here should create one. Every
 * field is what the customer said about their own car.
 *
 * The valuation fields are the exception — those are filled in by staff
 * after somebody has actually looked at it, which is why they are kept
 * apart from the declarations above them.
 */
export interface EnquiryCustomerVehicle {
  id: string;
  role: CustomerVehicleRole;

  brandId: string | null;
  /** Used when the make isn't one the showroom stocks, so isn't in the lookup. */
  brandOther: string | null;
  /** Resolved from brandId where there is one, for display. */
  brandName: string | null;
  model: string | null;
  variant: string | null;

  year: number | null;
  mileageKm: number | null;
  registrationEmirate: RegistrationEmirate | null;
  spec: VehicleSpec | null;

  exteriorColor: string | null;
  interiorColor: string | null;
  condition: VehicleCondition | null;

  /* Declarations the customer made. Nobody has inspected the car. */
  hasAccidentHistory: boolean | null;
  accidentNotes: string | null;
  hasServiceHistory: boolean | null;
  serviceNotes: string | null;

  askingPrice: number | null;
  locationId: string | null;
  description: string | null;

  /*
   * Filled in by staff, after a look at the car.
   *
   * What it is worth and what we would pay are two numbers because they are
   * two different facts — one field for both would mean either the valuation
   * is quietly understated or the offer is quietly inflated.
   */
  estimatedValue: number | null;
  valuationNotes: string | null;
  proposedOffer: number | null;
  /** When the offer stops standing. Null means it was never given a limit. */
  offerExpiresAt: string | null;
  evaluatedAt: string | null;
  /** Null when nobody has valued it, or the evaluator's name can't be read. */
  evaluatedByName: string | null;
}

/**
 * Whether an offer has passed its expiry.
 *
 * Expiries are stored at the end of the Dubai day, so the hour or so where a
 * server render and a client render could disagree sits in the middle of the
 * night. Takes `now` so a test doesn't have to wait.
 */
export function isOfferExpired(offerExpiresAt: string | null, now = Date.now()): boolean {
  return offerExpiresAt !== null && Date.parse(offerExpiresAt) < now;
}

/** What the car is, in one line. */
export function describeCustomerVehicle(vehicle: EnquiryCustomerVehicle): string {
  const brand = vehicle.brandName ?? vehicle.brandOther;

  const parts = [vehicle.year ? String(vehicle.year) : null, brand, vehicle.model, vehicle.variant];

  const line = parts.filter(Boolean).join(" ");

  return line || "Vehicle details not given";
}

/* =========================================================
   PHOTOS
========================================================= */

/**
 * A photo attached to an enquiry.
 *
 * The URL is signed and short-lived, not permanent: these are pictures of a
 * member of the public's own car, often with a number plate in frame, so the
 * bucket is private and a link that leaks stops working.
 */
export interface EnquiryPhoto {
  id: string;
  /** Which of the customer's cars this is a photo of, when it is of one. */
  vehicleId: string | null;
  storagePath: string;
  /** null when the signed URL couldn't be minted. */
  url: string | null;
  title: string | null;
}

/* =========================================================
   OUR SIDE OF A TRADE
========================================================= */

/**
 * A car from stock, as the other half of a trade-in.
 *
 * Kept apart from EnquiryCustomerVehicle on purpose: this one has a stock
 * number and a listed price because it is ours and it is for sale. Sharing
 * a shape with the customer's car is exactly how the two get confused.
 */
export interface EnquiryStockCar {
  id: string;
  title: string;
  stockId: string;
  listedPrice: number | null;
  locationName: string | null;
}

/**
 * A car in stock, as it appears in the dream-car match picker.
 *
 * Carries its availability rather than being filtered by it. Hiding sold and
 * reserved cars would hide the reason a brief can't be met, and whether a
 * reserved car is worth mentioning to a customer is a judgement the person
 * matching should get to make, with the status in front of them.
 */
export interface EnquiryStockMatchOption {
  id: string;
  title: string;
  stockId: string;
  availability: string | null;
}

/* =========================================================
   A CAR WE HAVEN'T GOT
========================================================= */

export const PURCHASE_TIMELINES = [
  "Immediately",
  "1-3 months",
  "3-6 months",
  "6+ months",
  "Just looking",
] as const;

export type PurchaseTimeline = (typeof PURCHASE_TIMELINES)[number];

/**
 * What a customer is looking for that the showroom doesn't have.
 *
 * Every field is optional and most are ranges, because this is a brief
 * rather than an order: somebody saying "a white G-Class, 2021 or newer,
 * under 400" has told you enough to call them when one lands, and demanding
 * a variant and a mileage limit before the record can be saved would mean
 * the brief gets written on a sticky note instead.
 *
 * The make can be typed rather than picked for the same reason as a
 * customer's own car — they can want something nobody here has stocked.
 */
export interface EnquiryDreamCarDetails {
  brandId: string | null;
  brandOther: string | null;
  /** Resolved from brandId where there is one, for display. */
  brandName: string | null;
  model: string | null;
  variant: string | null;

  yearFrom: number | null;
  yearTo: number | null;
  budgetMin: number | null;
  budgetMax: number | null;

  exteriorColor: string | null;
  interiorColor: string | null;
  maxMileageKm: number | null;
  fuelType: string | null;
  transmission: string | null;
  spec: VehicleSpec | null;
  features: string | null;

  timeline: PurchaseTimeline | null;
  notes: string | null;

  /**
   * A car a colleague decided fits, if one has.
   *
   * Only ever written by a person. There is no rule anywhere that would
   * make this reliable automatically, and a wrong match means ringing a
   * customer about a car they didn't ask for.
   */
  matchedCarId: string | null;
  matchedAt: string | null;
}

/** What they're after, in one line. */
export function describeDreamCar(details: EnquiryDreamCarDetails): string {
  const brand = details.brandName ?? details.brandOther;

  const years =
    details.yearFrom && details.yearTo
      ? details.yearFrom === details.yearTo
        ? String(details.yearFrom)
        : `${details.yearFrom}–${details.yearTo}`
      : (details.yearFrom ?? details.yearTo)
        ? `${details.yearFrom ?? details.yearTo} onwards`
        : null;

  const line = [years, brand, details.model, details.variant].filter(Boolean).join(" ");

  return line || "No preferences given yet";
}

/** The budget as a phrase, however much of it they gave. */
export function describeBudget(min: number | null, max: number | null): string | null {
  const money = (value: number) => `AED ${value.toLocaleString()}`;

  if (min !== null && max !== null) return min === max ? money(min) : `${money(min)} – ${money(max)}`;
  if (max !== null) return `Up to ${money(max)}`;
  if (min !== null) return `From ${money(min)}`;

  return null;
}

/* =========================================================
   A GENERAL QUESTION
========================================================= */

/**
 * What a general enquiry is about.
 *
 * These exact six strings are what the enquiries table allows, and it only
 * allows them when the type is General — a Finance enquiry carrying
 * "Warranty" is refused at the database. Change one here and the check
 * constraint has to change with it.
 */
export const GENERAL_CATEGORIES = [
  "Vehicle Question",
  "Showroom Information",
  "Availability",
  "Warranty",
  "Documents",
  "Other",
] as const;

export type GeneralCategory = (typeof GENERAL_CATEGORIES)[number];

/** The label shown beside each, for people who don't live in this system. */
export const GENERAL_CATEGORY_HINTS: Record<GeneralCategory, string> = {
  "Vehicle Question": "Something about a specific car",
  "Showroom Information": "Opening hours, directions, who to ask for",
  Availability: "Whether we have something, or when we will",
  Warranty: "Cover, claims, what is included",
  Documents: "Registration, export papers, a copy of something",
  Other: "Anything that doesn't fit the rest",
};
