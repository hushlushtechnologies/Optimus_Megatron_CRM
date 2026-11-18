"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft, XCircle } from "lucide-react";
import { Tabs, TabsList, Tab, TabPanel } from "@/src/components/ui/tabs";
import { DealHeader } from "@/src/components/sales/detail/deal-header";
import { DealReadinessCard } from "@/src/components/sales/detail/deal-readiness-card";
import { DealCustomerCard, DealVehicleCard } from "@/src/components/sales/detail/deal-party-cards";
import { DealInfoCard, DealNotesCard } from "@/src/components/sales/detail/deal-info-card";
import { DealPricingTab } from "@/src/components/sales/detail/deal-pricing-tab";
import { DealPaymentsTab } from "@/src/components/sales/detail/deal-payments-tab";
import { DealTimeline } from "@/src/components/sales/detail/deal-timeline";
import { DealActionBar } from "@/src/components/sales/actions/deal-action-bar";
import { useDealActions } from "@/src/components/sales/actions/use-deal-actions";
import { useMinuteClock } from "@/src/hooks/use-minute-clock";
import { useMotion } from "@/src/hooks/use-motion";
import { computeReadiness, describeDealVehicleContext, holdConflictFor } from "@/src/lib/utils/sales-readiness";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type { SalesDealStatus } from "@/src/lib/types/sales";
import type { SalesDealDetailData } from "@/src/lib/types/sales-detail";
import type { SalesPermissions } from "@/src/lib/utils/sales-permissions";
import type { PricingExtras } from "@/src/lib/types/sales-pricing";
import { DealOwnerCard } from "@/src/components/sales/owner/deal-owner-card";
import type { AssignmentHistoryItem } from "@/src/lib/types/sales-owner";
import { DealDocumentsTab } from "@/src/components/sales/detail/deal-documents-tab";
import type { SalesDocumentItem } from "@/src/lib/types/sales-documents";
import { DealDeliveryTab } from "@/src/components/sales/detail/deal-delivery-tab";
import type { DealDeliveryResult, DeliveryLookups } from "@/src/lib/types/sales-delivery";
import { DealTestDrivesCard } from "@/src/components/sales/detail/deal-test-drives-card";
import { DealNotesPanel } from "@/src/components/sales/detail/deal-notes-panel";
import { DealAuditTab } from "@/src/components/sales/detail/deal-audit-tab";
import type { TestDrivePanelLoad } from "@/src/lib/types/test-drive";
import type { DealNotesData } from "@/src/lib/types/sales-notes";

