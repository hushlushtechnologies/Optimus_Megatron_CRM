import { createClient } from "@/src/lib/supabase/server";
import { SALES_LIST_COLUMNS } from "@/src/lib/supabase/sales-list-queries";
import { FINAL_DEAL_STATUSES, type SalesDealStatus } from "@/src/lib/types/sales";
import type { SalesListRow } from "@/src/lib/types/sales-list";
import type { VehicleDealContext } from "@/src/lib/types/sales-deal-form";
import type {
  DealActivityItem,
  DealPayment,
  DealPriceChange,
  DealReservation,
  DealStatusChange,
  SalesDealDetail,
  SalesDealDetailResult,
} from "@/src/lib/types/sales-detail";

interface BaseExtras {
  fees_amount: number | string;
  tax_amount: number | string;
  price_approved_by: string | null;
  price_approved_at: string | null;
  notes: string | null;
  reserved_at: string | null;
  confirmed_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancellation_refund_note: string | null;
  created_by: string | null;
}

interface ReservationRow {
  id: string;
  reservation_number: string;
  status: string;
  source: string;
  starts_at: string | null;
  expires_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  closed_reason: string | null;
}

type PaymentRow = Omit<DealPayment, "recorded_by_name" | "verified_by_name" | "reversed_by_name" | "amount"> & {
  amount: number | string;
  recorded_by: string | null;
  verified_by: string | null;
  reversed_by: string | null;
};

type PriceRow = Omit<DealPriceChange, "approved_by_name" | "changed_by_name"> & {
  approved_by: string | null;
  changed_by: string | null;
};

type StatusRow = Omit<DealStatusChange, "changed_by_name"> & { changed_by: string | null };

interface ActivityRow {
  id: string;
  activity_type: string;
  description: string;
  changed_by: string | null;
  changed_at: string;
}

interface AssignmentRow {
  changed_by: string | null;
  changed_at: string;
}

interface ContextRow {
  holder_status: "Reserved" | "Confirmed" | "Completed" | null;
  holder_deal_number: string | null;
  open_deals: number | string | null;
  reservation_number: string | null;
  reservation_expires_at: string | null;
  customer_open_deal_number: string | null;
  lead_deal_number: string | null;
  listed_price: number | string | null;
}

