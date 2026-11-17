import { createClient } from "@/src/lib/supabase/server";
import { RESERVATION_COLUMNS } from "@/src/lib/supabase/reservation-queries";
import type { ReservationListRow } from "@/src/lib/types/reservations";
import type {
  CustomerDealRow,
  CustomerPaymentRow,
  CustomerSalesData,
  CustomerSalesSummary,
} from "@/src/lib/types/customer-sales";

const DEAL_COLUMNS =
  "id, deal_number, status, vehicle_title, stock_id, owner_name, currency, proposed_price, agreed_price, total_due, verified_paid, balance_due, created_at";

const PAYMENT_COLUMNS =
  "id, deal_id, deal_number, reservation_id, reservation_number, direction, kind, amount, currency, method, paid_on, status";

type Numeric = number | string | null;
const num = (value: Numeric): number | null => (value === null || value === undefined ? null : Number(value));

/**
 * A customer's deals, reservations and payments, as the signed-in person is allowed to see them.
 * The database applies the same access rules as the Sales and Reservations pages.
 */
export async function getCustomerSales(customerId: string): Promise<CustomerSalesData> {
  const supabase = await createClient();

  const [summary, deals, reservations, payments] = await Promise.all([
    supabase.rpc("get_customer_sales_summary", { p_customer_id: customerId }),
    supabase
      .from("sales_customer_deals")
      .select(DEAL_COLUMNS)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("vehicle_reservation_list")
      .select(RESERVATION_COLUMNS)
      .eq("customer_id", customerId)
      .order("requested_at", { ascending: false })
      .limit(25),
    supabase
      .from("sales_payment_list")
      .select(PAYMENT_COLUMNS)
      .eq("customer_id", customerId)
      .order("recorded_at", { ascending: false })
      .limit(10),
  ]);

  [summary.error, deals.error, reservations.error, payments.error].forEach((error) => {
    if (error) console.error("getCustomerSales error:", error);
  });

  const summaryRow = (Array.isArray(summary.data) ? summary.data[0] : summary.data) as
    | Record<string, Numeric | string>
    | undefined;

  return {
    summary:
      summary.error || !summaryRow
        ? null
        : ({
            openDeals: Number(summaryRow.open_deals ?? 0),
            completedDeals: Number(summaryRow.completed_deals ?? 0),
            cancelledDeals: Number(summaryRow.cancelled_deals ?? 0),
            purchasedTotal: Number(summaryRow.purchased_total ?? 0),
            balanceOpen: Number(summaryRow.balance_open ?? 0),
            activeReservations: Number(summaryRow.active_reservations ?? 0),
            lastDealAt: (summaryRow.last_deal_at as string | null) ?? null,
            currency: String(summaryRow.currency ?? ""),
          } satisfies CustomerSalesSummary),
    deals: deals.error
      ? null
      : ((deals.data ?? []) as unknown as Record<string, Numeric | string>[]).map(
          (row) =>
            ({
              ...row,
              proposed_price: num(row.proposed_price as Numeric),
              agreed_price: num(row.agreed_price as Numeric),
              total_due: num(row.total_due as Numeric),
              verified_paid: num(row.verified_paid as Numeric),
              balance_due: num(row.balance_due as Numeric),
            }) as unknown as CustomerDealRow,
        ),
    reservations: reservations.error
      ? null
      : ((reservations.data ?? []) as unknown as ReservationListRow[]),
    payments: payments.error
      ? null
      : ((payments.data ?? []) as unknown as Record<string, Numeric | string>[]).map(
          (row) => ({ ...row, amount: Number(row.amount) }) as unknown as CustomerPaymentRow,
        ),
  };
}