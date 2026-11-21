import { notFound } from "next/navigation";
import { getCarDetail } from "@/src/lib/supabase/inventory-detail-queries";
import { getAddCarLookups } from "@/src/lib/supabase/inventory-lookups";
import { currentUserOfferPermissions } from "@/src/lib/supabase/offer-permissions";
import { getCarPromotionsView } from "@/src/lib/supabase/offer-evaluation";
import { currentUserSalesPermissions } from "@/src/lib/supabase/sales-permissions";
import { getVehicleSales } from "@/src/lib/supabase/vehicle-sales-queries";
import { Tabs, TabsList, Tab, TabPanel } from "@/src/components/ui/tabs";
import { VehicleHero } from "@/src/components/inventory/view-car/vehicle-hero";
import { OverviewTab } from "@/src/components/inventory/view-car/tabs/overview-tab";
import { ExteriorInteriorTab } from "@/src/components/inventory/view-car/tabs/exterior-interior-tab";
import { PricingTab } from "@/src/components/inventory/view-car/tabs/pricing-tab";
import { WarrantyInspectionTab } from "@/src/components/inventory/view-car/tabs/warranty-inspection-tab";
import { MediaTab } from "@/src/components/inventory/view-car/tabs/media-tab";
import { PublishingTab } from "@/src/components/inventory/view-car/tabs/publishing-tab";
import { AuditTab } from "@/src/components/inventory/view-car/tabs/audit-tab";
import { VehicleSalesTab } from "@/src/components/inventory/view-car/tabs/sales-tab";

interface ViewCarPageProps {
  params: Promise<{ id: string }>;
}

export default async function ViewCarPage({ params }: ViewCarPageProps) {
  const { id } = await params;

  const [detail, lookups, salesPermissions, offerPermissions] = await Promise.all([
    getCarDetail(id),
    getAddCarLookups(),
    currentUserSalesPermissions(),
    currentUserOfferPermissions(),
  ]);

  if (!detail) {
    notFound();
  }

  const showSales = salesPermissions.view || salesPermissions.reservationsView;
  const sales = showSales ? await getVehicleSales(id) : null;

  /*
   * Gated on offers.view: somebody who can see a car but not campaigns gets
   * the Pricing tab exactly as it was before Sprint 8, with no panel.
   */
  const promotions = offerPermissions.view ? await getCarPromotionsView(id) : null;

  const { car, createdByName, updatedByName, activity } = detail;
  const featuredImage = car.media?.find((m: { is_featured: boolean }) => m.is_featured) ?? car.media?.[0];
  const subtitle = [car.brand?.name, car.model?.name, car.variant?.name].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <VehicleHero
        carId={car.id}
        displayTitle={car.display_title}
        stockId={car.stock_id}
        subtitle={subtitle}
        regularPrice={car.regular_price}
        featuredImageUrl={featuredImage?.url ?? null}
        availabilityStatus={car.availability_status}
        publishingStatus={car.publishing_status}
        collectionName={car.collection?.name ?? null}
        availabilityStatuses={lookups.availabilityStatuses}
        isArchived={!!car.archived_at}
      />

      <Tabs defaultTab="overview">
        <TabsList>
          <Tab id="overview">Overview</Tab>
          <Tab id="exterior-interior">Exterior &amp; Interior</Tab>
          <Tab id="pricing">Pricing &amp; Promotion</Tab>
          <Tab id="warranty-inspection">Warranty &amp; Inspection</Tab>
          <Tab id="media">Media</Tab>
          <Tab id="publishing">Publishing &amp; SEO</Tab>
          {sales && <Tab id="sales">Sales &amp; holds</Tab>}
          <Tab id="audit">Audit &amp; History</Tab>
        </TabsList>

        <TabPanel id="overview">
          <OverviewTab car={car} />
        </TabPanel>
        <TabPanel id="exterior-interior">
          <ExteriorInteriorTab car={car} />
        </TabPanel>
        <TabPanel id="pricing">
          <PricingTab car={car} promotions={promotions} />
        </TabPanel>
        <TabPanel id="warranty-inspection">
          <WarrantyInspectionTab car={car} />
        </TabPanel>
        <TabPanel id="media">
          <MediaTab media={car.media ?? []} />
        </TabPanel>
        <TabPanel id="publishing">
          <PublishingTab car={car} />
        </TabPanel>
        {sales && (
          <TabPanel id="sales">
            <VehicleSalesTab
              carId={car.id}
              data={sales}
              canViewDeals={salesPermissions.view}
              canViewReservations={salesPermissions.reservationsView}
              canCreateDeal={salesPermissions.create && !car.archived_at}
              canRequestReservation={salesPermissions.reservationsRequest && !car.archived_at}
            />
          </TabPanel>
        )}
        <TabPanel id="audit">
          <AuditTab
            car={car}
            createdByName={createdByName}
            updatedByName={updatedByName}
            activity={activity}
          />
        </TabPanel>
      </Tabs>
    </div>
  );
}
