const LABELS: Record<string, string> = {
  discount_auto_approve_percent: "Discount limit with no approval",
  fees_enabled: "Fees",
  reservation_default_days: "Default hold (days)",
  reservation_max_days: "Longest hold (days)",
  reservation_deposit_mode: "Deposit type",
  reservation_deposit_value: "Deposit",
  confirm_min_deposit_percent: "Deposit needed to confirm",
  payments_require_separate_verifier: "Different person verifies payments",
  vat_rate_percent: "VAT rate",
  currency: "Currency",
  inventory_sync_enabled: "Inventory sync",
  name: "Name",
  calc_mode: "Type",
  value: "Value",
  is_active: "Active",
    legal_name: "Company name",
  trade_name: "Trading name",
  address: "Address",
  phone: "Phone",
  email: "Email",
  website: "Website",
  tax_registration_number: "Tax registration number",
  bank_details: "Bank details",
  quotation_terms: "Quotation terms",
  invoice_footer: "Invoice notes",
  quotation_valid_days: "Quotation validity (days)",
    label: "Name",
  SWITCH_KEYS: "Required",
};

const IGNORED = new Set([
  "id", "updated_at", "updated_by", "created_at", "sort_order", "rule",
  "inventory_status_available", "inventory_status_reserved", "inventory_status_sold",
]);

const PERCENT_KEYS = new Set(["discount_auto_approve_percent", "confirm_min_deposit_percent", "vat_rate_percent"]);
const SWITCH_KEYS = new Set([
  "fees_enabled", "payments_require_separate_verifier", "inventory_sync_enabled", "is_active",
]);

function show(key: string, value: unknown): string {
  if (value === null || value === undefined) return "not set";
  if (SWITCH_KEYS.has(key)) return value ? "On" : "Off";
  if (PERCENT_KEYS.has(key)) return `${value}%`;
    const text = String(value);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

type Values = Record<string, unknown> | null;

/** Plain sentences describing what changed. An empty list means nothing worth showing changed. */
export function describeSettingsChange(
  entity: "settings" | "fee" | "company" | "checklist",
  oldValues: Values,
  newValues: Values,
): string[] {
  if (!newValues) return [];

    if (entity === "fee" && !oldValues) return [`Fee added: ${String(newValues.name ?? "")}`];
  if (entity === "checklist" && !oldValues) return [`Delivery check added: ${String(newValues.label ?? "")}`];

  const prefix =
    entity === "fee"
      ? `${String(newValues.name ?? "Fee")}: `
      : entity === "checklist"
        ? `${String(newValues.label ?? "Check")}: `
        : "";
  const changes: string[] = [];

  for (const key of Object.keys(newValues)) {
    if (IGNORED.has(key)) continue;
    const before = oldValues?.[key];
    const after = newValues[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes.push(`${prefix}${LABELS[key] ?? key}: ${show(key, before)} to ${show(key, after)}`);
  }

  return changes;
}