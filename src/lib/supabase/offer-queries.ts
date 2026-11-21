import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import {
  OFFER_SORTS,
  OFFER_TAB_STATUSES,
  type OfferFilters,
  type OfferListRow,
  type OfferSortId,
  type OfferSummary,
  type OfferTab,
} from "@/src/lib/types/offer-list";
import type {
  OfferAssignment,
  OfferDetail,
  OfferDetailTarget,
  OfferRedemption,
} from "@/src/lib/types/offer-detail";
import type { DiscountType, PromotionStatus, PromotionType } from "@/src/lib/types/offers";

/*
|--------------------------------------------------------------------------
| READING CAMPAIGNS
|--------------------------------------------------------------------------
|
| The counts of targets, assignments and codes come back as PostgREST
| aggregate embeds rather than one query per row, so a page of sixty
| campaigns is one round trip.
*/

const LIST_COLUMNS = `
  id, name, reference, promotion_type, status,
  discount_type, discount_value,
  starts_at, ends_at, priority,
  redemption_count, max_redemptions,
  created_at, archived_at, created_by,
  promotion_targets ( target_kind ),
  customer_offer_assignments ( id ),
  promotion_codes ( id )
`;

type RawOffer = {
  id: string;
  name: string;
  reference: string | null;
  promotion_type: string;
  status: string;
  discount_type: string;
  discount_value: number | string;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  redemption_count: number;
  max_redemptions: number | null;
  created_at: string;
  archived_at: string | null;
  created_by: string | null;
  promotion_targets: { target_kind: string }[] | null;
  customer_offer_assignments: { id: string }[] | null;
  promotion_codes: { id: string }[] | null;
};

/**
 * "2 brands, 1 collection" — the targeting in a phrase.
 *
 * No targets means every eligible vehicle, which is a statement rather than
 * an absence, so it returns null and the card says so in its own words.
 */
function summariseTargets(targets: { target_kind: string }[] | null): string | null {
  if (!targets || targets.length === 0) return null;

  const counts = targets.reduce<Record<string, number>>((acc, target) => {
    acc[target.target_kind] = (acc[target.target_kind] ?? 0) + 1;
    return acc;
  }, {});

  const plural: Record<string, [string, string]> = {
    car: ["vehicle", "vehicles"],
    brand: ["brand", "brands"],
    model: ["model", "models"],
    collection: ["collection", "collections"],
    location: ["showroom", "showrooms"],
  };

  return Object.entries(counts)
    .map(([kind, count]) => {
      const [one, many] = plural[kind] ?? [kind, `${kind}s`];
      return `${count} ${count === 1 ? one : many}`;
    })
    .join(", ");
}

function toRow(raw: RawOffer, nameOf: Map<string, string>): OfferListRow {
  return {
    id: raw.id,
    name: raw.name,
    reference: raw.reference,
    promotionType: raw.promotion_type as PromotionType,
    status: raw.status as PromotionStatus,
    discountType: raw.discount_type as DiscountType,
    discountValue: Number(raw.discount_value),
    startsAt: raw.starts_at,
    endsAt: raw.ends_at,
    priority: Number(raw.priority),
    redemptionCount: Number(raw.redemption_count),
    maxRedemptions: raw.max_redemptions === null ? null : Number(raw.max_redemptions),
    targetSummary: summariseTargets(raw.promotion_targets),
    assignmentCount: raw.customer_offer_assignments?.length ?? 0,
    codeCount: raw.promotion_codes?.length ?? 0,
    createdByName: raw.created_by ? (nameOf.get(raw.created_by) ?? null) : null,
    createdAt: raw.created_at,
    archivedAt: raw.archived_at,
  };
}

/** Names for a set of staff ids, in one query. */
async function resolveNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();

  const { data } = await supabase.from("profiles").select("id, full_name").in("id", wanted);

  return new Map(
    ((data ?? []) as { id: string; full_name: string | null }[]).map((row) => [
      row.id,
      row.full_name?.trim() || "Unknown",
    ]),
  );
}

/* =========================================================
   THE LIST
========================================================= */

export interface OfferListResult {
  rows: OfferListRow[];
  totalCount: number;
}

