import { ENQUIRY_STATUS_TONES, type EnquiryListRow, type EnquiryStatus } from "@/src/lib/types/enquiry";

/**
 * Splits a single name field into a first and last name.
 *
 * A website form asks for one name; a customer record wants two. The split is
 * a starting point the person converting can correct — the last word becomes
 * the surname, which is right for most names and wrong for enough of them
 * that the field stays editable.
 */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };

  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export function enquiryStatusTone(status: EnquiryStatus) {
  return ENQUIRY_STATUS_TONES[status];
}

/**
 * How long an enquiry has been sitting, in words.
 *
 * Deliberately coarse. "3 days" is what somebody acts on; "3 days, 4 hours
 * and 12 minutes" is noise on a list of forty rows.
 */
export function waitingFor(createdAt: string, now: number = Date.now()): string {
  const started = new Date(createdAt).getTime();

  if (Number.isNaN(started)) return "unknown";

  const minutes = Math.max(0, Math.round((now - started) / 60000));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"}`;

  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;

  const months = Math.round(days / 30);
  return `${months} ${months === 1 ? "month" : "months"}`;
}

/**
 * Whether an enquiry has waited long enough to be worth flagging.
 *
 * A day. Long enough that an enquiry arriving overnight isn't marked urgent
 * before anyone has had a chance to open the CRM.
 */
export function isStale(row: EnquiryListRow, now: number = Date.now()): boolean {
  if (row.status !== "New") return false;

  const started = new Date(row.created_at).getTime();
  if (Number.isNaN(started)) return false;

  return now - started > 24 * 60 * 60 * 1000;
}

/** What the enquiry says about the vehicle, from either field. */
export function enquiryVehicleLabel(row: EnquiryListRow): string | null {
  if (row.vehicle_title) {
    return row.stock_id ? `${row.vehicle_title} (${row.stock_id})` : row.vehicle_title;
  }

  return row.vehicle_text?.trim() || null;
}

/** The best way to reach this person, as a short line. */
export function enquiryContactLine(row: EnquiryListRow): string {
  const parts = [row.phone?.trim(), row.email?.trim()].filter((part): part is string => !!part);

  if (parts.length === 0) return "No contact details";

  const line = parts.join(" · ");

  return row.preferred_contact ? `${line} · prefers ${row.preferred_contact}` : line;
}
