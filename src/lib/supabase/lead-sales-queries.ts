import { createClient } from "@/src/lib/supabase/server";
import { FINAL_DEAL_STATUSES, type SalesDealStatus } from "@/src/lib/types/sales";
import { isUuid } from "@/src/lib/utils/search-term";
import type { LeadDealRow, LeadSalesData, LinkableDealOption } from "@/src/lib/types/lead-sales";

/*
|--------------------------------------------------------------------------
| LEAD ↔ SALES READS
|--------------------------------------------------------------------------
|
| Both queries read sales_deal_list, the same view the Sales page uses, so
| row-level security decides what the signed-in person may see and the two
| screens can never disagree.
|
| No migration is needed for these: sales_deals.lead_id and the view's
| lead_id column already existed before Phase 15.
*/

const LEAD_DEAL_COLUMNS = [
  "id",
  "deal_number",
  "status",
  "vehicle_title",
  "stock_id",
  "car_id",
  "owner_name",
  "location_name",
  "currency",
  "proposed_price",
  "agreed_price",
  "total_due",
  "verified_paid",
  "balance_due",
  "reservation_id",
  "reservation_number",
  "reservation_status",
  "reservation_expires_at",
  "created_at",
].join(", ");

const LINKABLE_DEAL_COLUMNS =
  "id, deal_number, status, vehicle_title, stock_id, car_id, owner_name, created_at, lead_id";

type Numeric = number | string | null;
const num = (value: Numeric): number | null => (value === null || value === undefined ? null : Number(value));

const EMPTY: LeadSalesData = { deals: null, hasActiveDeal: false, activeDealNumber: null };

/** Every deal linked to this lead, newest first, with the open one flagged. */
export async function getLeadSales(leadId: string): Promise<LeadSalesData> {
  if (!isUuid(leadId)) return EMPTY;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_deal_list")
    .select(LEAD_DEAL_COLUMNS)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("getLeadSales error:", error);
    return EMPTY;
  }

  const deals = ((data ?? []) as unknown as Record<string, Numeric | string>[]).map(
    (row) =>
      ({
        ...row,
        proposed_price: num(row.proposed_price as Numeric),
        agreed_price: num(row.agreed_price as Numeric),
        total_due: num(row.total_due as Numeric),
        verified_paid: num(row.verified_paid as Numeric),
        balance_due: num(row.balance_due as Numeric),
      }) as unknown as LeadDealRow,
  );

  // Completed and Cancelled are finished. Anything else still holds this lead.
  const active = deals.find((deal) => !FINAL_DEAL_STATUSES.includes(deal.status as SalesDealStatus));

  return {
    deals,
    hasActiveDeal: !!active,
    activeDealNumber: active?.deal_number ?? null,
  };
}

/**
 * Deals of this lead's customer that could be linked to it.
 *
 * Only unlinked deals are offered: a deal already attached to another lead is
 * never silently moved, because that would rewrite the other lead's history.
 * Returns null when the lookup failed.
 */
export async function getLinkableDealsForLead(
  leadId: string,
  customerId: string,
): Promise<LinkableDealOption[] | null> {
  if (!isUuid(leadId) || !isUuid(customerId)) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_deal_list")
    .select(LINKABLE_DEAL_COLUMNS)
    .eq("customer_id", customerId)
    .is("lead_id", null)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("getLinkableDealsForLead error:", error);
    return null;
  }

  return ((data ?? []) as unknown as (LinkableDealOption & { lead_id: string | null })[]).map((row) => ({
    id: row.id,
    deal_number: row.deal_number,
    status: row.status,
    vehicle_title: row.vehicle_title,
    stock_id: row.stock_id,
    car_id: row.car_id,
    owner_name: row.owner_name,
    created_at: row.created_at,
  }));
}