export async function getOfferList(input: {
  tab: OfferTab;
  search: string;
  filters: OfferFilters;
  sortId: OfferSortId;
  page: number;
  pageSize: number;
}): Promise<OfferListResult | null> {
  const supabase = await createClient();

  let query = supabase
    .from("promotions")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("archived_at", null);

  /* ---- Tab ---- */

  const tabStatuses = OFFER_TAB_STATUSES[input.tab];
  if (tabStatuses) query = query.in("status", [...tabStatuses]);

  /* ---- Search ---- */

  if (input.search.trim() !== "") {
    const term = `%${input.search.trim()}%`;
    query = query.or(`name.ilike.${term},reference.ilike.${term},description.ilike.${term}`);
  }

  /* ---- Filters ---- */

  const { filters } = input;

  if (filters.type) query = query.eq("promotion_type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.discountType) query = query.eq("discount_type", filters.discountType);
  if (filters.createdBy) query = query.eq("created_by", filters.createdBy);

  /* Dubai day boundaries, so "from the 1st" means the 1st in Dubai. */
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00+04:00`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59+04:00`);

  /* ---- Sort ---- */

  const sort = OFFER_SORTS.find((option) => option.id === input.sortId) ?? OFFER_SORTS[0];

  query = query.order(sort.column, { ascending: sort.ascending, nullsFirst: false });
  /* A second key so equal values never reorder between page loads. */
  query = query.order("id", { ascending: true });

  /* ---- Page ---- */

  const from = (input.page - 1) * input.pageSize;
  query = query.range(from, from + input.pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("getOfferList error:", error);
    return null;
  }

  const raw = (data ?? []) as unknown as RawOffer[];
  const nameOf = await resolveNames(supabase, raw.map((row) => row.created_by));

  return {
    rows: raw.map((row) => toRow(row, nameOf)),
    totalCount: count ?? 0,
  };
}

/* =========================================================
   THE DASHBOARD
========================================================= */

/**
 * Everything the overview shows, in parallel.
 *
 * Nothing here invents a trend. The plan says not to, and a 30-day change
 * figure computed from a module that went live yesterday is noise dressed as
 * insight — so the summary returns counts, and the cards show counts.
 */
