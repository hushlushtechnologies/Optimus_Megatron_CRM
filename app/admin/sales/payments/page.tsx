import Link from "next/link";
import { redirect } from "next/navigation";

import { TriangleAlert } from "lucide-react";

import {
  getPaymentQueue,
  getPaymentRecorders,
  getPaymentRules,
  getPaymentSummary,
} from "@/src/lib/supabase/sales-payment-queries";
import { getMySalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { createClient } from "@/src/lib/supabase/server";

import { PAYMENT_QUEUE_PAGE_SIZE } from "@/src/lib/constants/sales-payments";
import {
  parsePaymentFilters,
  parsePaymentSort,
  writePaymentFiltersToParams,
} from "@/src/lib/utils/payment-queue-filters";
import { readParam } from "@/src/lib/utils/test-drive-list-filters";

import { PaymentsQueueClient } from "@/src/components/sales/payments/payments-queue-client";

import type { PaymentQueueTab } from "@/src/lib/types/sales-payments";

/* =========================================================
   TYPES
========================================================= */

interface PaymentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/* =========================================================
   CONSTANTS
========================================================= */

const TABS: PaymentQueueTab[] = ["awaiting", "verified", "closed", "all"];

/* =========================================================
   PAGE
========================================================= */

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const permissions = user ? await getMySalesPermissions(supabase) : null;

  /* =======================================================
     PERMISSION CHECK
  ======================================================= */

  if (!user || !permissions || !(permissions.paymentsVerify || permissions.paymentsReverse)) {
    return (
      <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />

        <div>
          <p className="text-body-sm text-text-primary font-medium">
            You don&apos;t have permission to view the payments queue.
          </p>

          <p className="text-body-sm text-text-muted mt-1">
            It is for the people who verify payments. Payments on a deal are shown on the deal itself.
          </p>

          <Link
            href="/admin/sales"
            className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block"
          >
            Back to Sales
          </Link>
        </div>
      </div>
    );
  }

  /* =======================================================
     QUERY PARAMS
  ======================================================= */

  const params = await searchParams;

  const tabRaw = readParam(params, "tab");
  const tab: PaymentQueueTab = TABS.includes(tabRaw as PaymentQueueTab)
    ? (tabRaw as PaymentQueueTab)
    : "awaiting";

  const search = readParam(params, "q").slice(0, 100);

  const page = Math.max(1, Math.floor(Number(readParam(params, "page"))) || 1);

  const filters = parsePaymentFilters(params);
  const sort = parsePaymentSort(readParam(params, "sort"), tab === "awaiting");

  /* =======================================================
     DATA
  ======================================================= */

  const [data, summary, rules, recorders] = await Promise.all([
    getPaymentQueue({ tab, search, page, filters, sort }),
    getPaymentSummary(),
    getPaymentRules(),
    getPaymentRecorders(),
  ]);

  /* =======================================================
     INVALID PAGE REDIRECT

     A filter that shrinks the result set can leave someone on page 7 of 3.
     Rather than show an empty list, send them to the last real page and keep
     everything else about their view intact.
  ======================================================= */

  if (data && data.totalCount > 0) {
    const lastPage = Math.ceil(data.totalCount / PAYMENT_QUEUE_PAGE_SIZE);

    if (page > lastPage) {
      const next = new URLSearchParams({ tab, page: String(lastPage), sort: sort.id });
      if (search) next.set("q", search);
      writePaymentFiltersToParams(next, filters);

      redirect(`/admin/sales/payments?${next.toString()}`);
    }
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <PaymentsQueueClient
      summary={summary}
      data={data}
      tab={tab}
      search={search}
      page={page}
      filters={filters}
      sortId={sort.id}
      recorders={recorders}
      permissions={permissions}
      currentUserId={user.id}
      separateVerifier={rules.separateVerifier}
    />
  );
}
