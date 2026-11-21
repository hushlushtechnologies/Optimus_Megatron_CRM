/*
|--------------------------------------------------------------------------
| MOVED TO shared/form-section.tsx
|--------------------------------------------------------------------------
|
| The offer create form in Sprint 8 needs the same numbered step, so the
| implementation moved to src/components/shared/form-section.tsx rather than
| being copied.
|
| These two names stay exported from here so nothing in Sprint 7 had to be
| touched. New code should import FormSection and ReviewLine from the shared
| module directly.
*/

export {
  FormSection as EnquiryFormSection,
  ReviewLine as EnquiryReviewLine,
} from "@/src/components/shared/form-section";