export async function getOfferSummary(): Promise<OfferSummary | null> {
  const supabase = await createClient();

  const now = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const countOf = (status: PromotionStatus | null) => {
    let q = supabase
      .from("promotions")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null);

    if (status) q = q.eq("status", status);
    return q;
  };

  const [
    total,
    active,
    scheduled,
    expired,
    assignments,
    redemptions,
    runningNow,
    startingNext,
    justEnded,
    loyaltySettings,
  ] = await Promise.all([
    countOf(null),
    countOf("active"),
    countOf("scheduled"),
    countOf("expired"),
    supabase
      .from("customer_offer_assignments")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("offer_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "applied"),
    supabase
      .from("promotions")
      .select(LIST_COLUMNS)
      .eq("status", "active")
      .is("archived_at", null)
      .order("ends_at", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase
      .from("promotions")
      .select(LIST_COLUMNS)
      .eq("status", "scheduled")
      .is("archived_at", null)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase
      .from("promotions")
      .select(LIST_COLUMNS)
      .eq("status", "expired")
      .is("archived_at", null)
      .gte("ends_at", thirtyDaysAgo)
      .order("ends_at", { ascending: false })
      .limit(5),
    supabase.from("loyalty_settings").select("is_enabled").maybeSingle(),
  ]);

  if (total.error) {
    console.error("getOfferSummary error:", total.error);
    return null;
  }

  const allRaw = [
    ...((runningNow.data ?? []) as unknown as RawOffer[]),
    ...((startingNext.data ?? []) as unknown as RawOffer[]),
    ...((justEnded.data ?? []) as unknown as RawOffer[]),
  ];

  const nameOf = await resolveNames(supabase, allRaw.map((row) => row.created_by));

  const currentlyActive = ((runningNow.data ?? []) as unknown as RawOffer[]).map((row) =>
    toRow(row, nameOf),
  );
  const scheduledNext = ((startingNext.data ?? []) as unknown as RawOffer[]).map((row) =>
    toRow(row, nameOf),
  );
  const recentlyExpired = ((justEnded.data ?? []) as unknown as RawOffer[]).map((row) =>
    toRow(row, nameOf),
  );

  /* ---- What needs a look, and why ---- */

  const needsAttention: OfferSummary["needsAttention"] = [];
  const nowMs = Date.parse(now);
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  for (const offer of currentlyActive) {
    if (offer.endsAt !== null) {
      const left = Date.parse(offer.endsAt) - nowMs;
      if (left > 0 && left <= sevenDays) {
        const days = Math.ceil(left / (24 * 60 * 60 * 1000));
        needsAttention.push({
          offer,
          reason: days <= 1 ? "Ends today" : `Ends in ${days} days`,
        });
        continue;
      }
    }

    if (offer.maxRedemptions !== null) {
      const share = offer.redemptionCount / offer.maxRedemptions;
      if (share >= 1) {
        needsAttention.push({ offer, reason: "Fully redeemed but still running" });
        continue;
      }
      if (share >= 0.9) {
        needsAttention.push({
          offer,
          reason: `${offer.redemptionCount} of ${offer.maxRedemptions} redeemed`,
        });
        continue;
      }
    }

    /* Running but reachable by nobody — usually a half-finished setup. */
    if (offer.promotionType === "customer" && offer.assignmentCount === 0) {
      needsAttention.push({ offer, reason: "A customer offer with nobody assigned" });
      continue;
    }

    if (offer.promotionType === "code" && offer.codeCount === 0) {
      needsAttention.push({ offer, reason: "A code campaign with no code" });
    }
  }

  /* ---- Loyalty ---- */

  const enabled = (loyaltySettings.data as { is_enabled: boolean } | null)?.is_enabled ?? null;

  let loyalty: OfferSummary["loyalty"] = null;

  if (enabled !== null) {
    const [wallets, earned, redeemed] = await Promise.all([
      supabase.from("loyalty_wallets").select("available_points"),
      supabase
        .from("loyalty_ledger")
        .select("points")
        .eq("entry_type", "earn")
        .gte("created_at", thirtyDaysAgo),
      supabase
        .from("loyalty_ledger")
        .select("points")
        .eq("entry_type", "redeem")
        .gte("created_at", thirtyDaysAgo),
    ]);

    const walletRows = (wallets.data ?? []) as { available_points: number }[];

    loyalty = {
      isEnabled: enabled,
      /* A wallet with nothing in it is not a participant. */
      participatingCustomers: walletRows.filter((row) => row.available_points > 0).length,
      pointsOutstanding: walletRows.reduce((sum, row) => sum + Number(row.available_points), 0),
      pointsEarned30d: ((earned.data ?? []) as { points: number }[]).reduce(
        (sum, row) => sum + Number(row.points),
        0,
      ),
      pointsRedeemed30d: ((redeemed.data ?? []) as { points: number }[]).reduce(
        (sum, row) => sum - Number(row.points),
        0,
      ),
    };
  }

  return {
    totalPromotions: total.count ?? 0,
    activePromotions: active.count ?? 0,
    scheduledPromotions: scheduled.count ?? 0,
    expiredPromotions: expired.count ?? 0,
    personalisedOffers: assignments.count ?? 0,
    totalRedemptions: redemptions.count ?? 0,
    currentlyActive,
    scheduledNext,
    recentlyExpired,
    needsAttention,
    loyalty,
  };
}

/* =========================================================
   LOOKUPS FOR THE FILTERS AND FORM
========================================================= */

export interface OfferLookups {
  staff: { id: string; full_name: string }[];
  brands: { id: string; name: string }[];
  models: { id: string; name: string; brand_id: string }[];
  collections: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  customerTags: { id: string; name: string }[];
}

export async function getOfferLookups(): Promise<OfferLookups> {
  const supabase = await createClient();

  const [staff, brands, models, collections, locations, tags] = await Promise.all([
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase.from("brands").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("models").select("id, name, brand_id").eq("is_active", true).order("name"),
    supabase.from("collections").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("locations").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("customer_tags").select("id, name").eq("is_active", true).order("sort_order"),
  ]);

  return {
    staff: (staff.data ?? []) as { id: string; full_name: string }[],
    brands: (brands.data ?? []) as { id: string; name: string }[],
    models: (models.data ?? []) as { id: string; name: string; brand_id: string }[],
    collections: (collections.data ?? []) as { id: string; name: string }[],
    locations: (locations.data ?? []) as { id: string; name: string }[],
    customerTags: (tags.data ?? []) as { id: string; name: string }[],
  };
}

/* =========================================================
   WHAT A CAMPAIGN WOULD ACTUALLY COVER

   The count behind the targeting step. Built from the same OR semantics as
   carIsTargeted in offer-rules.ts: matching any one target is enough, and no
   targets at all means every vehicle.

   Counted on the server, because the person picking brands has no business
   knowing how many cars are in stock before they pick, and because a client
   that counted this itself would need every car's brand, model, collection
   and location to do it.
========================================================= */

/*
 * One shape for a target, everywhere: the same field names the database
 * column and upsertPromotionSchema use. The terser { kind, id } was a second
 * spelling of the same idea, and two spellings of one payload is how Sprint
 * 7's trade-in fields went missing.
 */
export interface TargetSelection {
  targetKind: "car" | "brand" | "model" | "collection" | "location";
  targetId: string;
}

export interface TargetedVehicleCount {
  /** Every vehicle in stock, archived ones excluded. */
  total: number;
  /** How many of them this targeting covers. */
  matched: number;
}

const TARGET_COLUMN: Record<TargetSelection["targetKind"], string> = {
  car: "id",
  brand: "brand_id",
  model: "model_id",
  collection: "collection_id",
  location: "location_id",
};

export async function countTargetedVehicles(
  targets: TargetSelection[],
): Promise<TargetedVehicleCount | null> {
  const supabase = await createClient();

  const totalQuery = await supabase
    .from("cars")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null);

  if (totalQuery.error) {
    console.error("countTargetedVehicles total error:", totalQuery.error);
    return null;
  }

  const total = totalQuery.count ?? 0;

  /* No targets is not an empty selection — it is "everything". */
  if (targets.length === 0) return { total, matched: total };

  /*
   * One OR across the five columns. Grouping the ids per column first means
   * five clauses rather than one per target, so picking forty models is
   * still one short query.
   */
  const byColumn = new Map<string, string[]>();

  for (const target of targets) {
    const column = TARGET_COLUMN[target.targetKind];
    if (!column) continue;

    const list = byColumn.get(column) ?? [];
    list.push(target.targetId);
    byColumn.set(column, list);
  }

  const clauses = [...byColumn.entries()].map(
    ([column, ids]) => `${column}.in.(${ids.join(",")})`,
  );

  if (clauses.length === 0) return { total, matched: 0 };

  const matchedQuery = await supabase
    .from("cars")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null)
    .or(clauses.join(","));

  if (matchedQuery.error) {
    console.error("countTargetedVehicles matched error:", matchedQuery.error);
    return null;
  }

  return { total, matched: matchedQuery.count ?? 0 };
}

