import { discountForPrice } from "@/src/lib/utils/offer-rules";
import { toFils, type Fils } from "@/src/lib/utils/sales-money";

/*
|--------------------------------------------------------------------------
| WHAT THE FORM'S PREVIEW SHOWS
|--------------------------------------------------------------------------
|
| The create form shows what a discount does to an example price as somebody
| types it. That is arithmetic on money, so it lives here where it can be
| tested, rather than inline in a component where it cannot.
|
| It calls the same discountForPrice the rules engine uses, so the preview
| and the real calculation cannot disagree. That matters: a preview that
| rounds differently from the engine is a preview that lies by a fil, and
| "the screen said 37,500" is not an argument you want to have with a
| customer.
|
| THIS IS STILL A PREVIEW. The authoritative figure is calculated on the
| server when a deal is priced. This exists so somebody building a campaign
| can see what they are building.
*/

export interface PreviewInput {
  /** The example price, as typed. */
  priceText: string;
  discountType: "percentage" | "fixed";
  /** The discount, as typed: a percentage, or dirhams. */
  discountValue: string;
  /** The cap, as typed, in dirhams. Blank for none. */
  maxDiscountText: string;
  /** The minimum price the campaign applies to, as typed. Blank for none. */
  minPurchaseText: string;
}

export interface PreviewResult {
  /** Null when the price isn't a usable number yet. */
  originalFils: Fils | null;
  discountFils: Fils;
  /** The example price is under the campaign's minimum, so nothing applies. */
  belowMinimum: boolean;
  /** The cap reduced the discount below what the rate would have given. */
  cappedByMax: boolean;
}

export function previewDiscountFils(input: PreviewInput): PreviewResult {
  const originalFils = toFils(input.priceText);

  if (originalFils === null || originalFils <= 0n) {
    return { originalFils: null, discountFils: 0n, belowMinimum: false, cappedByMax: false };
  }

  const minimumFils = toFils(input.minPurchaseText);

  if (minimumFils !== null && minimumFils > 0n && originalFils < minimumFils) {
    return { originalFils, discountFils: 0n, belowMinimum: true, cappedByMax: false };
  }

  const value = Number(input.discountValue);

  if (!Number.isFinite(value) || value <= 0) {
    return { originalFils, discountFils: 0n, belowMinimum: false, cappedByMax: false };
  }

  const maxFils = toFils(input.maxDiscountText);
  const cap = maxFils !== null && maxFils > 0n ? maxFils : null;

  /*
   * The engine's own function, with the same arguments it gets in a real
   * calculation. A second implementation here would be a second set of
   * rounding rules.
   */
  const uncapped = discountForPrice(
    { discountType: input.discountType, discountValue: value, maxDiscountFils: null },
    originalFils,
  );

  const capped = discountForPrice(
    { discountType: input.discountType, discountValue: value, maxDiscountFils: cap },
    originalFils,
  );

  return {
    originalFils,
    discountFils: capped,
    belowMinimum: false,
    cappedByMax: cap !== null && capped < uncapped,
  };
}
