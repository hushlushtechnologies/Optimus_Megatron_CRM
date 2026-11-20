import type { EnquiryPriority, PreferredContact } from "@/src/lib/types/enquiry";

/**
 * Everything the create form holds before it is sent.
 *
 * One flat object rather than a field per useState: the sections need to see
 * each other (whether a customer is chosen decides what the contact section
 * asks for), and a draft that lives in one place can be read back on the
 * review step without threading a dozen values through.
 */
export interface EnquiryDraft {
  /* ---- 1. What kind ---- */
  enquiryType: string;
  source: string;

  /* ---- 2. Who ---- */
  /**
   * How the customer was given: picked off the list, or typed in fresh.
   *
   * Kept explicit rather than inferred from customerId being null, because
   * "I haven't searched yet" and "I searched and they're new" need different
   * things on screen.
   */
  customerMode: "existing" | "new";
  customerId: string | null;
  /** Shown on the review step so nobody has to re-open the picker to check. */
  customerLabel: string;

  fullName: string;
  phone: string;
  email: string;
  preferredContact: PreferredContact | "";

  /* ---- 3. Which vehicle ---- */
  carId: string | null;
  vehicleText: string;

  /* ---- 4. Type-specific details ---- */
  /**
   * Filled by the per-type sections that Phases 8 to 12 add.
   *
   * Opaque here on purpose: this shell has no business knowing what a
   * finance enquiry asks for, and adding a type should not mean editing
   * the form that hosts it.
   */
  details: Record<string, unknown>;

  /* ---- 5 to 7. Handling ---- */
  assignedTo: string | null;
  locationId: string | null;
  priority: EnquiryPriority;
  subject: string;
  message: string;
}

export function emptyEnquiryDraft(currentUserId: string): EnquiryDraft {
  return {
    enquiryType: "",
    source: "Phone Call",

    customerMode: "new",
    customerId: null,
    customerLabel: "",

    fullName: "",
    phone: "",
    email: "",
    preferredContact: "",

    carId: null,
    vehicleText: "",

    details: {},

    /*
     * Whoever is typing is usually whoever took the call, and an enquiry
     * that arrives with an owner skips the unassigned queue entirely. It
     * stays changeable in the section itself.
     */
    assignedTo: currentUserId,
    locationId: null,
    priority: "Normal",
    subject: "",
    message: "",
  };
}

/* =========================================================
   SECTION READINESS
========================================================= */

/**
 * Whether the person has said enough for a section to count as answered.
 *
 * Used to decide what to reveal next and what the review step can show. It
 * is not validation: the schema on the server is what decides whether a
 * draft may be saved, and these are deliberately looser so somebody isn't
 * blocked from scrolling on by a field they meant to come back to.
 */
export const enquirySectionReady = {
  type: (draft: EnquiryDraft) => draft.enquiryType !== "" && draft.source !== "",

  customer: (draft: EnquiryDraft) =>
    draft.customerMode === "existing"
      ? draft.customerId !== null
      : draft.fullName.trim().length >= 2 && (draft.phone.trim() !== "" || draft.email.trim() !== ""),
};

/** The vehicle question only makes sense for some kinds of enquiry. */
export function needsVehicle(enquiryType: string): boolean {
  return enquiryType !== "General";
}
