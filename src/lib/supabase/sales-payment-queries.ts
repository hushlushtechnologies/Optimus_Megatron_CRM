import "server-only";

import { createClient } from "@/src/lib/supabase/server";

import {
  PAYMENT_QUEUE_PAGE_SIZE,
} from "@/src/lib/constants/sales-payments";

import {
  cleanSearchTerm,
} from "@/src/lib/utils/test-drive-list-filters";

import type {
  DealPayment,
} from "@/src/lib/types/sales-detail";

import type {
  PaymentQueueRow,
  PaymentQueueTab,
  PaymentRules,
  PaymentSummary,
} from "@/src/lib/types/sales-payments";

/* =========================================================
   TYPES
========================================================= */

type PaymentRow =
  Omit<DealPayment, "amount"> & {
    amount: number | string;
  };

/* =========================================================
   COLUMNS
========================================================= */

const PAYMENT_COLUMNS =
  "id, kind, direction, amount, currency, method, reference, paid_on, status, status_reason, recorded_by, recorded_by_name, recorded_at, verified_by_name, verified_at, reversed_by_name, reversed_at";

const QUEUE_COLUMNS =
  `${PAYMENT_COLUMNS}, notes, deal_id, deal_number, reservation_id, reservation_number, customer_id, customer_name, customer_number, vehicle_title, stock_id`;

/* =========================================================
   PAYMENT RULES
========================================================= */

/**
 * The payment rules the screens need.
 *
 * null values mean the rule couldn't be loaded.
 */
export async function getPaymentRules():
  Promise<PaymentRules> {
  const supabase =
    await createClient();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "sales_settings"
      )
      .select(
        "payments_require_separate_verifier"
      )
      .maybeSingle();

  if (
    error ||
    !data
  ) {
    if (error) {
      console.error(
        "getPaymentRules error:",
        error
      );
    }

    return {
      separateVerifier:
        null,
    };
  }

  const settings =
    data as {
      payments_require_separate_verifier:
        boolean;
    };

  return {
    separateVerifier:
      Boolean(
        settings
          .payments_require_separate_verifier
      ),
  };
}

/* =========================================================
   RESERVATION PAYMENTS
========================================================= */

/**
 * Deposits and refunds for one reservation,
 * newest first.
 *
 * null means the list couldn't be loaded.
 */
export async function getReservationPayments(
  reservationId: string
): Promise<
  DealPayment[] | null
> {
  const supabase =
    await createClient();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "sales_payment_list"
      )
      .select(
        PAYMENT_COLUMNS
      )
      .eq(
        "reservation_id",
        reservationId
      )
      .order(
        "recorded_at",
        {
          ascending:
            false,
        }
      )
      .limit(100);

  if (error) {
    console.error(
      "getReservationPayments error:",
      error
    );

    return null;
  }

  const rows =
    (
      data ?? []
    ) as unknown as PaymentRow[];

  return rows.map(
    (row) => ({
      ...row,

      amount:
        Number(
          row.amount
        ),
    })
  );
}

/* =========================================================
   PAYMENT SUMMARY
========================================================= */

export async function getPaymentSummary():
  Promise<
    PaymentSummary | null
  > {
  const supabase =
    await createClient();

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_payment_summary"
    );

  if (error) {
    console.error(
      "getPaymentSummary error:",
      error
    );

    return null;
  }

  const row =
    (
      Array.isArray(
        data
      )
        ? data[0]
        : data
    ) as
      | Record<
          string,
          number | string | null
        >
      | undefined;

  if (!row) {
    return null;
  }

  const num = (
    value:
      | number
      | string
      | null
      | undefined
  ) =>
    Number(
      value ?? 0
    );

  return {
    awaitingCount:
      num(
        row.awaiting_count
      ),

    awaitingAmount:
      num(
        row.awaiting_amount
      ),

    verifiedMonth:
      num(
        row.verified_month
      ),

    refundsAwaiting:
      num(
        row.refunds_awaiting
      ),

    closed30d:
      num(
        row.closed_30d
      ),
  };
}

/* =========================================================
   PAYMENT QUEUE
========================================================= */

export async function getPaymentQueue(
  params: {
    tab:
      PaymentQueueTab;

    search:
      string;

    page:
      number;
  }
): Promise<
  {
    rows:
      PaymentQueueRow[];

    totalCount:
      number;
  } | null
> {
  const supabase =
    await createClient();

  const from =
    (
      params.page -
      1
    ) *
    PAYMENT_QUEUE_PAGE_SIZE;

  let query =
    supabase
      .from(
        "sales_payment_list"
      )
      .select(
        QUEUE_COLUMNS,
        {
          count:
            "exact",
        }
      );

  /* =======================================================
     TAB FILTER
  ======================================================= */

  if (
    params.tab ===
    "awaiting"
  ) {
    query =
      query.eq(
        "status",
        "Recorded"
      );
  } else if (
    params.tab ===
    "verified"
  ) {
    query =
      query.eq(
        "status",
        "Verified"
      );
  } else if (
    params.tab ===
    "closed"
  ) {
    query =
      query.in(
        "status",
        [
          "Rejected",
          "Reversed",
        ]
      );
  }

  /* =======================================================
     SEARCH
  ======================================================= */

  const term =
    cleanSearchTerm(
      params.search
    );

  if (term) {
    const like =
      `%${term}%`;

    query =
      query.or(
        [
          `deal_number.ilike."${like}"`,
          `reservation_number.ilike."${like}"`,
          `reference.ilike."${like}"`,
          `customer_name.ilike."${like}"`,
          `customer_number.ilike."${like}"`,
        ].join(",")
      );
  }

  /*
   * The longest-waiting payment comes first
   * in the verification queue.
   *
   * Everything else is newest first.
   */
  const oldestFirst =
    params.tab ===
    "awaiting";

  const {
    data,
    error,
    count,
  } =
    await query
      .order(
        "recorded_at",
        {
          ascending:
            oldestFirst,
        }
      )
      .order(
        "id",
        {
          ascending:
            true,
        }
      )
      .range(
        from,
        from +
          PAYMENT_QUEUE_PAGE_SIZE -
          1
      );

  if (error) {
    console.error(
      "getPaymentQueue error:",
      error
    );

    return null;
  }

  const rows =
    (
      (
        data ?? []
      ) as unknown as (
        Omit<
          PaymentQueueRow,
          "amount"
        > & {
          amount:
            number | string;
        }
      )[]
    ).map(
      (row) => ({
        ...row,

        amount:
          Number(
            row.amount
          ),
      })
    );

  return {
    rows,

    totalCount:
      count ?? 0,
  };
}