/* =========================================================
   FINDING ONE CAR TO TARGET

   Brands, models, collections and locations are short lookup lists, so the
   form holds all of them and filters in the browser. Cars are not: there can
   be thousands, and shipping thousands to a form to let somebody tick three
   is a page that takes a second to open and megabytes to load.

   So this searches, server-side, and returns twenty.
========================================================= */

export interface TargetCarOption {
  id: string;
  stockId: string | null;
  title: string;
  year: number | null;
}

export async function searchCarsForTargeting(term: string): Promise<TargetCarOption[]> {
  const trimmed = term.trim();

  /* Two characters, because one letter matches most of the stock list. */
  if (trimmed.length < 2) return [];

  const supabase = await createClient();

  const pattern = `%${trimmed}%`;

  const { data, error } = await supabase
    .from("cars")
    .select("id, stock_id, display_title, manufacturing_year")
    .is("archived_at", null)
    .or(`display_title.ilike.${pattern},stock_id.ilike.${pattern},vin.ilike.${pattern}`)
    .order("display_title")
    .limit(20);

  if (error) {
    console.error("searchCarsForTargeting error:", error);
    return [];
  }

  return (data ?? []).map((row) => {
    const car = row as {
      id: string;
      stock_id: string | null;
      display_title: string | null;
      manufacturing_year: number | null;
    };

    return {
      id: car.id,
      stockId: car.stock_id,
      title: car.display_title ?? "Untitled vehicle",
      year: car.manufacturing_year,
    };
  });
}

