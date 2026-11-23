import { createClient } from "@/src/lib/supabase/server";
import { filsToDecimalString } from "@/src/lib/utils/sales-money";
import {
  OFFER_TAB_STATUSES,
  type OfferFilters,
  type OfferTab,
} from "@/src/lib/types/offer-list";

/*
|--------------------------------------------------------------------------
| OFFER AND LOYALTY EXPORTS (Phase 24)
|--------------------------------------------------------------------------
|
| Four datasets, matching the plan:
|
|   campaigns     the list, filtered or a ticked selection
|   redemptions   who used what, and what it cost
|   assignments   personalised offers and whether they were used
|   loyalty       the points ledger
|
| THREE THINGS THESE QUERIES DO DELIBERATELY
|
| They use createClient(), not the admin client. Row-level security still
| applies, so a person exports only the rows they can already see on screen.
| An export is the one place where widening access is invisible — nobody
| notices a file holding more than it should — so it is the one place not to
| be clever.
|
| They cap at EXPORT_LIMIT and say when the cap bit. A silently short file
| of financial data is worse than a refusal, because it looks complete.
|
| They format money from bigint fils to a decimal string here, once, rather
| than letting each generator do its own arithmetic. Fils are exact; a float
| is not, and "discounts given" is a figure somebody will reconcile against
| a bank statement.
*/

const EXPORT_LIMIT = 5000;

/*
 * The dataset names live in src/lib/types/offer-export.ts, not here. This
 * file imports the server Supabase client, so a client component that wants
 * one label from it would pull next/headers into the browser bundle — which
 * the build refuses, pointing at supabase/server.ts rather than at the
 * import that did it. Re-exported for the server-side callers that already
 * import this module.
 */
export type { OfferExportDataset } from "@/src/lib/types/offer-export";
export { OFFER_EXPORT_DATASETS, OFFER_EXPORT_LABELS } from "@/src/lib/types/offer-export";

export interface ExportResult<TRow> {
  rows: TRow[];
  /** How many matched before the cap. */
  total: number;
  truncated: boolean;
}

function empty<TRow>(): ExportResult<TRow> {
  return { rows: [], total: 0, truncated: false };
}

/** A money column, as a plain decimal string. Null stays null. */
function money(value: string | number | null): string | null {
  if (value === null || value === undefined) return null;
  try {
    return filsToDecimalString(BigInt(value));
  } catch {
    return null;
  }
}

/* =========================================================
   CAMPAIGNS
========================================================= */

export interface CampaignExportRow {
  reference: string | null;
  name: string;
  promotionType: string;
  status: string;
  discount: string;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  redemptionCount: number;
  maxRedemptions: number | null;
  /** Total discount actually given under this campaign, in dirhams. */
  discountGiven: string | null;
  minPurchase: string | null;
  maxDiscount: string | null;
  stackingPolicy: string | null;
  createdAt: string;
}

const CAMPAIGN_COLUMNS = `
  id, reference, name, promotion_type, status,
  discount_type, discount_value,
  starts_at, ends_at, priority,
  redemption_count, max_redemptions,
  min_purchase_fils, max_discount_fils, stacking_policy,
  created_at
`;

interface RawCampaign {
  id: string;
  reference: string | null;
  name: string;
  promotion_type: string;
  status: string;
  discount_type: string;
  discount_value: number | string;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  redemption_count: number;
  max_redemptions: number | null;
  min_purchase_fils: string | number | null;
  max_discount_fils: string | number | null;
  stacking_policy: string | null;
  created_at: string;
}

/** "10%" or "AED 5,000", the same sentence the list shows. */
function describeDiscount(type: string, value: number | string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";

  if (type === "percentage") {
    /* Stored in basis points of a percent; two decimals at most. */
    return `${Number(amount.toFixed(2))}%`;
  }

  return `AED ${amount.toLocaleString("en-US")}`;
}