const num = (value: number | string | null | undefined) => Number(value ?? 0);
const numOrNull = (value: number | string | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

/**
 * Everything the deal page shows, in a few parallel queries. A failure to load the deal itself is
 * an "error" (never a fake "not found"). A failure to load one of the lists only blanks that list,
 * so the rest of the page still works and the gap is visible instead of looking like "no history".
 * The caller must pass a real UUID.
 */
export async function getSalesDealDetail(id: string): Promise<SalesDealDetailResult> {
  const supabase = await createClient();

  const [viewResult, baseResult, settingsResult] = await Promise.all([
    supabase.from("sales_deal_list").select(`${SALES_LIST_COLUMNS}, customer_phone`).eq("id", id).maybeSingle(),
    supabase
      .from("sales_deals")
      .select(
        "fees_amount, tax_amount, price_approved_by, price_approved_at, notes, reserved_at, confirmed_at, delivered_at, completed_at, cancelled_at, cancellation_reason, cancellation_refund_note, created_by",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("sales_settings")
      .select("discount_auto_approve_percent, confirm_min_deposit_percent, currency")
      .maybeSingle(),
  ]);

  if (viewResult.error || baseResult.error || settingsResult.error || !settingsResult.data) {
    console.error("getSalesDealDetail error:", viewResult.error ?? baseResult.error ?? settingsResult.error);
    return { status: "error" };
  }
  if (!viewResult.data || !baseResult.data) return { status: "not_found" };

  const row = viewResult.data as unknown as SalesListRow & { customer_phone: string | null };
  const base = baseResult.data as unknown as BaseExtras;
  const reservationId = row.reservation_id;
  const isFinished = FINAL_DEAL_STATUSES.includes(row.status as SalesDealStatus);

  let activityQuery = supabase
    .from("sales_activity")
    .select("id, activity_type, description, changed_by, changed_at")
    .order("changed_at", { ascending: false })
    .limit(200);
  activityQuery = reservationId
    ? activityQuery.or(`deal_id.eq.${id},reservation_id.eq.${reservationId}`)
    : activityQuery.eq("deal_id", id);

  const [reservationResult, paymentsResult, priceResult, statusResult, activityResult, assignmentResult, contextResult] =
    await Promise.all([
      reservationId
        ? supabase
            .from("vehicle_reservations")
            .select("id, reservation_number, status, source, starts_at, expires_at, confirmed_at, confirmed_by, closed_reason")
            .eq("id", reservationId)
            .maybeSingle()
        : Promise.resolve(null),
      supabase
        .from("sales_payments")
        .select(
          "id, kind, direction, amount, currency, method, reference, paid_on, status, status_reason, recorded_by, recorded_at, verified_by, verified_at, reversed_by, reversed_at",
        )
        .eq("deal_id", id)
        .order("recorded_at", { ascending: false })
        .limit(200),
      supabase
        .from("sales_deal_price_history")
        .select(
                   "id, listed_price, proposed_price, discount_amount, fees_amount, tax_amount, agreed_price, approved_by, changed_by, changed_at, note",
        )
        .eq("deal_id", id)
        .order("changed_at", { ascending: false })
        .limit(50),
      supabase
        .from("sales_deal_status_history")
        .select("id, old_status, new_status, reason, changed_by, changed_at")
        .eq("deal_id", id)
        .order("changed_at", { ascending: false })
        .limit(100),
      activityQuery,
      supabase
        .from("sales_deal_assignments")
        .select("changed_by, changed_at")
        .eq("deal_id", id)
        .order("changed_at", { ascending: false })
        .limit(1),
      isFinished
        ? Promise.resolve(null)
        : supabase.rpc("get_vehicle_deal_context", { p_car_id: row.car_id, p_customer_id: null, p_lead_id: null }),
    ]);

  [reservationResult, paymentsResult, priceResult, statusResult, activityResult, assignmentResult, contextResult].forEach(
    (result) => {
      if (result?.error) console.error("getSalesDealDetail list error:", result.error);
    },
  );

  const reservationRow = reservationResult?.error
    ? null
    : ((reservationResult?.data ?? null) as unknown as ReservationRow | null);
  const payments = paymentsResult.error ? null : ((paymentsResult.data ?? []) as unknown as PaymentRow[]);
  const prices = priceResult.error ? null : ((priceResult.data ?? []) as unknown as PriceRow[]);
  const statuses = statusResult.error ? null : ((statusResult.data ?? []) as unknown as StatusRow[]);
  const activities = activityResult.error ? null : ((activityResult.data ?? []) as unknown as ActivityRow[]);
  const assignment = assignmentResult.error
    ? null
    : (((assignmentResult.data ?? []) as unknown as AssignmentRow[])[0] ?? null);

  // Names for every person mentioned, in one round.
  const userIds = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (value) userIds.add(value);
  };
  add(base.price_approved_by);
  add(base.created_by);
  add(reservationRow?.confirmed_by);
  add(assignment?.changed_by);
  payments?.forEach((p) => {
    add(p.recorded_by);
    add(p.verified_by);
    add(p.reversed_by);
  });
  prices?.forEach((p) => {
    add(p.approved_by);
    add(p.changed_by);
  });
  statuses?.forEach((s) => add(s.changed_by));
  activities?.forEach((a) => add(a.changed_by));

  const { data: profiles, error: profilesError } = userIds.size
    ? await supabase.from("profiles").select("id, full_name").in("id", Array.from(userIds))
    : { data: [] as { id: string; full_name: string | null }[], error: null };
  if (profilesError) console.error("getSalesDealDetail names error:", profilesError);

  const personName = (userId: string | null | undefined): string =>
    userId ? (profiles?.find((p) => p.id === userId)?.full_name ?? "Unknown") : "System";

  const deal: SalesDealDetail = {
    ...row,
    customer_phone: row.customer_phone ?? null,
    fees_amount: num(base.fees_amount),
    tax_amount: num(base.tax_amount),
    price_approved_by_name: base.price_approved_by ? personName(base.price_approved_by) : null,
    price_approved_at: base.price_approved_at,
    notes: base.notes,
    reserved_at: base.reserved_at,
    confirmed_at: base.confirmed_at,
    delivered_at: base.delivered_at,
    completed_at: base.completed_at,
    cancelled_at: base.cancelled_at,
    cancellation_reason: base.cancellation_reason,
    cancellation_refund_note: base.cancellation_refund_note,
    created_by_name: base.created_by ? personName(base.created_by) : null,
  };

  const reservation: DealReservation | null = reservationRow
    ? {
        id: reservationRow.id,
        reservation_number: reservationRow.reservation_number,
        status: reservationRow.status,
        source: reservationRow.source,
        starts_at: reservationRow.starts_at,
        expires_at: reservationRow.expires_at,
        confirmed_at: reservationRow.confirmed_at,
        confirmed_by_name: reservationRow.confirmed_by ? personName(reservationRow.confirmed_by) : null,
        closed_reason: reservationRow.closed_reason,
      }
    : null;

  const contextRaw = contextResult?.error
    ? null
    : ((Array.isArray(contextResult?.data) ? contextResult?.data[0] : contextResult?.data) as ContextRow | undefined);

  const vehicleContext: VehicleDealContext | null = contextRaw
    ? {
        holderStatus: contextRaw.holder_status,
        holderDealNumber: contextRaw.holder_deal_number,
        openDeals: num(contextRaw.open_deals),
        reservationNumber: contextRaw.reservation_number,
        reservationExpiresAt: contextRaw.reservation_expires_at,
        customerOpenDealNumber: contextRaw.customer_open_deal_number,
        leadDealNumber: contextRaw.lead_deal_number,
        listedPrice: numOrNull(contextRaw.listed_price),
      }
    : null;

  return {
    status: "ok",
    data: {
      deal,
      reservation,
      payments: payments
        ? payments.map((p) => ({
            id: p.id,
            kind: p.kind,
            direction: p.direction,
            amount: num(p.amount),
            currency: p.currency,
            method: p.method,
            reference: p.reference,
            paid_on: p.paid_on,
            status: p.status,
            status_reason: p.status_reason,
            recorded_by_name: personName(p.recorded_by),
                        recorded_by: p.recorded_by,
            recorded_at: p.recorded_at,
            verified_by_name: p.verified_by ? personName(p.verified_by) : null,
            verified_at: p.verified_at,
            reversed_by_name: p.reversed_by ? personName(p.reversed_by) : null,
            reversed_at: p.reversed_at,
          }))
        : null,
      priceHistory: prices
        ? prices.map((p) => ({
            id: p.id,
            listed_price: numOrNull(p.listed_price),
            proposed_price: numOrNull(p.proposed_price),
            discount_amount: num(p.discount_amount),
            fees_amount: num(p.fees_amount),
            tax_amount: num(p.tax_amount),
            agreed_price: numOrNull(p.agreed_price),
            approved_by_name: p.approved_by ? personName(p.approved_by) : null,
            changed_by_name: personName(p.changed_by),
            changed_at: p.changed_at,
            note: p.note,
          }))
        : null,
      statusChanges: statuses
        ? statuses.map((s) => ({
            id: s.id,
            old_status: s.old_status,
            new_status: s.new_status,
            reason: s.reason,
            changed_by_name: personName(s.changed_by),
            changed_at: s.changed_at,
          }))
        : null,
      timeline: activities
        ? activities.map((a) => ({
            id: a.id,
            activity_type: a.activity_type,
            description: a.description,
            changedByName: personName(a.changed_by),
            changed_at: a.changed_at,
          }))
        : null,
      assignedBy: assignment
        ? { name: assignment.changed_by ? personName(assignment.changed_by) : null, at: assignment.changed_at }
        : null,
      vehicleContext,
      settings: {
        autoApprovePercent: Number(settingsResult.data.discount_auto_approve_percent),
        minDepositPercent: Number(settingsResult.data.confirm_min_deposit_percent),
        currency: settingsResult.data.currency as string,
      },
    },
  };
}