interface SalesDetailClientProps {
  data: SalesDealDetailData;
  permissions: SalesPermissions;
  pricingExtras: PricingExtras;
    assignments: AssignmentHistoryItem[] | null;
  currentUserId: string | null;
  separateVerifier: boolean | null;
  documents: SalesDocumentItem[] | null;
      delivery: DealDeliveryResult;
  deliveryLookups: DeliveryLookups | null;
  /** This customer's test drives of this vehicle. */
  testDrives: TestDrivePanelLoad;
  /** The drive this deal was created from, when it was. */
    /** The drive this deal was created from, when it was. */
  sourceTestDriveNumber: string | null;
  notes: DealNotesData;
}
export function SalesDetailClient({
  data,
  permissions,
  pricingExtras,
  assignments,
  currentUserId,
  separateVerifier,
  documents,
    delivery, 
  deliveryLookups,
    testDrives,
  sourceTestDriveNumber,
  notes,
}: SalesDetailClientProps) {
  const { deal, statusChanges } = data;
  const { fadeUp } = useMotion();
  const now = useMinuteClock();

  const readiness = useMemo(() => computeReadiness(deal, data.settings, now), [deal, data.settings, now]);
  const vehicleMessages = useMemo(
    () => describeDealVehicleContext(deal, data.vehicleContext),
    [deal, data.vehicleContext],
  );
  const holdConflict = useMemo(() => holdConflictFor(deal, data.vehicleContext), [deal, data.vehicleContext]);

    const canReserve =
    deal.status === "Negotiation" &&
    !!deal.reservation_id &&
    deal.reservation_status === "Confirmed" &&
    (now === 0 || !deal.reservation_expires_at || Date.parse(deal.reservation_expires_at) > now);

  const actions = useDealActions({ deal, readiness, holdConflict });

  // Where a cancelled deal stopped, and which steps it went through.
  const cancelEntry = statusChanges?.find((change) => change.new_status === "Cancelled") ?? null;
  const stoppedAt: SalesDealStatus | null = cancelEntry?.old_status ?? null;
  const visited = useMemo(
    () => (statusChanges ? new Set<SalesDealStatus>(statusChanges.map((change) => change.new_status)) : null),
    [statusChanges],
  );

  const paymentCount = data.payments?.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/sales"
        className="text-body-sm text-text-muted hover:text-text-primary focus-visible:ring-primary inline-flex min-h-11 items-center gap-1.5 self-start rounded focus-visible:ring-2 focus-visible:outline-none sm:min-h-0"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Sales
      </Link>

      <DealHeader
        deal={deal}
        stoppedAt={stoppedAt}
        visited={visited}
                actions={
          <DealActionBar
            status={deal.status}
            permissions={permissions}
            canReserve={canReserve}
            onRequest={actions.request}
          />
        }
      />

      {deal.status === "Cancelled" && (
        <motion.section
          {...fadeUp(1)}
          role="status"
          className="flex items-start gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3"
        >
          <XCircle className="mt-0.5 size-5 shrink-0 text-red-400" aria-hidden="true" />
          <div className="text-body-sm text-text-primary">
            <p className="font-medium">
              This deal was cancelled
              {deal.cancelled_at ? ` on ${formatDateTimeFull(deal.cancelled_at)}` : ""}
              {cancelEntry ? ` by ${cancelEntry.changed_by_name}` : ""}.
            </p>
            {deal.cancellation_reason && <p className="text-text-muted mt-0.5">Reason: {deal.cancellation_reason}</p>}
            {deal.cancellation_refund_note && (
              <p className="text-text-muted mt-0.5">Payments: {deal.cancellation_refund_note}</p>
            )}
          </div>
        </motion.section>
      )}

      <Tabs defaultTab="overview">
        <TabsList>
          <Tab id="overview">Overview</Tab>
          <Tab id="pricing">Pricing</Tab>
          <Tab id="payments">
            Payments
            {paymentCount > 0 && (
              <span className="bg-primary/10 text-primary ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                {paymentCount}
              </span>
            )}
          </Tab>
                    <Tab id="documents">
            Documents
            {documents && documents.length > 0 && (
              <span className="bg-primary/10 text-primary ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                {documents.length}
              </span>
            )}
          </Tab>
                    <Tab id="delivery">Delivery</Tab>
                    <Tab id="notes">
            Notes
            {notes.notes && notes.notes.length > 0 && (
              <span className="bg-primary/10 text-primary ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                {notes.notes.length}
              </span>
            )}
          </Tab>
          <Tab id="activity">Activity</Tab>
          <Tab id="audit">Audit</Tab>
        </TabsList>

        <TabPanel id="overview">
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_360px]">
            <div className="flex flex-col gap-6">
              <DealReadinessCard groups={readiness} />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <DealCustomerCard deal={deal} />
                <DealVehicleCard deal={deal} messages={vehicleMessages} />
              </div>
                            <DealNotesCard notes={deal.notes} />

              <DealTestDrivesCard
                load={testDrives}
                sourceTestDriveNumber={sourceTestDriveNumber}
                customerName={deal.customer_name}
              />
            </div>
                        <div className="flex flex-col gap-6">
              <DealOwnerCard
                deal={deal}
                assignments={assignments}
                permissions={permissions}
                currentUserId={currentUserId}
              />
              <DealInfoCard deal={deal} reservation={data.reservation} assignedBy={data.assignedBy} />
            </div>
          </div>
        </TabPanel>

        <TabPanel id="pricing">
                    <DealPricingTab
            deal={deal}
            settings={data.settings}
            history={data.priceHistory}
            extras={pricingExtras}
            permissions={permissions}
          />
        </TabPanel>

        <TabPanel id="payments">
                    <DealPaymentsTab
            deal={deal}
            payments={data.payments}
            permissions={permissions}
            currentUserId={currentUserId}
            separateVerifier={separateVerifier}
          />
        </TabPanel>

                <TabPanel id="documents">
          <DealDocumentsTab deal={deal} documents={documents} permissions={permissions} />
        </TabPanel>

        <TabPanel id="delivery">
          <DealDeliveryTab deal={deal} result={delivery} lookups={deliveryLookups} permissions={permissions} />
        </TabPanel>
        <TabPanel id="notes">
          <DealNotesPanel dealId={deal.id} data={notes} />
        </TabPanel>
        <TabPanel id="activity">
          <section aria-label="Activity" className="surface-card p-5">
            {data.timeline === null ? (
              <p
                role="alert"
                className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
              >
                The activity couldn&apos;t be loaded. Refresh the page to try again.
              </p>
            ) : (
              <DealTimeline entries={data.timeline} />
            )}
          </section>
        </TabPanel>
        <TabPanel id="audit">
          <DealAuditTab
            statusChanges={data.statusChanges}
            priceHistory={data.priceHistory}
            payments={data.payments}
            documents={documents}
            assignments={assignments}
            timeline={data.timeline}
            currency={deal.currency}
          />
        </TabPanel>
      </Tabs>

      {actions.dialogs}
    </div>
  );
}