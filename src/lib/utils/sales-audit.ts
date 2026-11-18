import { formatMoney } from "@/src/lib/utils/sales-format";
import type {
  DealPayment,
  DealPriceChange,
  DealStatusChange,
  DealActivityItem,
} from "@/src/lib/types/sales-detail";
import type { AssignmentHistoryItem } from "@/src/lib/types/sales-owner";
import type { SalesDocumentItem } from "@/src/lib/types/sales-documents";

/*
|--------------------------------------------------------------------------
| UNIFIED DEAL AUDIT HISTORY (Sprint 6 Phase 16)
|--------------------------------------------------------------------------
|
| Until now a deal's history was spread across five tabs: status in one,
| pricing in another, payments, documents and ownership elsewhere. Answering
| "what happened to this deal, in order?" meant reading all of them.
|
| This merges every record the detail page already loads into one ordered
| list. It adds no queries and invents nothing: each entry is derived from a
| row that is already on screen somewhere else, so the two can never disagree.
*/

export type AuditKind = "status" | "pricing" | "payment" | "document" | "owner" | "activity";

export interface AuditEntry {
  /** Unique across kinds, so React keys never collide. */
  id: string;
  kind: AuditKind;
  /** What happened, in a few words. */
  title: string;
  /** The detail worth reading, or null when the title says it all. */
  detail: string | null;
  /** Who did it. "System" when the database did. */
  actor: string;
  at: string;
}

export const AUDIT_KIND_LABEL: Record<AuditKind, string> = {
  status: "Status",
  pricing: "Pricing",
  payment: "Payments",
  document: "Documents",
  owner: "Ownership",
  activity: "Other",
};

/** "deal_status_changed" becomes "Deal status changed". */
function humanise(value: string): string {
  const words = value.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface BuildInput {
  statusChanges: DealStatusChange[] | null;
  priceHistory: DealPriceChange[] | null;
  payments: DealPayment[] | null;
  documents: SalesDocumentItem[] | null;
  assignments: AssignmentHistoryItem[] | null;
  timeline: DealActivityItem[] | null;
  currency: string;
}

/**
 * Every recorded event on a deal, newest first.
 *
 * A null list means that source failed to load. It is skipped rather than
 * treated as empty, and the caller reports which sources were unavailable so
 * the history is never silently incomplete.
 */
export function buildDealAudit(input: BuildInput): {
  entries: AuditEntry[];
  /** Sources that couldn't be loaded, by name, for an honest warning. */
  unavailable: string[];
} {
  const entries: AuditEntry[] = [];
  const unavailable: string[] = [];

  /* ---- Status ---- */

  if (input.statusChanges === null) unavailable.push("status history");
  else {
    input.statusChanges.forEach((change) => {
      entries.push({
        id: `status-${change.id}`,
        kind: "status",
        title: change.old_status
          ? `Status moved from ${change.old_status} to ${change.new_status}`
          : `Status set to ${change.new_status}`,
        detail: change.reason,
        actor: change.changed_by_name,
        at: change.changed_at,
      });
    });
  }

  /* ---- Pricing ---- */

  if (input.priceHistory === null) unavailable.push("pricing history");
  else {
    input.priceHistory.forEach((change) => {
      const parts: string[] = [];

      if (change.proposed_price !== null) {
        parts.push(`proposed ${formatMoney(change.proposed_price, input.currency)}`);
      }
      if (change.discount_amount > 0) {
        parts.push(`discount ${formatMoney(change.discount_amount, input.currency)}`);
      }
      if (change.agreed_price !== null) {
        parts.push(`agreed ${formatMoney(change.agreed_price, input.currency)}`);
      }

      entries.push({
        id: `price-${change.id}`,
        kind: "pricing",
        title: change.approved_by_name ? "Pricing changed and approved" : "Pricing changed",
        detail: [parts.join(" · "), change.note].filter(Boolean).join(" — ") || null,
        actor: change.changed_by_name,
        at: change.changed_at,
      });
    });
  }

  /* ---- Payments ---- */

  if (input.payments === null) unavailable.push("payments");
  else {
    input.payments.forEach((payment) => {
      const direction = payment.direction === "out" ? "Refund" : payment.kind;

      entries.push({
        id: `payment-${payment.id}`,
        kind: "payment",
        title: `${direction} of ${formatMoney(payment.amount, payment.currency)} recorded`,
        detail: [payment.method, payment.reference, payment.status_reason].filter(Boolean).join(" · ")
          || payment.status,
        actor: payment.recorded_by_name,
        at: payment.recorded_at,
      });

      if (payment.verified_at) {
        entries.push({
          id: `payment-verified-${payment.id}`,
          kind: "payment",
          title: `${formatMoney(payment.amount, payment.currency)} verified`,
          detail: null,
          actor: payment.verified_by_name ?? "System",
          at: payment.verified_at,
        });
      }

      if (payment.reversed_at) {
        entries.push({
          id: `payment-reversed-${payment.id}`,
          kind: "payment",
          title: `${formatMoney(payment.amount, payment.currency)} reversed`,
          detail: payment.status_reason,
          actor: payment.reversed_by_name ?? "System",
          at: payment.reversed_at,
        });
      }
    });
  }

  /* ---- Documents ---- */

  if (input.documents === null) unavailable.push("documents");
  else {
    input.documents.forEach((document) => {
      entries.push({
        id: `document-${document.id}`,
        kind: "document",
        title: `${document.doc_type} ${document.doc_number} issued`,
        detail: document.total === null ? null : formatMoney(document.total, document.currency ?? undefined),
        actor: document.issued_by_name ?? "System",
        at: document.issued_at,
      });

      if (document.voided_at) {
        entries.push({
          id: `document-void-${document.id}`,
          kind: "document",
          title: `${document.doc_type} ${document.doc_number} voided`,
          detail: document.void_reason,
          actor: document.voided_by_name ?? "System",
          at: document.voided_at,
        });
      }
    });
  }

  /* ---- Ownership ---- */

  if (input.assignments === null) unavailable.push("ownership history");
  else {
    input.assignments.forEach((assignment) => {
      entries.push({
        id: `owner-${assignment.id}`,
        kind: "owner",
        title: assignment.previous_owner_name
          ? `Owner changed from ${assignment.previous_owner_name} to ${assignment.new_owner_name ?? "nobody"}`
          : `Owner set to ${assignment.new_owner_name ?? "nobody"}`,
        detail: assignment.reason,
        actor: assignment.changed_by_name,
        at: assignment.changed_at,
      });
    });
  }

  /* ---- Anything else the activity feed recorded ---- */

  if (input.timeline === null) unavailable.push("activity feed");
  else {
    /*
     * Status, pricing, payment, document and owner events already appear
     * above from their own tables. Including them again from the activity
     * feed would double every line, so only other kinds are taken.
     */
    const covered = /^(status|price|pricing|payment|document|owner|assign)/i;

    input.timeline
      .filter((item) => !covered.test(item.activity_type))
      .forEach((item) => {
        entries.push({
          id: `activity-${item.id}`,
          kind: "activity",
          title: humanise(item.activity_type),
          detail: item.description,
          actor: item.changedByName,
          at: item.changed_at,
        });
      });
  }

  entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return { entries, unavailable };
}