/* =========================================================
   ONE CAMPAIGN, IN FULL

   Eight sections on the detail page, so eight things to load. They go out
   together rather than in sequence: the page cannot render until all of them
   are back, so serialising them would just add their latencies up.

   Names are resolved in a second pass rather than with PostgREST embeds for
   the target rows, because a target can point at a car, a brand, a model, a
   collection or a location — five different tables from one column, which no
   single embed expresses.
========================================================= */

const DETAIL_COLUMNS = `
  id, name, reference, description,
  promotion_type, status,
  discount_type, discount_value,
  min_purchase_fils, max_discount_fils, points_multiplier, stacking_policy,
  starts_at, ends_at, priority,
  max_redemptions, max_per_customer, redemption_count,
  internal_notes, banner_url,
  is_active, archived_at, created_by, created_at
`;

/** Resolves profile ids to names in one query. */
async function profileNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map();

  const { data } = await supabase.from("profiles").select("id, full_name").in("id", wanted);

  return new Map(
    ((data ?? []) as { id: string; full_name: string | null }[]).map((row) => [
      row.id,
      row.full_name ?? "Unknown",
    ]),
  );
}

/**
 * Names for a set of targets, across the five tables they can point at.
 *
 * One query per table that is actually referenced, not one per target. A
 * campaign targeting forty models is two queries, not forty.
 */
async function targetNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: { target_kind: string; target_id: string }[],
): Promise<Map<string, string>> {
  const byKind = new Map<string, string[]>();

  for (const row of rows) {
    const list = byKind.get(row.target_kind) ?? [];
    list.push(row.target_id);
    byKind.set(row.target_kind, list);
  }

  const table: Record<string, { name: string; column: string }> = {
    brand: { name: "brands", column: "name" },
    model: { name: "models", column: "name" },
    collection: { name: "collections", column: "name" },
    location: { name: "locations", column: "name" },
    car: { name: "cars", column: "display_title" },
  };

  const found = new Map<string, string>();

  await Promise.all(
    [...byKind.entries()].map(async ([kind, ids]) => {
      const spec = table[kind];
      if (!spec) return;

      const { data } = await supabase
        .from(spec.name)
        .select(`id, ${spec.column}`)
        .in("id", [...new Set(ids)]);

      /*
       * Cast through unknown: the select string is built from `spec.column`,
       * and PostgREST's types parse the select at compile time from a
       * literal. A template literal is not one, so it resolves to a parser
       * error type rather than a row type.
       */
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        const id = row.id as string;
        const label = row[spec.column] as string | null;
        /* Keyed by kind too: a car and a brand could share an id in theory. */
        found.set(`${kind}:${id}`, label ?? "Unnamed");
      }
    }),
  );

  return found;
}