export async function getCampaignExportRows(input: {
  scope: "current" | "selected";
  ids?: string[];
  tab: OfferTab;
  search: string;
  filters: OfferFilters;
}): Promise<ExportResult<CampaignExportRow>> {
  const supabase = await createClient();

  let query = supabase
    .from("promotions")
    .select(CAMPAIGN_COLUMNS, { count: "exact" })
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(EXPORT_LIMIT);

  if (input.scope === "selected") {
    query = query.in("id", input.ids ?? []);
  } else {
    /*
     * The same narrowing the list applies, in the same order. A tab is a set
     * of statuses; an explicit status filter is narrower still, so it wins.
     */
    const tabStatuses = OFFER_TAB_STATUSES[input.tab];

    if (input.filters.status) {
      query = query.eq("status", input.filters.status);
    } else if (tabStatuses) {
      query = query.in("status", [...tabStatuses]);
    }

    if (input.filters.type) query = query.eq("promotion_type", input.filters.type);
    if (input.filters.discountType) query = query.eq("discount_type", input.filters.discountType);
    if (input.filters.createdBy) query = query.eq("created_by", input.filters.createdBy);
    if (input.filters.from) query = query.gte("created_at", input.filters.from);
    if (input.filters.to) query = query.lte("created_at", input.filters.to);

    if (input.search) {
      const term = `%${input.search.replace(/[%_]/g, "")}%`;
      query = query.or(`name.ilike.${term},reference.ilike.${term}`);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("getCampaignExportRows error:", error);
    return empty();
  }

  const raw = (data ?? []) as unknown as RawCampaign[];

  /*
   * What each campaign actually gave away. One grouped query rather than one
   * per row — a sixty-row export should not be sixty round trips, and
   * "Discounts Given" is the figure the plan asks for by name.
   */
  const discountByPromotion = await sumDiscountsByPromotion(
    supabase,
    raw.map((row) => row.id),
  );

  const rows: CampaignExportRow[] = raw.map((row) => ({
    reference: row.reference,
    name: row.name,
    promotionType: row.promotion_type,
    status: row.status,
    discount: describeDiscount(row.discount_type, row.discount_value),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    priority: row.priority,
    redemptionCount: row.redemption_count,
    maxRedemptions: row.max_redemptions,
    discountGiven: discountByPromotion.get(row.id) ?? null,
    minPurchase: money(row.min_purchase_fils),
    maxDiscount: money(row.max_discount_fils),
    stackingPolicy: row.stacking_policy,
    createdAt: row.created_at,
  }));

  const total = count ?? rows.length;

  return { rows, total, truncated: total > rows.length };
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Total discount given per campaign, in dirhams.
 *
 * Summed in JavaScript from bigint fils rather than with a SQL sum(), so the
 * arithmetic is exact. A numeric sum returned through the client arrives as
 * a float, and this is a money figure somebody will reconcile.
 */
async function sumDiscountsByPromotion(
  supabase: SupabaseServerClient,
  promotionIds: string[],
): Promise<Map<string, string>> {
  const totals = new Map<string, string>();

  if (promotionIds.length === 0) return totals;

  const { data, error } = await supabase
    .from("offer_redemptions")
    .select("promotion_id, discount_fils")
    .in("promotion_id", promotionIds)
    .is("reversed_at", null);

  if (error) {
    console.error("sumDiscountsByPromotion error:", error);
    return totals;
  }

  const sums = new Map<string, bigint>();

  for (const row of (data ?? []) as unknown as {
    promotion_id: string;
    discount_fils: string | number | null;
  }[]) {
    if (row.discount_fils === null) continue;

    try {
      const current = sums.get(row.promotion_id) ?? 0n;
      sums.set(row.promotion_id, current + BigInt(row.discount_fils));
    } catch {
      /* A value that will not parse as a whole number of fils is skipped
         rather than silently turned into zero for the whole campaign. */
    }
  }

  for (const [id, fils] of sums) {
    totals.set(id, filsToDecimalString(fils));
  }

  return totals;
}

/* =========================================================
   REDEMPTIONS
========================================================= */

export interface RedemptionExportRow {
  redeemedAt: string;
  campaign: string | null;
  campaignReference: string | null;
  customer: string | null;
  vehicle: string | null;
  dealReference: string | null;
  code: string | null;
  discount: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
}

export async function getRedemptionExportRows(input: {
  promotionId?: string;
  from?: string;
  to?: string;
}): Promise<ExportResult<RedemptionExportRow>> {
  const supabase = await createClient();

  let query = supabase
    .from("offer_redemptions")
    .select(
      `
        redeemed_at, discount_fils, reversed_at, reversal_reason, status,
        promotion:promotions ( name, reference ),
        customer:customer_profiles ( full_name ),
        deal:sales_deals ( id, car:cars ( display_title, stock_id, manufacturing_year ) ),
        code:promotion_codes ( code )
      `,
      { count: "exact" },
    )
    .order("redeemed_at", { ascending: false })
    .limit(EXPORT_LIMIT);

  if (input.promotionId) query = query.eq("promotion_id", input.promotionId);
  if (input.from) query = query.gte("redeemed_at", input.from);
  if (input.to) query = query.lte("redeemed_at", input.to);

  const { data, error, count } = await query;

  if (error) {
    console.error("getRedemptionExportRows error:", error);
    return empty();
  }

  const rows: RedemptionExportRow[] = (
    (data ?? []) as unknown as {
      redeemed_at: string;
      discount_fils: string | number | null;
      reversed_at: string | null;
      reversal_reason: string | null;
      status: string | null;
      promotion: { name: string | null; reference: string | null } | null;
      customer: { full_name: string | null } | null;
      deal: { id: string; car: CarLabel | null } | null;
      code: { code: string | null } | null;
    }[]
  ).map((row) => ({
    redeemedAt: row.redeemed_at,
    campaign: row.promotion?.name ?? null,
    campaignReference: row.promotion?.reference ?? null,
    customer: row.customer?.full_name ?? null,
    vehicle: describeCar(row.deal?.car ?? null),
    dealReference: row.deal?.id ?? null,
    code: row.code?.code ?? null,
    discount: money(row.discount_fils),
    reversedAt: row.reversed_at,
    reversalReason: row.reversal_reason,
  }));

  const total = count ?? rows.length;

  return { rows, total, truncated: total > rows.length };
}

interface CarLabel {
  display_title: string | null;
  stock_id: string | null;
  manufacturing_year: number | null;
}

/**
 * How a vehicle reads in a file.
 *
 * cars has no make, model or year columns — brand and model are foreign
 * keys, and display_title is the denormalised label the rest of the
 * application shows. The stock number is appended because it is what
 * somebody matching this file against the floor will search for.
 */
function describeCar(car: CarLabel | null): string | null {
  if (!car) return null;

  const title = car.display_title?.trim();
  const base = title || (car.manufacturing_year ? String(car.manufacturing_year) : null);

  if (!base) return car.stock_id?.trim() || null;

  return car.stock_id ? `${base} (${car.stock_id})` : base;
}

/* =========================================================
   PERSONALISED OFFERS
========================================================= */

export interface AssignmentExportRow {
  assignedAt: string;
  campaign: string | null;
  customer: string | null;
  vehicle: string | null;
  validFrom: string | null;
  validTo: string | null;
  discountOverride: string | null;
  status: string;
  /** Whether this personalised offer was ever used. */
  used: string;
}

export async function getAssignmentExportRows(input: {
  promotionId?: string;
}): Promise<ExportResult<AssignmentExportRow>> {
  const supabase = await createClient();

  let query = supabase
    .from("customer_offer_assignments")
    .select(
      `
        id, created_at, valid_from, valid_to, discount_override_fils, status,
        promotion:promotions ( name ),
        customer:customer_profiles ( full_name ),
        car:cars ( display_title, stock_id, manufacturing_year )
      `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(EXPORT_LIMIT);

  if (input.promotionId) query = query.eq("promotion_id", input.promotionId);

  const { data, error, count } = await query;

  if (error) {
    console.error("getAssignmentExportRows error:", error);
    return empty();
  }

  const raw = (data ?? []) as unknown as {
    id: string;
    created_at: string;
    valid_from: string | null;
    valid_to: string | null;
    discount_override_fils: string | number | null;
    status: string;
    promotion: { name: string | null } | null;
    customer: { full_name: string | null } | null;
    car: CarLabel | null;
  }[];

  /*
   * "Personalised Offer Usage" is one of the metrics the plan asks for, and
   * it is not a column on the assignment — a redemption references the
   * assignment it came from. One query for the set, rather than per row.
   */
  const used = await usedAssignmentIds(
    supabase,
    raw.map((row) => row.id),
  );

  const rows: AssignmentExportRow[] = raw.map((row) => ({
    assignedAt: row.created_at,
    campaign: row.promotion?.name ?? null,
    customer: row.customer?.full_name ?? null,
    vehicle: describeCar(row.car),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    discountOverride: money(row.discount_override_fils),
    status: row.status,
    used: used.has(row.id) ? "Yes" : "No",
  }));

  const total = count ?? rows.length;

  return { rows, total, truncated: total > rows.length };
}

async function usedAssignmentIds(
  supabase: SupabaseServerClient,
  assignmentIds: string[],
): Promise<Set<string>> {
  const used = new Set<string>();

  if (assignmentIds.length === 0) return used;

  const { data, error } = await supabase
    .from("offer_redemptions")
    .select("assignment_id")
    .in("assignment_id", assignmentIds)
    .is("reversed_at", null);

  if (error) {
    /*
     * Reported, and then every assignment reads "No". Worth knowing that
     * this is the failure direction: it understates usage rather than
     * inventing it.
     */
    console.error("usedAssignmentIds error:", error);
    return used;
  }

  for (const row of (data ?? []) as unknown as { assignment_id: string | null }[]) {
    if (row.assignment_id) used.add(row.assignment_id);
  }

  return used;
}

/* =========================================================
   LOYALTY TRANSACTIONS
========================================================= */

export interface LoyaltyExportRow {
  createdAt: string;
  customer: string | null;
  entryType: string;
  points: number;
  source: string | null;
  reason: string | null;
  dealReference: string | null;
  expiresAt: string | null;
  actor: string | null;
}

export async function getLoyaltyExportRows(input: {
  customerId?: string;
  from?: string;
  to?: string;
}): Promise<ExportResult<LoyaltyExportRow>> {
  const supabase = await createClient();

  let query = supabase
    .from("loyalty_ledger")
    .select(
      `
        created_at, entry_type, points, source, reason, deal_id, expires_at,
        customer:customer_profiles ( full_name ),
        actor:profiles ( full_name )
      `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(EXPORT_LIMIT);

  if (input.customerId) query = query.eq("customer_id", input.customerId);
  if (input.from) query = query.gte("created_at", input.from);
  if (input.to) query = query.lte("created_at", input.to);

  const { data, error, count } = await query;

  if (error) {
    console.error("getLoyaltyExportRows error:", error);
    return empty();
  }

  const rows: LoyaltyExportRow[] = (
    (data ?? []) as unknown as {
      created_at: string;
      entry_type: string;
      points: number;
      source: string | null;
      reason: string | null;
      deal_id: string | null;
      expires_at: string | null;
      customer: { full_name: string | null } | null;
      actor: { full_name: string | null } | null;
    }[]
  ).map((row) => ({
    createdAt: row.created_at,
    customer: row.customer?.full_name ?? null,
    entryType: row.entry_type,
    points: row.points,
    source: row.source,
    reason: row.reason,
    dealReference: row.deal_id,
    expiresAt: row.expires_at,
    actor: row.actor?.full_name ?? null,
  }));

  const total = count ?? rows.length;

  return { rows, total, truncated: total > rows.length };
}

export { EXPORT_LIMIT as MAX_EXPORT_ROWS };
