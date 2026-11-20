/**
 * One thing that happened to an enquiry.
 *
 * The underlying records live in four tables — creation and conversion in
 * enquiry_activity, status moves in enquiry_status_history, reassignments in
 * enquiry_staff_assignment_history — because each has different columns. The
 * timeline is where they become one list a person can read top to bottom.
 */
export type EnquiryTimelineKind =
  | "created"
  | "status"
  | "assignment"
  | "converted"
  | "note"
  | "follow_up"
  /* Written by the actions rather than a trigger: see enquiry-audit.ts. */
  | "valuation"
  | "edited"
  | "archived";

export interface EnquiryTimelineEntry {
  /** Unique across the merged list: the source table plus the row's own id. */
  id: string;
  kind: EnquiryTimelineKind;
  title: string;
  /** The supporting line, such as a reason or what changed. */
  detail: string | null;
  /** null means the website did it, not a person. */
  actorName: string | null;
  at: string;
}
