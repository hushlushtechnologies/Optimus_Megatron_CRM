import { z } from "zod";

import { LINK_KINDS } from "@/src/lib/types/enquiry-links";

/*
|--------------------------------------------------------------------------
| LINKING AN ENQUIRY TO ANOTHER RECORD
|--------------------------------------------------------------------------
|
| recordId null unlinks. The kind has to be one of the four — an arbitrary
| string would reach the spec table as a key and read a column name from it,
| so this enum is load-bearing rather than tidiness.
*/

export const setEnquiryLinkSchema = z.object({
  enquiryId: z.string().uuid(),
  kind: z.enum(LINK_KINDS),
  recordId: z.string().uuid().nullable(),
});

export const listEnquiryLinkCandidatesSchema = z.object({
  enquiryId: z.string().uuid(),
  kind: z.enum(LINK_KINDS),
});
