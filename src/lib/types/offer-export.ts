/*
|--------------------------------------------------------------------------
| THE EXPORT DATASETS
|--------------------------------------------------------------------------
|
| Deliberately its own file, with no imports.
|
| These four names are needed in three places: the export route, the query
| layer, and the client component that offers the choice. The obvious home
| for them was alongside the queries — but offer-export-queries.ts imports
| the server Supabase client, which reaches next/headers, and a "use client"
| component importing one constant from that file pulls the whole server
| module into the browser bundle. The build refuses it, with a stack that
| points at supabase/server.ts rather than at the import that caused it.
|
| A types file with nothing in it but data cannot cause that, whoever
| imports it.
*/

export type OfferExportDataset = "campaigns" | "redemptions" | "assignments" | "loyalty";

export const OFFER_EXPORT_DATASETS: readonly OfferExportDataset[] = [
  "campaigns",
  "redemptions",
  "assignments",
  "loyalty",
];

export const OFFER_EXPORT_LABELS: Record<OfferExportDataset, string> = {
  campaigns: "Campaigns",
  redemptions: "Redemption History",
  assignments: "Personalised Offers",
  loyalty: "Loyalty Transactions",
};

/** What each export covers, for the chooser. */
export const OFFER_EXPORT_HINTS: Record<OfferExportDataset, string> = {
  campaigns: "The campaigns matching your current filters, with what each has given away.",
  redemptions: "Every use of a promotion: who, which vehicle, and the discount given.",
  assignments: "Offers assigned to named customers, and whether they were used.",
  loyalty: "The points ledger: earned, redeemed, expired and adjusted.",
};
