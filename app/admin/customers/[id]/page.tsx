import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowUpRight, Heart, Landmark, MailQuestion, Repeat, Sparkles } from "lucide-react";

import {
  getCustomerDetail,
  getCustomerAuthStatus,
  getCustomerTags,
} from "@/src/lib/supabase/customer-detail-queries";

import { getCustomerFilterLookups } from "@/src/lib/supabase/customer-lookups";
import { getMyCustomerAdminRights } from "@/app/admin/customers/[id]/admin-actions";

import { Tabs, TabsList, Tab, TabPanel } from "@/src/components/ui/tabs";

import { CustomerDetailHeader } from "@/src/components/customers/customer-detail-header";

import { CustomerContactCard } from "@/src/components/customers/customer-contact-card";

import { AccountManagementCard } from "@/src/components/customers/account-management-card";

import { RelationshipManagerCard } from "@/src/components/customers/relationship-manager-card";

import { OverviewTab } from "@/src/components/customers/profile-tabs/overview-tab";

import { NotesTab } from "@/src/components/customers/profile-tabs/notes-tab";

import { ActivityTab } from "@/src/components/customers/profile-tabs/activity-tab";

import { AuditTrailTab } from "@/src/components/customers/profile-tabs/audit-trail-tab";

import { FutureModuleTab } from "@/src/components/customers/profile-tabs/future-module-tab";
import { CommunicationsTab } from "@/src/components/customers/profile-tabs/communications-tab";

import { VehiclesTab } from "@/src/components/customers/profile-tabs/vehicles-tab";
import { CustomerTestDrivesTab } from "@/src/components/customers/profile-tabs/customer-test-drives-tab";
import { CustomerReservationsTab } from "@/src/components/customers/profile-tabs/customer-reservations-tab";

/* =========================================================
   TYPES
========================================================= */

interface CustomerDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

/* =========================================================
   PAGE
========================================================= */

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params;

  /* =========================================================
     CUSTOMER
  ========================================================= */

  const customer = await getCustomerDetail(id);

  if (!customer) {
    notFound();
  }

  /* =========================================================
     RELATED DATA
  ========================================================= */

  const [authStatus, assignedTags, lookups, rights] = await Promise.all([
    getCustomerAuthStatus(customer.user_id),

    getCustomerTags(id),

    getCustomerFilterLookups(),

    getMyCustomerAdminRights(),
  ]);

  const staffOptions = lookups.staff.map((staff) => ({
    id: staff.id,
    name: staff.full_name,
  }));

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="flex flex-col gap-6">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <CustomerDetailHeader
        customer={customer}
        assignedTags={assignedTags}
        availableTags={lookups.tags}
        canManage={rights.canManage}
        canDelete={rights.canDelete}
      />

      {/* =====================================================
          MAIN LAYOUT
      ===================================================== */}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ===================================================
            LEFT COLUMN
        =================================================== */}

        <div className="lg:col-span-2">
          <Tabs defaultTab="overview">
            {/* ===============================================
                TAB NAVIGATION
            =============================================== */}

            <TabsList>
              <Tab id="overview">Overview</Tab>

              <Tab id="vehicles">Vehicles / Deals</Tab>

              <Tab id="reservations">Reservations</Tab>

              <Tab id="test-drives">Test Drives</Tab>

              <Tab id="communications">Communications</Tab>

              <Tab id="notes">Notes</Tab>

              <Tab id="activity">Activity</Tab>

              <Tab id="audit">Audit Trail</Tab>

              <Tab id="enquiries">Enquiries</Tab>

              <Tab id="finance">Finance</Tab>

              <Tab id="trade-in">Sell / Trade-In</Tab>

              <Tab id="dream-cars">Dream Cars</Tab>

              <Tab id="wishlist">Wishlist</Tab>
            </TabsList>

            {/* ===============================================
                OVERVIEW
            =============================================== */}

            <TabPanel id="overview">
              <OverviewTab customer={customer} />
            </TabPanel>

            {/* ===============================================
                VEHICLES / DEALS

                The relationship list lives here. The full
                sales panel — deals, reservations, payments and
                totals — is one click away on its own page.
            =============================================== */}

            <TabPanel id="vehicles">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Link
                    href={`/admin/customers/${id}/sales`}
                    className="text-body-sm text-primary-text hover:text-primary-hover focus-visible:ring-primary inline-flex items-center gap-1.5 rounded focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Sales, payments &amp; totals
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </div>

                <VehiclesTab customerId={id} />
              </div>
            </TabPanel>

            {/* ===============================================
                RESERVATIONS
            =============================================== */}

            <TabPanel id="reservations">
              <CustomerReservationsTab customerId={id} />
            </TabPanel>

            {/* ===============================================
                TEST DRIVES
            =============================================== */}

            <TabPanel id="test-drives">
              <CustomerTestDrivesTab customerId={id} />
            </TabPanel>

            {/* ===============================================
                COMMUNICATIONS
            =============================================== */}

            <TabPanel id="communications">
              <CommunicationsTab customerId={id} />
            </TabPanel>

            {/* ===============================================
                NOTES
            =============================================== */}

            <TabPanel id="notes">
              <NotesTab customerId={id} />
            </TabPanel>

            {/* ===============================================
                ACTIVITY
            =============================================== */}

            <TabPanel id="activity">
              <ActivityTab customerId={id} />
            </TabPanel>

            {/* ===============================================
                AUDIT
            =============================================== */}

            <TabPanel id="audit">
              <AuditTrailTab customerId={id} />
            </TabPanel>

            {/* ===============================================
                MODULES NOT BUILT YET

                These say plainly that the module isn't ready,
                rather than claiming the customer has none.
            =============================================== */}

            <TabPanel id="enquiries">
              <FutureModuleTab
                icon={MailQuestion}
                title="Enquiries aren't available yet"
                description="Website enquiries arrive with the Public Website Integration sprint. This customer is already set up to use them."
              />
            </TabPanel>

            <TabPanel id="finance">
              <FutureModuleTab
                icon={Landmark}
                title="Finance isn't available yet"
                description="Finance applications arrive with the Finance & Accounting sprint."
              />
            </TabPanel>

            <TabPanel id="trade-in">
              <FutureModuleTab
                icon={Repeat}
                title="Sell / Trade-In isn't available yet"
                description="Trade-in valuations arrive with a later sprint."
              />
            </TabPanel>

            <TabPanel id="dream-cars">
              <FutureModuleTab
                icon={Sparkles}
                title="Dream Cars aren't available yet"
                description="Dream car requests arrive with the Public Website Integration sprint."
              />
            </TabPanel>

            <TabPanel id="wishlist">
              <FutureModuleTab
                icon={Heart}
                title="Wishlist isn't available yet"
                description="Customer wishlists arrive with the Public Website Integration sprint."
              />
            </TabPanel>
          </Tabs>
        </div>

        {/* ===================================================
            RIGHT COLUMN
        =================================================== */}

        <div className="flex flex-col gap-4">
          {/* ===============================================
              CONTACT
          =============================================== */}

          <CustomerContactCard customer={customer} locationName={customer.location?.name ?? null} />

          {/* ===============================================
              ACCOUNT
          =============================================== */}

          <AccountManagementCard customer={customer} authStatus={authStatus} />

          {/* ===============================================
              PRIMARY RELATIONSHIP MANAGER
          =============================================== */}

          <div className="surface-card p-4">
            <RelationshipManagerCard
              customerId={id}
              currentStaffId={customer.primary_relationship_manager?.id ?? null}
              currentStaffName={customer.primary_relationship_manager?.full_name ?? null}
              staffOptions={staffOptions}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
