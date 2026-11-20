import type { EnquiryStatusTone } from "@/src/lib/types/enquiry";

/*
|--------------------------------------------------------------------------
| ENQUIRY WORKFLOW
|--------------------------------------------------------------------------
|
| The vocabulary an enquiry is described in — its types, its sources, its
| statuses, and which status may follow which — lives in the database, in
| enquiry_types, enquiry_sources, enquiry_statuses and
| enquiry_status_transitions.
|
| It is data rather than code so a settings screen can change a workflow
| without a deploy. These are the shapes that data arrives in.
*/

export interface EnquiryTypeOption {
  key: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface EnquirySourceOption {
  key: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

export interface EnquiryStatusOption {
  key: string;
  label: string;
  tone: EnquiryStatusTone;
  /** Still needs somebody to do something. Drives the "needs attention" queue. */
  isOpen: boolean;
  /** Nothing follows it, so the workflow stops offering moves. */
  isTerminal: boolean;
  sortOrder: number;
  isActive: boolean;
}

/**
 * One allowed status move.
 *
 * enquiryType null means the move applies to every type. That is how the
 * common path is stated once and only the exceptions are repeated — Offer
 * Sent, for instance, exists for Sell My Car and Trade-In and nowhere else.
 */
export interface EnquiryTransition {
  fromStatus: string;
  toStatus: string;
  enquiryType: string | null;
}

export interface EnquiryWorkflow {
  types: EnquiryTypeOption[];
  sources: EnquirySourceOption[];
  statuses: EnquiryStatusOption[];
  transitions: EnquiryTransition[];
  /**
   * False when the lookup tables couldn't be read and the built-in fallback
   * is being used instead. Screens can say so rather than pretending the
   * list in front of someone is the configured one.
   */
  loaded: boolean;
}
