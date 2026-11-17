import Link from "next/link";
import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/src/lib/supabase/server";
import { getMySalesPermissions } from "@/src/lib/supabase/sales-permissions";
import {
  PAYMENT_QUEUE_PAGE_SIZE,
  getPaymentQueue,
  getPaymentRules,
  getPaymentSummary,
} from "@/src/lib/supabase/sales-payment-queries";
import { readParam } from "@/src/lib/utils/test-drive-list-filters";
import { PaymentsQueueClient } from "@/src/components/sales/payments/payments-queue-client";
import type { PaymentQueueTab } from "@/src/lib/types/sales-payments";

interface PaymentsPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

const TABS: PaymentQueueTab[] = ["awaiting", "verified", "closed", "all"];

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const permissions = user ? await getMySalesPermissions(supabase) : null;

  if (!user || !permissions || !(permissions.paymentsVerify || permissions.paymentsReverse)) {
    return (
      <div role="alert" className="surface-card flex max-w-2xl items-start gap-3 p-5">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
        <div>
          <p className="text-body-sm text-text-primary font-medium">You don&apos;t have permission to view the payments queue.</p>
          <p className="text-body-sm text-text-muted mt-1">
            It is for the people who verify payments. Payments on a deal are shown on the deal itself.
          </p>
          <Link href="/admin/sales" className="text-body-sm text-primary-text hover:text-primary-hover mt-3 inline-block">
            Back to Sales
          </Link>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const tabRaw = readParam(params, "tab");
  const tab: PaymentQueueTab = TABS.includes(tabRaw as PaymentQueueTab) ? (tabRaw as PaymentQueueTab) : "awaiting";
  const search = readParam(params, "q").slice(0, 100);
  const page = Math.max(1, Math.floor(Number(readParam(params, "page"))) || 1);

  const [data, summary, rules] = await Promise.all([
    getPaymentQueue({ tab, search, page }),
    getPaymentSummary(),
    getPaymentRules(),
  ]);

  // Past the last page: jump to the real last one, keeping the tab and search.
  if (data && data.totalCount > 0 && page > Math.ceil(data.totalCount / PAYMENT_QUEUE_PAGE_SIZE)) {
    const next = new URLSearchParams({ tab, page: String(Math.ceil(data.totalCount / PAYMENT_QUEUE_PAGE_SIZE)) });
    if (search) next.set("q", search);
    redirect(`/admin/sales/payments?${next.toString()}`);
  }

  return (
    <PaymentsQueueClient
      summary={summary}
      data={data}
      tab={tab}
      search={search}
      page={page}
      permissions={permissions}
      currentUserId={user.id}
      separateVerifier={rules.separateVerifier}
    />
  );
}