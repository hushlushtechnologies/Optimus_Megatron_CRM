import {
  EMPTY_OFFER_FILTERS,
  OFFER_SORTS,
  OFFER_TABS,
  type OfferFilters,
  type OfferSortId,
  type OfferTab,
} from "@/src/lib/types/offer-list";

/*
|--------------------------------------------------------------------------
| READING THE OFFERS LIST OUT OF A URL
|--------------------------------------------------------------------------
|
| One parser, used by the page and by the export route.
|
| Phase 24 is why this exists. Until now the page parsed its own search
| params inline, which was fine while it was the only reader. An export that
| claims to hold "the campaigns on screen" has to agree with the screen
| exactly, and the way that quietly stops being true is two copies of the
| same parsing drifting apart — a filter added to the page, missed in the
| route, and a file that silently holds more rows than the person was
| looking at. This is the same reason the enquiry module has
| parseEnquiryFilters.
|
| Everything here tolerates nonsense, because a query string is whatever
| somebody typed or whatever an old bookmark still says.
*/

/** A search param that may arrive as a string, an array, or not at all. */
export type RawParam = string | string[] | undefined;

/** The first value, as a trimmed string. Arrays happen when a key repeats. */
export function oneParam(value: RawParam): string {
  if (Array.isArray(value)) return (value[0] ?? "").trim();
  return (value ?? "").trim();
}

export function parseOfferTab(value: RawParam): OfferTab {
  const raw = oneParam(value);
  return (OFFER_TABS as readonly string[]).includes(raw) ? (raw as OfferTab) : "all";
}

export function parseOfferSort(value: RawParam): OfferSortId {
  const raw = oneParam(value);
  return OFFER_SORTS.some((option) => option.id === raw) ? (raw as OfferSortId) : "newest";
}

/** Capped, because a search term reaches a query. */
export function parseOfferSearch(value: RawParam): string {
  return oneParam(value).slice(0, 100);
}

/** A page number from a URL is whatever somebody typed, so it is clamped. */
export function parseOfferPage(value: RawParam): number {
  const parsed = Number.parseInt(oneParam(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * The filter drawer's state.
 *
 * Values are not checked against the lookup lists here. They are passed to
 * the query as equality filters, so an unknown value returns nothing rather
 * than everything — which is the safe direction for a filter to fail in.
 */
export function parseOfferFilters(params: Record<string, RawParam>): OfferFilters {
  return {
    ...EMPTY_OFFER_FILTERS,
    type: oneParam(params.type),
    status: oneParam(params.status),
    discountType: oneParam(params.discountType),
    createdBy: oneParam(params.createdBy),
    from: oneParam(params.from),
    to: oneParam(params.to),
  };
}
