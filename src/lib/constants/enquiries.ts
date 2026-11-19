/**
 * How many enquiries one page of the list holds.
 *
 * It lives in its own module, with no server imports, so the page and the
 * client component can both read it without pulling next/headers into the
 * browser bundle.
 */
export const ENQUIRY_PAGE_SIZE = 25;

/** How many enquiries one export may hold. */
export const ENQUIRY_EXPORT_LIMIT = 5000;

/**
 * A form filled in faster than this was almost certainly filled in by a
 * script. Three seconds is below the time a person needs to type a name and a
 * message, and well above a slow page load.
 */
export const ENQUIRY_MIN_FILL_SECONDS = 3;