export async function getOfferDetail(id: string): Promise<OfferDetail | null> {
  const supabase = await createClient();

  const [
    promotion,
    targets,
    rules,
    assignments,
    codes,
    redemptions,
    statusHistory,
    activity,
  ] = await Promise.all([
    supabase.from("promotions").select(DETAIL_COLUMNS).eq("id", id).maybeSingle(),

    supabase
      .from("promotion_targets")
      .select("id, target_kind, target_id")
      .eq("promotion_id", id),

    supabase
      .from("promotion_eligibility_rules")
      .select("id, rule_kind, operator, value")
      .eq("promotion_id", id)
      .order("created_at"),

    supabase
      .from("customer_offer_assignments")
      .select(
        `id, customer_id, car_id, valid_from, valid_to, discount_override_fils,
         status, notes, assigned_by, created_at,
         customer:customer_profiles(full_name, customer_number, lifecycle_status),
         car:cars(display_title)`,
      )
      .eq("promotion_id", id)
      .order("created_at", { ascending: false }),

    supabase
      .from("promotion_codes")
      .select("id, code, usage_limit, per_customer_limit, used_count, is_active, created_by, created_at")
      .eq("promotion_id", id)
      .order("created_at", { ascending: false }),

    supabase
      .from("offer_redemptions")
      .select(
        `id, customer_id, deal_id, code_id, discount_fils, status,
         reversed_at, reversal_reason, redeemed_by, redeemed_at, terms,
         customer:customer_profiles(full_name, customer_number),
         code:promotion_codes(code)`,
      )
      .eq("promotion_id", id)
      .order("redeemed_at", { ascending: false })
      .limit(200),

    supabase
      .from("promotion_status_history")
      .select("id, old_status, new_status, reason, changed_by, changed_at")
      .eq("promotion_id", id)
      .order("changed_at", { ascending: false })
      .limit(100),

    supabase
      .from("promotion_activity")
      .select("id, activity_type, field_name, old_value, new_value, description, changed_by, changed_at")
      .eq("promotion_id", id)
      .order("changed_at", { ascending: false })
      .limit(200),
  ]);

  if (promotion.error || !promotion.data) {
    if (promotion.error) console.error("getOfferDetail error:", promotion.error);
    return null;
  }

  const p = promotion.data as unknown as Record<string, unknown>;

  const targetRows = (targets.data ?? []) as { id: string; target_kind: string; target_id: string }[];

  const [names, labels] = await Promise.all([
    profileNames(supabase, [
      p.created_by as string | null,
      ...((assignments.data ?? []) as { assigned_by: string | null }[]).map((r) => r.assigned_by),
      ...((codes.data ?? []) as { created_by: string | null }[]).map((r) => r.created_by),
      ...((redemptions.data ?? []) as { redeemed_by: string | null }[]).map((r) => r.redeemed_by),
      ...((statusHistory.data ?? []) as { changed_by: string | null }[]).map((r) => r.changed_by),
      ...((activity.data ?? []) as { changed_by: string | null }[]).map((r) => r.changed_by),
    ]),
    targetNames(supabase, targetRows),
  ]);

  const redemptionRows = (redemptions.data ?? []) as unknown as Record<string, unknown>[];

  /*
   * Totals over fils, summed as BigInt. Number() here would start losing
   * precision somewhere above 90 trillion fils, which is a silly number of
   * dirhams — but the whole convention exists so that nobody has to reason
   * about where the silly number starts.
   */
  let discountGiven = 0n;
  let appliedCount = 0;
  let reversedCount = 0;

  for (const row of redemptionRows) {
    if (row.status === "applied") {
      appliedCount += 1;
      discountGiven += BigInt((row.discount_fils as string | number | null) ?? 0);
    } else {
      reversedCount += 1;
    }
  }

  const str = (value: unknown): string | null =>
    value === null || value === undefined ? null : String(value);

  return {
    id: p.id as string,
    name: p.name as string,
    reference: str(p.reference),
    description: str(p.description),

    promotionType: p.promotion_type as OfferDetail["promotionType"],
    status: p.status as OfferDetail["status"],

    discountType: p.discount_type as OfferDetail["discountType"],
    discountValue: Number(p.discount_value ?? 0),
    minPurchaseFils: str(p.min_purchase_fils),
    maxDiscountFils: str(p.max_discount_fils),
    pointsMultiplier: p.points_multiplier === null ? null : Number(p.points_multiplier),
    stackingPolicy: p.stacking_policy as OfferDetail["stackingPolicy"],

    startsAt: str(p.starts_at),
    endsAt: str(p.ends_at),
    priority: Number(p.priority ?? 0),

    maxRedemptions: p.max_redemptions === null ? null : Number(p.max_redemptions),
    maxPerCustomer: p.max_per_customer === null ? null : Number(p.max_per_customer),
    redemptionCount: Number(p.redemption_count ?? 0),

    internalNotes: str(p.internal_notes),
    bannerUrl: str(p.banner_url),

    isActive: Boolean(p.is_active),
    archivedAt: str(p.archived_at),

    createdByName: names.get(p.created_by as string) ?? null,
    createdAt: p.created_at as string,

    targets: targetRows.map((row) => ({
      id: row.id,
      targetKind: row.target_kind as OfferDetailTarget["targetKind"],
      targetId: row.target_id,
      name: labels.get(`${row.target_kind}:${row.target_id}`) ?? null,
    })),

    eligibilityRules: ((rules.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      ruleKind: row.rule_kind as string,
      operator: row.operator as string,
      value: row.value,
    })),

    assignments: ((assignments.data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
      const customer = row.customer as
        | { full_name: string | null; customer_number: string | null; lifecycle_status: string | null }
        | null;
      const car = row.car as { display_title: string | null } | null;

      return {
        id: row.id as string,
        customerId: row.customer_id as string,
        customerName: customer?.full_name ?? null,
        customerNumber: customer?.customer_number ?? null,
        customerStatus: customer?.lifecycle_status ?? null,
        carId: str(row.car_id),
        carTitle: car?.display_title ?? null,
        validFrom: str(row.valid_from),
        validTo: str(row.valid_to),
        discountOverrideFils: str(row.discount_override_fils),
        status: row.status as OfferAssignment["status"],
        notes: str(row.notes),
        assignedByName: names.get(row.assigned_by as string) ?? null,
        createdAt: row.created_at as string,
      };
    }),

    codes: ((codes.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      code: row.code as string,
      usageLimit: row.usage_limit === null ? null : Number(row.usage_limit),
      perCustomerLimit: row.per_customer_limit === null ? null : Number(row.per_customer_limit),
      usedCount: Number(row.used_count ?? 0),
      isActive: Boolean(row.is_active),
      createdByName: names.get(row.created_by as string) ?? null,
      createdAt: row.created_at as string,
    })),

    redemptions: redemptionRows.map((row) => {
      const customer = row.customer as
        | { full_name: string | null; customer_number: string | null }
        | null;
      const code = row.code as { code: string | null } | null;

      return {
        id: row.id as string,
        customerId: row.customer_id as string,
        customerName: customer?.full_name ?? null,
        customerNumber: customer?.customer_number ?? null,
        dealId: str(row.deal_id),
        codeId: str(row.code_id),
        code: code?.code ?? null,
        discountFils: String(row.discount_fils ?? "0"),
        status: row.status as OfferRedemption["status"],
        reversedAt: str(row.reversed_at),
        reversalReason: str(row.reversal_reason),
        redeemedByName: names.get(row.redeemed_by as string) ?? null,
        redeemedAt: row.redeemed_at as string,
        terms: (row.terms ?? {}) as Record<string, unknown>,
      };
    }),

    statusHistory: ((statusHistory.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      oldStatus: str(row.old_status),
      newStatus: row.new_status as string,
      reason: str(row.reason),
      changedByName: names.get(row.changed_by as string) ?? null,
      changedAt: row.changed_at as string,
    })),

    activity: ((activity.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      activityType: row.activity_type as string,
      fieldName: str(row.field_name),
      oldValue: str(row.old_value),
      newValue: str(row.new_value),
      description: str(row.description),
      changedByName: names.get(row.changed_by as string) ?? null,
      changedAt: row.changed_at as string,
    })),

    totals: {
      appliedCount,
      reversedCount,
      discountGivenFils: discountGiven.toString(),
    },
  };
}

/* =========================================================
   FINDING A CUSTOMER TO ASSIGN AN OFFER TO
========================================================= */

export interface AssignCustomerOption {
  id: string;
  name: string;
  customerNumber: string | null;
  lifecycleStatus: string | null;
}

export async function searchCustomersForAssignment(term: string): Promise<AssignCustomerOption[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];

  const supabase = await createClient();
  const pattern = `%${trimmed}%`;

  const { data, error } = await supabase
    .from("customer_profiles")
    .select("id, full_name, customer_number, lifecycle_status")
    .or(
      `full_name.ilike.${pattern},customer_number.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`,
    )
    .order("full_name")
    .limit(20);

  if (error) {
    console.error("searchCustomersForAssignment error:", error);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    name: (row.full_name as string | null) ?? "Unnamed",
    customerNumber: (row.customer_number as string | null) ?? null,
    lifecycleStatus: (row.lifecycle_status as string | null) ?? null,
  }));
}
